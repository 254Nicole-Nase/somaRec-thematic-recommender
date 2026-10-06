// Search and recommendation logic for the somarec-api Edge Function.
// A port of backend/somarec/{text,bm25,engine,catalog,cbc}.py; keep the two in step.
// Pure TypeScript with no Deno or Supabase APIs, so it can be tested under Node.

export type BookRow = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  cover_url: string | null;
  published_year: number | null;
  isbn10: string | null;
  isbn13: string | null;
  language: string | null;
  language_source: string | null;
  themes: string[] | null;
  theme_source: string | null;
  publisher: string | null;
  ol_work_key: string | null;
  curation_status: string | null;
  access_type: string | null;
  access_url: string | null;
  license: string | null;
};

export const RRF_K = 60;
export const KEYWORD_WEIGHT = 1.0;
export const SEMANTIC_WEIGHT = 0.5;
export const CANDIDATES = 100;
export const MIN_DENSE_SCORE = 0.2;
export const MAX_TOP_K = 100;

// ------------------------------------------------------------------ text
const APOSTROPHES = /[\u2019\u2018\u02bc\u02bb`\u00b4]/g;
// Letters NFKD doesn't decompose; unidecode maps these on the Python side.
const EXTRA_FOLDS: Record<string, string> = {
  "\u00f8": "o", "\u00e6": "ae", "\u0153": "oe", "\u00df": "ss", "\u0111": "d", "\u0142": "l", "\u014b": "n", "\u0131": "i",
};

export function foldKey(text: string | null | undefined): string {
  let s = (text ?? "").replace(APOSTROPHES, "'").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  s = s.replace(/[\u00f8\u00e6\u0153\u00df\u0111\u0142\u014b\u0131]/g, (c) => EXTRA_FOLDS[c] ?? c);
  return s.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenize(text: string | null | undefined): string[] {
  const key = foldKey(text);
  return key ? key.split(" ") : [];
}

export function denseText(b: BookRow): string {
  const parts = [`${b.title} by ${b.author ?? ""}`.trim()];
  if (b.description) parts.push(b.description);
  return parts.join(". ");
}

function keywordText(b: BookRow): string {
  // Title and author repeated so they outweigh incidental words in long descriptions.
  const a = b.author ?? "";
  return `${b.title} ${b.title} ${a} ${a} ${b.description ?? ""}`;
}

// ------------------------------------------------------------------ BM25
export class BM25 {
  private termFreqs: Map<string, number>[];
  private docLen: number[];
  private avgLen: number;
  private idf = new Map<string, number>();

  constructor(documents: string[], private k1 = 1.5, private b = 0.75) {
    const tokens = documents.map(tokenize);
    this.docLen = tokens.map((t) => t.length);
    this.avgLen = this.docLen.length ? this.docLen.reduce((x, y) => x + y, 0) / this.docLen.length : 0;
    this.termFreqs = tokens.map((t) => {
      const m = new Map<string, number>();
      for (const w of t) m.set(w, (m.get(w) ?? 0) + 1);
      return m;
    });
    const df = new Map<string, number>();
    for (const m of this.termFreqs) for (const w of m.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    const n = tokens.length;
    for (const [w, f] of df) this.idf.set(w, Math.log(1 + (n - f + 0.5) / (f + 0.5)));
  }

  scores(query: string): Float64Array {
    const out = new Float64Array(this.docLen.length);
    const terms = tokenize(query).filter((t) => this.idf.has(t));
    if (!terms.length || this.avgLen === 0) return out;
    for (let i = 0; i < out.length; i++) {
      const norm = this.k1 * (1 - this.b + (this.b * this.docLen[i]) / this.avgLen);
      for (const t of terms) {
        const tf = this.termFreqs[i].get(t) ?? 0;
        if (tf) out[i] += (this.idf.get(t)! * tf * (this.k1 + 1)) / (tf + norm);
      }
    }
    return out;
  }
}

// --------------------------------------------------------------- engine
type Ranked = [number, number]; // [book index, score]
type Parts = Record<string, { rank: number; score: number } | boolean>;

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function topIndices(scores: ArrayLike<number>, k: number, keep: (i: number, s: number) => boolean): Ranked[] {
  const idx = Array.from({ length: scores.length }, (_, i) => i).filter((i) => keep(i, scores[i]));
  idx.sort((a, b) => scores[b] - scores[a] || a - b);
  return idx.slice(0, k).map((i) => [i, scores[i]]);
}

export class Engine {
  readonly books: BookRow[];
  private bm25: BM25;
  private titleIndex = new Map<string, number[]>();
  private idToIndex = new Map<string, number>();
  // One unit-length vector per book, or null while it hasn't been embedded yet.
  vectors: (Float32Array | null)[];

  constructor(books: BookRow[], vectors?: (Float32Array | null)[]) {
    // Same order as the Python catalog (pandas sorts by code point).
    this.books = [...books].sort((a, b) => cmp(a.author ?? "", b.author ?? "") || cmp(a.title, b.title));
    this.books.forEach((b, i) => {
      this.idToIndex.set(b.id, i);
      for (const key of new Set([foldKey(b.title), foldKey(b.title.split(":")[0].split("(")[0])])) {
        if (!key) continue;
        if (!this.titleIndex.has(key)) this.titleIndex.set(key, []);
        this.titleIndex.get(key)!.push(i);
      }
    });
    this.bm25 = new BM25(this.books.map(keywordText));
    this.vectors = vectors ?? this.books.map(() => null);
  }

  index(id: string): number | undefined {
    return this.idToIndex.get(id);
  }

  embeddedCount(): number {
    return this.vectors.filter(Boolean).length;
  }

  private keywordRanking(query: string): Ranked[] {
    return topIndices(this.bm25.scores(query), CANDIDATES, (_, s) => s > 0);
  }

  private denseRanking(q: Float32Array, exclude?: number): Ranked[] {
    const sims = this.vectors.map((v) => {
      if (!v) return -Infinity;
      let s = 0;
      for (let k = 0; k < v.length; k++) s += v[k] * q[k];
      return s;
    });
    return topIndices(sims, CANDIDATES, (i, s) => i !== exclude && s >= MIN_DENSE_SCORE);
  }

  rank(query: string, queryVector: Float32Array | null, mode = "hybrid"): [number, number, Parts][] {
    query = (query ?? "").trim();
    if (!query) return [];
    if (!queryVector) mode = "keyword";
    const rankings: [string, Ranked[], number][] = [];
    let pinned: number[] = [];
    if (mode === "hybrid" || mode === "keyword") {
      rankings.push(["keyword", this.keywordRanking(query), KEYWORD_WEIGHT]);
      pinned = this.titleIndex.get(foldKey(query)) ?? [];
    }
    if ((mode === "hybrid" || mode === "dense") && queryVector) {
      rankings.push(["semantic", this.denseRanking(queryVector), SEMANTIC_WEIGHT]);
    }
    const fused = new Map<number, number>();
    const parts = new Map<number, Parts>();
    for (const [name, ranking, weight] of rankings) {
      ranking.forEach(([i, score], rank) => {
        fused.set(i, (fused.get(i) ?? 0) + weight / (RRF_K + rank + 1));
        if (!parts.has(i)) parts.set(i, {});
        parts.get(i)![name] = { rank: rank + 1, score: round(score, 4) };
      });
    }
    const pinnedSet = new Set(pinned);
    for (const i of pinned) {
      if (!parts.has(i)) parts.set(i, {});
      parts.get(i)!.exact_title = true;
      if (!fused.has(i)) fused.set(i, 0);
    }
    const order = [...fused.keys()].sort(
      (a, b) => Number(pinnedSet.has(b)) - Number(pinnedSet.has(a)) || fused.get(b)! - fused.get(a)! || a - b,
    );
    return order.map((i) => [i, fused.get(i)!, parts.get(i)!]);
  }

  search(query: string, queryVector: Float32Array | null, topK = 10, mode = "hybrid", language?: string | null, theme?: string | null) {
    const out = [];
    for (const [i, score, parts] of this.rank(query, queryVector, mode)) {
      const row = this.books[i];
      if (language && (row.language ?? "").toLowerCase() !== language.toLowerCase()) continue;
      if (theme && !(row.themes ?? []).includes(theme)) continue;
      out.push({ ...bookToApi(row), similarity_score: round(score, 5), match: parts });
      if (out.length >= topK) break;
    }
    return out;
  }

  get(id: string) {
    const i = this.idToIndex.get(id);
    return i === undefined ? null : bookToApi(this.books[i]);
  }

  similar(id: string, topK = 6, maxPerAuthor = 2, excludeSameAuthor = false) {
    const i = this.idToIndex.get(id);
    if (i === undefined) return null;
    const seedAuthor = this.books[i].author;
    const v = this.vectors[i];
    const ranking = v
      ? this.denseRanking(v, i)
      : this.keywordRanking(keywordText(this.books[i])).filter(([j]) => j !== i);
    const perAuthor = new Map<string, number>();
    const out = [];
    for (const [j, score] of ranking) {
      const author = this.books[j].author ?? "";
      if (excludeSameAuthor && author === seedAuthor) continue;
      const n = perAuthor.get(author) ?? 0;
      if (n >= maxPerAuthor) continue;
      perAuthor.set(author, n + 1);
      out.push({ ...bookToApi(this.books[j]), similarity_score: round(score, 4) });
      if (out.length >= topK) break;
    }
    return out;
  }

  byAuthor(id: string, topK = 6) {
    const i = this.idToIndex.get(id);
    if (i === undefined) return null;
    const author = this.books[i].author;
    return this.books.filter((b, j) => j !== i && b.author === author).slice(0, topK).map(bookToApi);
  }

  allBooks() {
    return this.books.map(bookToApi);
  }

  themes() {
    const counts = new Map<string, number>();
    for (const b of this.books) for (const t of b.themes ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => cmp(a, b)).map(([name, books]) => ({ name, books }));
  }

  languages() {
    return [...new Set(this.books.map((b) => b.language).filter((l): l is string => !!l))].sort();
  }
}

// --------------------------------------------------------------- API shape
export function whereToFind(b: BookRow) {
  const links: { label: string; url: string; kind: string }[] = [];
  if (b.access_url) {
    let label = b.access_type === "read" ? "Read free" : "Get this book";
    if (b.license) label += ` (${b.license})`;
    links.push({ label, url: b.access_url, kind: b.access_type || "find" });
  }
  const query = encodeURIComponent(`${b.title} ${b.author ?? ""}`.trim()).replace(/%20/g, "+");
  const work = (b.ol_work_key ?? "").replace(/^\/?works\//, "");
  links.push({
    label: "Open Library",
    url: work ? `https://openlibrary.org/works/${work}` : `https://openlibrary.org/search?q=${query}`,
    kind: "find",
  });
  const isbn = b.isbn13 || b.isbn10;
  links.push({
    label: "Google Books",
    url: isbn ? `https://books.google.com/books?vid=ISBN${isbn}` : `https://www.google.com/search?tbm=bks&q=${query}`,
    kind: "find",
  });
  links.push({ label: "Find in a library (WorldCat)", url: `https://search.worldcat.org/search?q=${query}`, kind: "find" });
  return links;
}

