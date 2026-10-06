// somarec-api: the SomaRec search API as a Supabase Edge Function.
// Serves the same /api/* routes and JSON as backend/app.py, so the website only
// needs VITE_API_URL=https://<project>.supabase.co/functions/v1/somarec-api
//
// Search is hybrid: BM25 keywords + gte-small embeddings (Supabase's built-in
// model), fused with weighted reciprocal rank fusion. Book vectors are stored in
// public.book_embeddings; books without one are embedded a few at a time after
// responses are sent, so new or edited books are picked up automatically.
//
// Deploy: supabase functions deploy somarec-api --no-verify-jwt
// (read-only public data, so no JWT is required.)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  type Alignment,
  type BookRow,
  cbcReviewed,
  cbcQuery,
  cbcSuggested,
  denseText,
  Engine,
  FOCUS_AREAS,
  LEARNING_AREAS,
  LEVELS,
  MAX_TOP_K,
} from "./engine.ts";

const MODEL = "gte-small";
const CACHE_TTL_MS = 10 * 60 * 1000;
const EMBED_BATCH = 2; // Edge Functions get ~2 s of CPU per request; each embedding takes a few hundred ms
const MAX_EMBED_CHARS = 2000; // gte-small reads ~512 tokens; the rest would be cut anyway

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const READ_KEY = SERVICE_KEY || Deno.env.get("SUPABASE_ANON_KEY")!;

const BOOK_COLUMNS = [
  "id", "title", "author", "description", "cover_url", "published_year", "isbn10", "isbn13",
  "language", "language_source", "themes", "theme_source", "publisher", "ol_work_key",
  "curation_status", "access_type", "access_url", "license",
].join(",");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const session = new Supabase.ai.Session(MODEL);

async function embed(text: string): Promise<Float32Array> {
  const out = await session.run(text.slice(0, MAX_EMBED_CHARS), { mean_pool: true, normalize: true });
  return Float32Array.from(out as number[]);
}

async function textHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${MODEL}|${text}`));
  return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function rest<T>(path: string, init: RequestInit = {}, key = READ_KEY): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]}: ${res.status} ${await res.text()}`);
  const body = await res.text(); // writes with return=minimal answer with an empty body
  return (body ? JSON.parse(body) : undefined) as T;
}

async function fetchAll<T>(table: string, query: string, key = READ_KEY): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await rest<T[]>(`${table}?${query}&limit=1000&offset=${offset}`, {}, key);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

type State = {
  engine: Engine;
  alignments: Alignment[];
  hashes: string[]; // hash of each book's current text, aligned with engine.books
  // Stored vectors (~2 MB) load in the background; only routes that rank by meaning wait for them.
  vectorsReady: Promise<void>;
  loadedAt: number;
};

let current: Promise<State> | null = null;
let currentAt = 0;
let backfilling = false;

async function load(): Promise<State> {
  const [books, alignments] = await Promise.all([
    fetchAll<BookRow>("books", `select=${BOOK_COLUMNS}&status=eq.published&order=id`),
    fetchAll<Alignment>(
      "book_curriculum",
      "select=book_id,level,learning_area,focus,notes,status,source,reviewed_by,reviewed_on&status=eq.reviewed",
    ),
  ]);
  const engine = new Engine(books);
  const hashes = await Promise.all(engine.books.map((b) => textHash(denseText(b))));
  const vectorsReady = (async () => {
    if (!SERVICE_KEY) return;
    const stored = await fetchAll<{ book_id: string; embedding: string; text_hash: string }>(
      "book_embeddings", `select=book_id,embedding,text_hash&model=eq.${MODEL}`, SERVICE_KEY,
    );
    for (const row of stored) {
      const i = engine.index(row.book_id);
      if (i !== undefined && hashes[i] === row.text_hash) {
        engine.vectors[i] = Float32Array.from(JSON.parse(row.embedding));
      }
    }
  })().catch((err) => console.error("loading vectors failed; keyword search only", err));
  return { engine, alignments, hashes, vectorsReady, loadedAt: Date.now() };
}

function state(): Promise<State> {
  if (!current || Date.now() - currentAt > CACHE_TTL_MS) {
    currentAt = Date.now();
    const next = load();
    // Keep serving the previous state if a reload fails.
    const previous = current;
    current = next.catch((err) => {
      console.error("load failed", err);
      if (previous) return previous;
      current = null;
      throw err;
    });
  }
  return current;
}

// Embed a few books that have no (current) vector, and store them.
async function backfill(s: State) {
  if (backfilling) return;
  backfilling = true;
  try {
    const todo = s.engine.vectors.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0).slice(0, EMBED_BATCH);
    const rows = [];
    for (const i of todo) {
      const book = s.engine.books[i];
      s.engine.vectors[i] = await embed(denseText(book));
      rows.push({
        book_id: book.id,
        embedding: `[${Array.from(s.engine.vectors[i]!).join(",")}]`,
        model: MODEL,
        text_hash: s.hashes[i],
        updated_at: new Date().toISOString(),
      });
    }
    if (rows.length && SERVICE_KEY) {
      await rest("book_embeddings?on_conflict=book_id", {
        method: "POST",
        body: JSON.stringify(rows),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      }, SERVICE_KEY);
    }
  } catch (err) {
    console.error("backfill failed", err);
  } finally {
    backfilling = false;
  }
}

