// Run: node --experimental-transform-types --test supabase/functions/somarec-api/engine.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { type BookRow, bookToApi, Engine, foldKey } from "./engine.ts";

const book = (id: string, title: string, author: string, description = "", extra: Partial<BookRow> = {}): BookRow => ({
  id, title, author, description, cover_url: "", published_year: 1977, isbn10: "", isbn13: "", language: "English",
  language_source: "metadata", themes: [], theme_source: "model", publisher: "", ol_work_key: "", curation_status: "unreviewed",
  access_type: "find", access_url: "", license: "", ...extra,
});

const books = [
  book("1", "Petals of Blood", "Ngũgĩ wa Thiong'o", "Four lives in the village of Ilmorog after independence."),
  book("2", "Blood on the Petals", "Someone Else", "A novel about blood, petals and blood again, petals of every kind."),
  book("3", "Weep Not, Child", "Ngũgĩ wa Thiong'o", "Growing up during the Mau Mau emergency."),
];

test("folding matches the Python fold_key", () => {
  assert.equal(foldKey("Ngũgĩ wa Thiongʼo"), "ngugi wa thiong o");
  assert.equal(foldKey("  Lévi-Strauss "), "levi strauss");
});

test("an exact title always ranks first", () => {
  const e = new Engine(books);
  const ids = e.search("petals of blood", null, 3, "keyword").map((b) => b.id);
  assert.equal(ids[0], "1");
});

test("accent-free queries find accented authors", () => {
  const e = new Engine(books);
  assert.ok(e.search("ngugi thiongo", null, 5, "keyword").some((b) => b.id === "3"));
});

test("dense ranking uses stored vectors and skips books without one", () => {
  const v = (x: number, y: number) => Float32Array.from([x, y]);
  const e = new Engine(books, undefined);
  e.vectors = e.books.map((b) => (b.id === "3" ? v(1, 0) : b.id === "1" ? v(0, 1) : null));
  const ids = e.search("growing up", v(1, 0), 3, "dense").map((b) => b.id);
  assert.deepEqual(ids, ["3"]);
});

test("Open Library links handle both work-key forms", () => {
  for (const key of ["OL56150W", "/works/OL56150W"]) {
    const links = bookToApi(book("9", "T", "A", "", { ol_work_key: key })).where_to_find;
    assert.equal(links[0].url, "https://openlibrary.org/works/OL56150W");
  }
});