export function bookToApi(b: BookRow) {
  return {
    id: b.id,
    title: b.title,
    author: b.author ?? "",
    year: b.published_year,
    published_year: b.published_year,
    language: b.language || "Unknown",
    language_source: b.language_source ?? "",
    genre: "",
    description: b.description ?? "",
    coverImage: b.cover_url ?? "",
    cover_url: b.cover_url ?? "",
    publisher: b.publisher ?? "",
    isbn13: b.isbn13 ?? "",
    themes: b.themes ?? [],
    theme_source: b.theme_source ?? "",
    curation_status: b.curation_status ?? "unreviewed",
    access_type: b.access_type || "find",
    access_url: b.access_url ?? "",
    license: b.license ?? "",
    where_to_find: whereToFind(b),
  };
}

// -------------------------------------------------------------------- CBC
export const LEVELS = [
  "Pre-Primary (PP1-PP2)",
  "Lower Primary (Grade 1-3)",
  "Upper Primary (Grade 4-6)",
  "Junior School (Grade 7-9)",
  "Senior School (Grade 10-12)",
];

export const LEARNING_AREAS = [
  "English",
  "Kiswahili",
  "Indigenous Languages",
  "Literature in English",
  "Fasihi ya Kiswahili",
  "Social Studies",
  "Religious Education",
];