async function queryVector(s: State, text: string): Promise<Float32Array | null> {
  if (s.engine.embeddedCount() === 0) return null;
  try {
    return await embed(text);
  } catch (err) {
    console.error("query embedding failed; falling back to keywords", err);
    return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function topK(params: URLSearchParams, fallback: number): number {
  const n = parseInt(params.get("top_k") ?? "", 10);
  return Math.max(1, Math.min(Number.isFinite(n) && n > 0 ? n : fallback, MAX_TOP_K));
}

async function route(req: Request, s: State): Promise<Response> {
  const url = new URL(req.url);
  const at = url.pathname.indexOf("/api/");
  const path = at >= 0 ? url.pathname.slice(at) : url.pathname;
  const p = url.searchParams;
  const e = s.engine;
  let m: RegExpMatchArray | null;
  if (/^\/api\/(health|search|recommend|cbc$|books\/[^/]+\/similar$)/.test(path)) await s.vectorsReady;

  if (path === "/api/health") {
    const embedded = e.embeddedCount();
    return json({
      status: "ok",
      books: e.books.length,
      mode: embedded ? "hybrid" : "keyword",
      embedding_model: MODEL,
      books_embedded: embedded,
      themes_tagged: e.books.filter((b) => (b.themes ?? []).length).length,
      theme_source: "model",
      reviewed_cbc_alignments: s.alignments.length,
    });
  }
  if (path === "/api/books") {
    const language = p.get("language");
    const theme = p.get("theme");
    return json(
      e.allBooks().filter((b) =>
        (!language || b.language.toLowerCase() === language.toLowerCase()) && (!theme || b.themes.includes(theme))
      ),
    );
  }
  if ((m = path.match(/^\/api\/books\/([^/]+)\/similar$/))) {
    const found = e.similar(decodeURIComponent(m[1]), topK(p, 6), 2, p.get("exclude_same_author") === "1");
    return found ? json(found) : json({ error: "Book not found" }, 404);
  }
  if ((m = path.match(/^\/api\/books\/([^/]+)\/by-author$/))) {
    const found = e.byAuthor(decodeURIComponent(m[1]), topK(p, 6));
    return found ? json(found) : json({ error: "Book not found" }, 404);
  }
  if ((m = path.match(/^\/api\/books\/([^/]+)$/))) {
    const found = e.get(decodeURIComponent(m[1]));
    return found ? json(found) : json({ error: "Book not found" }, 404);
  }
  if (path === "/api/recommend") {
    const id = p.get("book_id");
    if (!id) return json({ error: "A 'book_id' query parameter is required." }, 400);
    return json(e.similar(id, topK(p, 6)) ?? []);
  }
  if (path === "/api/search") {
    const q = (p.get("q") ?? "").trim();
    if (!q) return json({ error: "A 'q' query parameter is required." }, 400);
    const mode = p.get("mode") ?? "hybrid";
    if (!["hybrid", "keyword", "dense"].includes(mode)) return json({ error: "mode must be hybrid, keyword or dense" }, 400);
    const qv = mode === "keyword" ? null : await queryVector(s, q);
    return json(e.search(q, qv, topK(p, 10), mode, p.get("language"), p.get("theme")));
  }
  if (path === "/api/themes") return json(e.themes().map((t) => t.name));
  if (path === "/api/themes/stats") return json(e.themes());
  if (path === "/api/languages") return json(e.languages());
  if (path === "/api/genres") return json([]); // genre isn't in the harvested metadata yet
  if (path === "/api/cbc/options") {
    return json({
      levels: LEVELS,
      learning_areas: LEARNING_AREAS,
      focus_areas: Object.entries(FOCUS_AREAS).map(([name, description]) => ({ name, description })),
    });
  }
  if (path === "/api/cbc") {
    const level = p.get("level");
    const area = p.get("learning_area");
    const focus = p.get("focus");
    const reviewed = cbcReviewed(e, s.alignments, level, area, focus);
    const query = focus ? cbcQuery(focus) : null;
    const qv = query ? await queryVector(s, query) : null;
    const suggested = cbcSuggested(e, qv, area, focus, topK(p, 12), new Set(reviewed.map((b) => b.id)));
    return json({ reviewed, suggested });
  }
  return json({ error: "Not found" }, 404);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    const s = await state();
    const res = await route(req, s);
    EdgeRuntime.waitUntil(
      s.vectorsReady.then(() => (s.engine.embeddedCount() < s.engine.books.length ? backfill(s) : undefined)),
    );
    return res;
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});
