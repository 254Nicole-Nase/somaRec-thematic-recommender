"""Offline metadata search. Controlled concepts constrain; free text ranks within them."""

from collections import defaultdict

import numpy as np

from .bm25 import BM25
from .import_preview import digest
from .taxonomy import validate_taxonomy
from .text import fold_key, tokenize

STOP = set("a an and are about by for i in is of on or the to want with ya wa za na katika kuhusu la s book books show me set located written".split())
# Small, inspectable lexical equivalences shared by query and document tokenization.
WORDS = dict(mashairi="poetry", poems="poetry", novels="novel", memoirs="memoir", plays="play",
             stories="story", hadithi="story", watoto="children", mazingira="environment",
             environmental="environment", jamii="social", familia="family", mabadiliko="change",
             ukandamizaji="repression", uongozi="leadership", kenyan="kenya", voyages="voyage")
LANGUAGES = dict(english="eng", kiswahili="swa", swahili="swa", gikuyu="kik", dholuo="luo", french="fra")
STORY_CONCEPTS = (("form", "story-collection"), ("form", "short-story"), ("genre", "animal-story"))
WEIGHTS = {"themes": 2, "major_subjects": 2, "mood_tone": 2, "narrative_setting": 2,
           "synopsis": 1, "title": 1, "author": 1}


def words(text):
    return [WORDS.get(word, word) for word in tokenize(text)]


def phrases(text):
    tokens = words(text)
    return {pair for pair in zip(tokens, tokens[1:]) if not STOP.intersection(pair)}


def permitted(claim, mode, work_id, field):
    if mode not in {"diagnostic", "approved_only"}:
        raise ValueError("Unknown retrieval mode")
    if not claim.get("evidence") or claim["value"] is None:
        return False
    if claim["status"] == "needs_review":
        return mode == "diagnostic"
    decision = claim.get("human_decision", {})
    original = {key: claim[key] for key in ("value", "evidence", "origin", "note")}
    return (claim["status"] == decision.get("status") == "verified"
            and digest({**original, "status": "needs_review"}) == claim["fingerprint"]
            and decision.get("fingerprint") == claim["fingerprint"]
            and (decision.get("work_id"), decision.get("field")) == (work_id, field))


class Vocabulary:
    def __init__(self, taxonomy):
        categories, aliases = validate_taxonomy(taxonomy)
        self.phrases = defaultdict(set)
        for (dim, _, name), key in aliases.items():
            if categories[key]["status"] == "active" and dim in {"genre", "form", "audience"}:
                self.phrases[tuple(words(name))].add((dim, key))
        self.lengths = sorted({len(p) for p in self.phrases}, reverse=True)

    def reconcile(self, claim):
        value = claim["value"]
        if claim["status"] in {"unknown", "conflicting"} or not claim["evidence"]:
            return {"source_assertion": claim, "normalized_form": None, "basis": "Missing or conflicting evidence."}
        concepts = self.phrases.get(tuple(words(value or "")), set())
        forms = sorted(key for dim, key in concepts if dim == "form")
        return {"source_assertion": claim, "normalized_form": forms[0] if len(forms) == 1 else None,
                "basis": "exact form label or alias" if len(forms) == 1 else
                         "No unique equivalent in the form dimension; retain the legacy value."}

    def interpret(self, query, identity):
        tokens = words(query["query"])
        required = set()
        if query.get("work_language"):
            required.add(("language", query["work_language"]))
        remaining, places = set(), set()
        i = 0
        while i < len(tokens) and not identity:
            token = tokens[i]
            # After an about/kuhusu marker, classification words may themselves be subjects.
            topical = any(t in {"about", "kuhusu"} for t in tokens[:i])
            matched = False
            for length in self.lengths:
                part = tuple(tokens[i:i + length])
                if len(part) != length:
                    continue
                options = self.phrases.get(part, set())
                if len(options) == 1 and not topical:
                    required.update(options)
                    i += length
                    matched = True
                    break
            if matched:
                continue
            if token == "drama" and not topical:
                required.add(("legacy_form", "drama"))
                i += 1
                continue
            language_topic = tokens[i+1:i+2] in (["culture"], ["identity"], ["history"], ["studies"])
            if token in LANGUAGES and not language_topic and (not topical or tokens[i-1] == "in"):
                required.add(("language", LANGUAGES[token]))
            elif token not in STOP:
                remaining.add(token)
                if token in {"kenya", "mombasa", "rural", "village", "city", "coast"} or (i and tokens[i-1] in {"in", "katika"}):
                    places.add(token)
            i += 1
        return {"required": [list(item) for item in sorted(required)],
                "terms": sorted(remaining), "place_terms": sorted(places), "exact_identity": identity}


