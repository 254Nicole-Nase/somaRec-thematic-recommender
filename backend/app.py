"""SomaRec Flask API: search, recommendations, themes and CBC alignment.

Book data, reading lists, reviews and user accounts live in Supabase and are
read/written by the frontend directly. This service only does the work that
needs the search index.

Run:  python backend/app.py
"""

import hmac
import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from somarec import cbc
from somarec.catalog import load_catalog
from somarec.encoders import try_load_encoder
from somarec.engine import SearchEngine

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("somarec")

MAX_TOP_K = 100


def build_engine(encoder="auto"):
    if encoder == "auto":
        encoder = try_load_encoder()
    return SearchEngine(load_catalog(), encoder=encoder)


def create_app(engine=None, alignments=None):
    app = Flask(__name__)
    origins = os.getenv("SOMAREC_CORS_ORIGINS", "*")
    CORS(app, origins=[o.strip() for o in origins.split(",")])

    state = {
        "engine": engine or build_engine(),
        "alignments": alignments if alignments is not None else cbc.load_alignments(),
    }

    def eng() -> SearchEngine:
        return state["engine"]

    def top_k(default):
        value = request.args.get("top_k", default=default, type=int) or default
        return max(1, min(value, MAX_TOP_K))

    @app.errorhandler(Exception)
    def handle_error(exc):
        log.exception("Unhandled error on %s", request.path)
        return jsonify({"error": "Internal server error"}), 500

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", **eng().info(), "reviewed_cbc_alignments": len(state["alignments"])})

    # ----------------------------------------------------------------- books
    @app.get("/api/books")
    def books():
        language = request.args.get("language")
        theme = request.args.get("theme")
        out = eng().all_books()
        if language:
            out = [b for b in out if b["language"].lower() == language.lower()]
        if theme:
            out = [b for b in out if theme in b["themes"]]
        return jsonify(out)

    @app.get("/api/books/<book_id>")
    def book(book_id):
        found = eng().get(book_id)
        if found is None:
            return jsonify({"error": "Book not found"}), 404
        return jsonify(found)

    @app.get("/api/books/<book_id>/similar")
    def similar(book_id):
        exclude = request.args.get("exclude_same_author", "0") == "1"
        found = eng().similar(book_id, top_k=top_k(6), exclude_same_author=exclude)
        if found is None:
            return jsonify({"error": "Book not found"}), 404
        return jsonify(found)

    @app.get("/api/books/<book_id>/by-author")
    def by_author(book_id):
        found = eng().by_author(book_id, top_k=top_k(6))
        if found is None:
            return jsonify({"error": "Book not found"}), 404
        return jsonify(found)

    @app.get("/api/recommend")
    def recommend_legacy():
        """Kept for older frontends: /api/recommend?book_id=<uuid>."""
        book_id = request.args.get("book_id")
        if not book_id:
            return jsonify({"error": "A 'book_id' query parameter is required."}), 400
        return jsonify(eng().similar(book_id, top_k=top_k(6)) or [])

    # ---------------------------------------------------------------- search
    @app.get("/api/search")
    def search():
        query = (request.args.get("q") or "").strip()
        if not query:
            return jsonify({"error": "A 'q' query parameter is required."}), 400
        mode = request.args.get("mode", "hybrid")
        if mode not in ("hybrid", "keyword", "dense"):
            return jsonify({"error": "mode must be hybrid, keyword or dense"}), 400
        results = eng().search(
            query,
            top_k=top_k(10),
            mode=mode,
            language=request.args.get("language"),
            theme=request.args.get("theme"),
        )
        return jsonify(results)

    @app.get("/api/themes")
    def themes():
        """Theme names that at least one book carries (array of strings)."""
        return jsonify([t["name"] for t in eng().themes()])

    @app.get("/api/themes/stats")
    def theme_stats():
        return jsonify(eng().themes())

    @app.get("/api/languages")
    def languages():
        return jsonify(eng().languages())

    @app.get("/api/genres")
    def genres():
        # Genre isn't in the harvested metadata yet; kept so the filter UI degrades cleanly.
        return jsonify([])

    # ------------------------------------------------------------------- CBC
    @app.get("/api/cbc/options")
    def cbc_options():
        return jsonify({
            "levels": cbc.LEVELS,
            "learning_areas": cbc.LEARNING_AREAS,
            "focus_areas": [{"name": k, "description": v} for k, v in cbc.FOCUS_AREAS.items()],
        })

    @app.get("/api/cbc")
    def cbc_books():
        level = request.args.get("level")
        area = request.args.get("learning_area")
        focus = request.args.get("focus")
        reviewed = cbc.reviewed(eng(), state["alignments"], level=level, learning_area=area, focus=focus)
        suggested = cbc.suggested(
            eng(), learning_area=area, focus=focus, top_k=top_k(12),
            exclude_ids={b["id"] for b in reviewed},
        )
        return jsonify({"reviewed": reviewed, "suggested": suggested})

    # ----------------------------------------------------------------- admin
    @app.post("/api/admin/reindex")
    def reindex():
        """Reload the catalog (e.g. after admin edits in Supabase) and rebuild the index.

        Requires 'Authorization: Bearer <SOMAREC_ADMIN_TOKEN>'. Disabled when the
        token isn't configured.
        """
        expected = os.getenv("SOMAREC_ADMIN_TOKEN", "")
        supplied = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not expected:
            return jsonify({"error": "Reindexing is disabled (SOMAREC_ADMIN_TOKEN not set)"}), 403
        if not hmac.compare_digest(supplied, expected):
            return jsonify({"error": "Unauthorized"}), 401
        current = eng()
        state["engine"] = SearchEngine(load_catalog(), encoder=current.encoder)
        state["alignments"] = cbc.load_alignments()
        return jsonify({"status": "reindexed", **eng().info()})

    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    create_app().run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
