"""Competency-Based Curriculum (CBC) alignment.

Two kinds of alignment, always labelled so teachers know which is which:

  reviewed   - rows in data/cbc_alignment.csv entered or checked by a teacher,
               with who reviewed it and the source (e.g. a KICD approved list).
  suggested  - computed on the fly from a book's language and content. These
               never claim a grade level: reading level can't be judged from
               metadata, so a teacher has to confirm it.

The earlier generate_sample_cbc_data.py assigned grades and competencies at
random; that data should be deleted (see supabase/migrations).

Level and learning-area names follow the CBC structure (Early Years to Senior
School). Check them against the current KICD curriculum designs before relying
on them in a school.
"""

import os

import pandas as pd

ALIGNMENT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "cbc_alignment.csv")

LEVELS = [
    "Pre-Primary (PP1-PP2)",
    "Lower Primary (Grade 1-3)",
    "Upper Primary (Grade 4-6)",
    "Junior School (Grade 7-9)",
    "Senior School (Grade 10-12)",
]

LEARNING_AREAS = [
    "English",
    "Kiswahili",
    "Indigenous Languages",
    "Literature in English",
    "Fasihi ya Kiswahili",
    "Social Studies",
    "Religious Education",
]

LANGUAGE_TO_AREAS = {
    "English": ["English", "Literature in English"],
    "Kiswahili": ["Kiswahili", "Fasihi ya Kiswahili"],
    "Gikuyu": ["Indigenous Languages"],
}

# Core competencies and national values, each with a short description used to
# rank books by content. Suggestions only; a teacher confirms fit.
FOCUS_AREAS = {
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
}

ALIGNMENT_COLUMNS = [
    "book_id", "level", "learning_area", "focus", "notes",
    "status", "source", "reviewed_by", "reviewed_on",
]


def load_alignments(path: str = ALIGNMENT_CSV) -> pd.DataFrame:
    if not os.path.exists(path):
        return pd.DataFrame(columns=ALIGNMENT_COLUMNS)
    df = pd.read_csv(path, dtype=str).fillna("")
    for col in ALIGNMENT_COLUMNS:
        if col not in df.columns:
            df[col] = ""
    # Only reviewed rows are served as alignments; anything else is a draft.
    return df[df["status"] == "reviewed"][ALIGNMENT_COLUMNS].reset_index(drop=True)


def reviewed(engine, alignments: pd.DataFrame, level=None, learning_area=None, focus=None):
    df = alignments
    if level:
        df = df[df["level"] == level]
    if learning_area:
        df = df[df["learning_area"] == learning_area]
    if focus:
        df = df[df["focus"] == focus]
    out = []
    for _, row in df.iterrows():
        book = engine.get(row["book_id"])
        if book is None:
            continue
        book["cbc"] = {k: row[k] for k in ALIGNMENT_COLUMNS if k != "book_id"}
        out.append(book)
    return out


def suggested(engine, learning_area=None, focus=None, top_k=12, exclude_ids=()):
    """Content-based suggestions for a focus area, filtered by the learning area's language."""
    if not focus or focus not in FOCUS_AREAS:
        return []
    languages = [lang for lang, areas in LANGUAGE_TO_AREAS.items() if learning_area in areas]
    query = f"{focus.split(': ')[-1]}: {FOCUS_AREAS[focus]}"
    results = []
    for book in engine.search(query, top_k=top_k * 4, mode="hybrid"):
        if book["id"] in exclude_ids:
            continue
        if languages and book["language"] not in languages:
            continue
        # Books without a description give the ranking nothing to go on.
        if len(book["description"]) < 80:
            continue
        book["cbc"] = {
            "level": "",
            "learning_area": learning_area or "",
            "focus": focus,
            "status": "suggested",
            "notes": "Suggested from the book's description. Check reading level and suitability before use.",
        }
        results.append(book)
        if len(results) >= top_k:
            break
    return results