def evidence(field, claim, tokens, kind):
    return {"field": field, "matched_tokens": sorted(tokens), "status": claim["status"],
            "evidence": claim["evidence"], "origin": claim["origin"], "fingerprint": claim["fingerprint"],
            "kind": kind}


class FieldIndex:
    def __init__(self, documents, vocabulary):
        self.docs = documents
        self.vocabulary = vocabulary
        self.tokens = {
            field: [set(words(doc["text_fields"].get(field, ""))) - STOP for doc in documents]
            for field in WEIGHTS
        }
        self.indices = {field: BM25([" ".join(sorted(terms)) for terms in rows])
                        for field, rows in self.tokens.items()}

    def search(self, query):
        raw = fold_key(query["query"])
        exact = set()
        for i, doc in enumerate(self.docs):
            title = fold_key(doc["text_fields"].get("title", ""))
            author = fold_key(doc["text_fields"].get("author", ""))
            if title and raw in {title, (title + " " + author).strip()}:
                exact.add(i)
        intent = self.vocabulary.interpret(query, bool(exact))
        required = [tuple(pair) for pair in intent["required"]]
        soft = set(intent["terms"])
        if exact:
            soft = set(words(raw)) - STOP
        # A location may support a geographic request. Incidental historical terms in
        # a setting cannot by themselves establish a subject match.
        field_queries = {field: soft.copy() for field in WEIGHTS}
        if len(soft) > 1:
            field_queries["narrative_setting"] = set(intent["place_terms"])
        if required and soft:
            field_queries["title"] = set()
            field_queries["author"] = set()
        if exact:
            field_queries = {field: soft if field in {"title", "author"} else set() for field in WEIGHTS}
        query_phrases = phrases(query["query"])
        values = {field: index.scores(" ".join(sorted(field_queries[field])))
                  for field, index in self.indices.items()}
        details, eligible = {}, []
        scores = np.zeros(len(self.docs))
        for i, doc in enumerate(self.docs):
            if exact and i not in exact:
                continue
            if not doc["text_fields"] and not doc["concepts"]:
                continue
            if any(pair not in doc["concepts"] for pair in required):
                continue
            eligible.append(i)
            matches = []
            if i in exact:
                matches.append(evidence("title", doc["fields"]["title"], [fold_key(doc["title"])], "exact identity lookup"))
            for pair in required:
                field, claim = doc["concepts"][pair]
                matches.append(evidence(field, claim, [pair[1]], pair[0] + " constraint"))
            for field, weight in WEIGHTS.items():
                overlap = self.tokens[field][i] & field_queries[field]
                if overlap:
                    claim = doc["fields"][field]
                    match = evidence(field, claim, overlap, "lexical overlap")
                    raw_values = claim["value"] if isinstance(claim["value"], list) else [claim["value"]]
                    aligned = {pair for value in raw_values for pair in phrases(value) & query_phrases
                               if overlap.issuperset(pair)}
                    match["matched_phrases"] = sorted(" ".join(pair) for pair in aligned)
                    matches.append(match)
                    coverage = len(aligned) / max(1, len(query_phrases))
                    scores[i] += weight * float(values[field][i]) * (1 + coverage)
            # The constraints are binary; synonyms and primary/secondary designations add no boost.
            if required and not soft:
                scores[i] = 1
            story_key = next((key for key in STORY_CONCEPTS if key in doc["concepts"]), None)
            if "story" in soft and story_key:
                field, claim = doc["concepts"][story_key]
                matches.append(evidence(field, claim, [story_key[1]], "story-related classification"))
                scores[i] += 1
            # Geography alone is weak support when the reader also asks for a subject.
            content_terms = soft - set(intent["place_terms"])
            if intent["place_terms"] and content_terms and not any(
                content_terms.intersection(match["matched_tokens"]) for match in matches
                if match["kind"] == "lexical overlap"
            ):
                scores[i] = 0
            details[i] = matches
        return intent, scores, eligible, exact.intersection(eligible), details
