import json
import os
from pathlib import Path
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1]


def test_legacy_apply_fails_before_importing_credentials_or_clients(tmp_path):
    sentinel = tmp_path / "unexpected-import"
    poison = f"from pathlib import Path\nPath({str(sentinel)!r}).touch()\nraise RuntimeError('unexpected import')\n"
    for module in ("dotenv", "supabase", "preview_catalog_import"):
        (tmp_path / f"{module}.py").write_text(poison)
    # Run the actual script with the poisoned module directory first on its import path.
    runner = (
        "import runpy, sys; "
        f"sys.path.insert(0, {str(tmp_path)!r}); "
        f"sys.argv = [{str(BACKEND / 'upload_books_to_supabase.py')!r}, '--apply']; "
        "runpy.run_path(sys.argv[0], run_name='__main__')"
    )
    result = subprocess.run(
        [sys.executable, "-c", runner], capture_output=True, text=True,
        env={**os.environ, "SUPABASE_URL": "https://example.org", "SUPABASE_SERVICE_ROLE_KEY": "unused-fixture"},
    )
    assert result.returncode == 2
    assert "--apply is disabled" in result.stderr
    assert not sentinel.exists()


def test_legacy_read_only_mode_reuses_local_preview(tmp_path):
    candidate = tmp_path / "books.json"
    candidate.write_text(json.dumps([
        {"id": "10000000-0000-0000-0000-000000000001", "title": "Fixture book", "author": "Fixture author"},
    ]))
    result = subprocess.run([
        sys.executable, str(BACKEND / "upload_books_to_supabase.py"),
        "--candidate", str(candidate), "--baseline", str(candidate), "--output-dir", str(tmp_path / "review"),
    ], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert json.loads((tmp_path / "review" / "preview.json").read_text())["counts"]["unchanged"] == 1
