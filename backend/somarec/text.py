"""Text normalisation helpers shared by the catalog pipeline and the search engine."""

import re
import unicodedata
import uuid

from unidecode import unidecode

# All book IDs are derived from this namespace so the CSV, the Flask API and
# Supabase agree on the same UUID for the same (title, author) pair.
BOOK_ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://somarec.ke/books")

# Apostrophe look-alikes seen in the harvested data (e.g. "Thiong'o" vs "Thiongʼo").
_APOSTROPHES = "’‘ʼʻ`´"
_APOSTROPHE_RE = re.compile(f"[{_APOSTROPHES}]")
_WIKIDATA_ID_RE = re.compile(r"^Q\d+$")

# Very small list of common Kiswahili function words. Used only to guess a
# language when the source metadata has none; the guess is labelled as such.
_SWAHILI_WORDS = {
    "na", "ya", "wa", "kwa", "za", "la", "katika", "ni", "cha", "vya", "hii",
    "huyo", "yake", "wake", "kama", "lakini", "sana", "hadithi", "mashairi",
    "riwaya", "kitabu", "watoto", "maisha", "siku", "moja", "mimi", "wewe",
}
_ENGLISH_WORDS = {
    "the", "and", "of", "a", "in", "to", "is", "his", "her", "for", "with",
    "this", "that", "on", "by", "from", "as", "an", "story", "novel",
}


_C1_CONTROLS_RE = re.compile("[\x80-\x9f]")


def fix_mac_roman_mojibake(text: str) -> str:
    """Repair text that was Mac Roman bytes decoded as Latin-1 ("L\x8evi-Strauss",
    "ThiongÕo"). C1 control characters never occur in real text, so they are the signal."""
    if not _C1_CONTROLS_RE.search(text):
        return text
    try:
        return text.encode("latin-1").decode("mac_roman")
    except UnicodeEncodeError:
        return _C1_CONTROLS_RE.sub("", text)


def clean_space(text) -> str:
    """Collapse whitespace, repair Mac Roman mojibake and normalise to NFC, so "ũ" is
    one code point whether the source stored it precomposed or as "u" + combining tilde."""
    if text is None:
        return ""
    text = fix_mac_roman_mojibake(re.sub(r"\s+", " ", str(text)).strip())
    return unicodedata.normalize("NFC", text)


def fix_apostrophes(text: str) -> str:
    return _APOSTROPHE_RE.sub("'", text or "")


def fold_key(text: str) -> str:
    """Lowercase ASCII key used for matching and de-duplication."""
    text = unidecode(fix_apostrophes(text or "")).lower()
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def book_id(title: str, author: str) -> str:
    return str(uuid.uuid5(BOOK_ID_NAMESPACE, f"{fold_key(title)}|{fold_key(author)}"))


def is_wikidata_placeholder(title: str) -> bool:
    """True for titles that are unresolved Wikidata IDs such as 'Q24937606'."""
    return bool(_WIKIDATA_ID_RE.match(clean_space(title)))


def tokenize(text: str) -> list:
    return fold_key(text).split()


def guess_language(text: str, title: str = ""):
    """Return 'Gikuyu', 'Kiswahili', 'English' or None.

    The title is checked first because many Kiswahili books in the harvest
    carry an English description (e.g. "Sauti ya dhiki"). Gikuyu spelling uses
    ũ and ĩ, which Kiswahili and English never do ("Caitaani mũtharaba-inĩ").
    """
    if re.search("[ũĩŨĨ]", unicodedata.normalize("NFC", title or "")):
        return "Gikuyu"
    title_tokens = tokenize(title)
    if title_tokens:
        # "wa" is skipped here: it is common in Gikuyu names ("Muthoni wa Kirima").
        sw = sum(t in _SWAHILI_WORDS and t != "wa" for t in title_tokens)
        en = sum(t in _ENGLISH_WORDS for t in title_tokens)
        if sw >= 1 and en == 0:
            return "Kiswahili"
        if en >= 1 and sw == 0:
            return "English"
    tokens = tokenize(text)
    if len(tokens) < 3:
        return None
    sw = sum(t in _SWAHILI_WORDS for t in tokens)
    en = sum(t in _ENGLISH_WORDS for t in tokens)
    if sw >= 2 and sw > en:
        return "Kiswahili"
    if en >= 2 and en > sw:
        return "English"
    return None


LANGUAGE_ALIASES = {
    "swahili": "Kiswahili",
    "kiswahili": "Kiswahili",
    "gikuyu": "Gikuyu",
    "kikuyu": "Gikuyu",
    "english": "English",
    "sheng": "Sheng",
}


def normalize_language(value):
    value = clean_space(value)
    if not value or value.lower() == "nan":
        return None
    return LANGUAGE_ALIASES.get(value.lower(), value)
