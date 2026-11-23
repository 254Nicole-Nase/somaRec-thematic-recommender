"""Build offline review materials and a compatible corrections input. No retrieval."""

import argparse
from pathlib import Path

from catalog_v2 import SAMPLE, load_json, save_json
from somarec.editorial_review import build_review

EDITORIAL = SAMPLE / "editorial"
READINESS = SAMPLE / "readiness"
PILOT = {
    "juices": "Indiana University identifies Jared Angira and transcribes the subtitle [poems]. Two 1970 edition records still need reconciliation.",
    "sauti-ya-dhiki": "CiNii describes poems in Swahili for the 2012 revised edition; the linked 1973 edition is a separate manifestation. Check the title-case variation.",
    "maua-kwenye-jua-la-asubuhi": "The distributor's bibliography designates the work tamthilia. The author independently identifies the 2004 play in a scholarly personal account. Distinguish book and video versions.",
    "petals-of-blood": "The author's work page identifies this title as a novel. This ballot covers form alone.",
    "betrayal-in-the-city": "Read the title statement in MARC 245, including the subtitle and responsibility. The imprint identifies the 1976 edition.",
    "kidagaa-kimemwozea": "Check the use of riwaya for this title in the Kibabii University record. Toleo la Shule identifies the school edition.",
    "dust": "Check the named author and the reviews on the publisher page. Other works titled Dust cannot supply evidence.",
}
PENGUIN_BIBLIOGRAPHY = "https://www.penguin.co.nz/books/a-grain-of-wheat-9780141186993"
RETAINED = {
    "dreams-in-a-time-of-war": "Penguin’s author biography names this work among Ngũgĩ’s memoirs.",
    "in-the-house-of-the-interpreter": "Penguin’s author biography names this work among Ngũgĩ’s memoirs.",
    "hot-hippo": "Hachette classifies the identified paperback as a picture storybook.",
    "laughing-giraffe": "Hachette classifies the identified paperback as a picture storybook.",
    "jua-na-upepo": "UEAB lists the several stories in the contents of the Matindi volume.",
    "mirrors-of-my-life": "Rebeka Njau’s bibliography identifies her memoir by title.",
    "one-day-i-will-write-about-this-place": "Granta’s listing includes a work-specific review calling Wainaina’s book a memoir.",
    "siku-njema": "The comparative study identifies Walibora’s work as a riwaya.",
    "silent-voices": "The African Union library transcribes Silent voices: poems and identifies the Heinemann edition.",
    "the-dragonfly-sea": "Owuor’s publisher identifies the novel. Both legacy candidates and the empty edition list remain open.",
    "the-house-of-rust": "The Macmillan listing explicitly designates Bajaber’s work a novel.",
    "the-river-and-the-source": "African Books Collective identifies Ogola’s novel. The synopsis dispute is separate.",
    "unbowed": "The publisher’s edition identifies the book as Unbowed: A Memoir.",
}
SUPPLEMENTAL = {
    "dreams-in-a-time-of-war": PENGUIN_BIBLIOGRAPHY,
    "in-the-house-of-the-interpreter": PENGUIN_BIBLIOGRAPHY,
    "unbowed": "https://www.penguinrandomhouse.com/books/104884/unbowed-by-wangari-maathai/",
}
UNRESOLVED = {
    "the-challenge-for-africa": ("The publisher describes an argument about development. Check the contents or a form-specific authority record before calling it a collection or another narrower form.",
                                 "https://www.penguinrandomhouse.com/books/104883/the-challenge-for-africa-by-wangari-maathai/9780307390288/"),
    "replenishing-the-earth": ("The publisher identifies spiritual and environmental concerns. A contents page or bibliographic designation is needed to distinguish guide, reflections or essay collection.",
                                "https://www.penguinrandomhouse.com/books/200491/replenishing-the-earth-by-wangari-maathai/"),
}


def prepare():
    catalog = load_json(SAMPLE / "sample.json")
    corrections = load_json(EDITORIAL / "corrections.json")
    extra = load_json(READINESS / "form_proposals.json")
    for wid, fields in extra.items():
        if set(fields) != {"literary_form"} or "literary_form" in corrections.get(wid, {}):
            raise ValueError(f"Expected a new, form-only replacement for {wid}")
        corrections.setdefault(wid, {}).update(fields)
    review = build_review(catalog, load_json(SAMPLE / "quality.json"), load_json(EDITORIAL / "proposals.json"),
                          [], taxonomy=load_json(EDITORIAL / "taxonomy.v1.json"),
                          assignments=load_json(EDITORIAL / "assignments.json"), corrections=corrections)
    current = {p["work_id"]: p["fields"]["literary_form"] for p in
               load_json(EDITORIAL / "generated/literary_profiles.json")["profiles"]}
    queue = {r["work_id"]: r for r in review["queue"]}
    audit, packet = [], []
    for profile in review["profiles"]:
        wid = profile["work_id"]
        row = queue[wid]
        claim = profile["fields"]["literary_form"]
        old = current[wid]
        if wid in extra and old["fingerprint"] != extra[wid]["literary_form"]["replaces"]:
            raise ValueError(f"Frozen form differs from replacement evidence for {wid}")
        finding = "replacement proposed" if wid in extra else "retained"
        reason = extra[wid]["literary_form"]["reason"] if wid in extra else RETAINED.get(wid, PILOT.get(wid))
        sources = claim["evidence"]
        if wid in SUPPLEMENTAL:
            sources = [*sources, SUPPLEMENTAL[wid]]
        if wid in UNRESOLVED:
            finding = "unresolved"
            reason, source = UNRESOLVED[wid]
            sources = [*sources, source]
        if not reason:
            raise ValueError(f"Missing audit finding for {wid}")
        audit.append({"work_id": wid, "title": row["title"], "author": row["author"], "field": "literary_form",
                      "finding": finding, "reason": reason, "evidence": sources, "original": old, "candidate": claim})
        if wid in PILOT:
            packet.append({"work_id": wid, "title": row["title"], "author": row["author"], "field": "literary_form",
                           "frozen_assertion": old, "ballot_assertion": claim, "evidence_note": PILOT[wid],
                           "additional_evidence": ["https://www.ceeol.com/search/article-detail?id=844018"]
                           if wid == "maua-kwenye-jua-la-asubuhi" else [],
                           "work_identity": row["fields"]["work_identity"], "source_candidates": row["source_candidates"],
                           "edition_candidate_ids": [e["edition_id"] for e in row["edition_reviews"]],
                           "isbn_conflicts": row["isbn_conflicts"], "legacy_mapping": row["fields"]["legacy_mapping"]})
    return {"form_audit.json": audit, "review_packet.json": packet, "pilot_corrections.json": corrections}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, type=Path)
    output = parser.parse_args().output_dir
    output.mkdir(parents=True, exist_ok=True)
    for filename, data in prepare().items():
        save_json(output / filename, data)