const LANGUAGE_TO_AREAS: Record<string, string[]> = {
  English: ["English", "Literature in English"],
  Kiswahili: ["Kiswahili", "Fasihi ya Kiswahili"],
  Gikuyu: ["Indigenous Languages"],
};

export const FOCUS_AREAS: Record<string, string> = {
  "Communication and Collaboration": "dialogue, storytelling, speeches, letters, people working together",
  "Critical Thinking and Problem Solving": "moral dilemmas, injustice, difficult choices, questioning power",
  "Creativity and Imagination": "poetry, folktales, myths, imaginative stories, drama",
  "Citizenship": "patriotism, national unity, civic duty, governance, independence struggle, social justice",
  "Learning to Learn": "education, school, curiosity, growing up and self-discovery",
  "Self-efficacy": "resilience, ambition, overcoming hardship, self-belief",
  "Value: Integrity": "honesty, corruption, truth and deception",
  "Value: Respect": "respect for elders, culture, other communities and traditions",
  "Value: Social Justice": "equality, oppression, land injustice, the poor and powerless",
  "Value: Peace and Unity": "ethnic harmony, reconciliation, conflict and peace between communities",
  "Issue: Environmental Education": "conservation, forests, wildlife, climate, land and nature",
  "Issue: Gender and Society": "women's rights, girls' education, gender roles",
};

export function cbcQuery(focus: string): string | null {
  if (!focus || !(focus in FOCUS_AREAS)) return null;
  return `${focus.split(": ").pop()}: ${FOCUS_AREAS[focus]}`;
}

export type Alignment = {
  book_id: string;
  level: string | null;
  learning_area: string | null;
  focus: string | null;
  notes: string | null;
  status: string;
  source: string | null;
  reviewed_by: string | null;
  reviewed_on: string | null;
};

export function cbcReviewed(engine: Engine, alignments: Alignment[], level?: string | null, area?: string | null, focus?: string | null) {
  const out = [];
  for (const a of alignments) {
    if (a.status !== "reviewed") continue;
    if (level && a.level !== level) continue;
    if (area && a.learning_area !== area) continue;
    if (focus && a.focus !== focus) continue;
    const book = engine.get(a.book_id);
    if (!book) continue;
    const { book_id: _, ...cbc } = a;
    out.push({ ...book, cbc });
  }
  return out;
}

export function cbcSuggested(engine: Engine, queryVector: Float32Array | null, area?: string | null, focus?: string | null, topK = 12, excludeIds = new Set<string>()) {
  const query = focus ? cbcQuery(focus) : null;
  if (!query) return [];
  const languages = Object.entries(LANGUAGE_TO_AREAS).filter(([, areas]) => area && areas.includes(area)).map(([l]) => l);
  const out = [];
  for (const book of engine.search(query, queryVector, topK * 4, "hybrid")) {
    if (excludeIds.has(book.id)) continue;
    if (languages.length && !languages.includes(book.language)) continue;
    // Books without a description give the ranking nothing to go on.
    if (book.description.length < 80) continue;
    out.push({
      ...book,
      cbc: {
        level: "",
        learning_area: area ?? "",
        focus,
        status: "suggested",
        notes: "Suggested from the book's description. Check reading level and suitability before use.",
      },
    });
    if (out.length >= topK) break;
  }
  return out;
}
