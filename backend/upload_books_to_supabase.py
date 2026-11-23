"""Retired uploader. The read-only mode delegates to the local catalog preview."""

import argparse
from pathlib import Path


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--apply", action="store_true", help="Retired. Exits without loading credentials.")
    parser.add_argument("--batch-size", type=int, help=argparse.SUPPRESS)
    parser.add_argument("--candidate", default=Path(__file__).parent / "data" / "catalog.csv", type=Path)
    parser.add_argument("--baseline", type=Path, help="Required local catalog snapshot")
    parser.add_argument("--review", type=Path, help="Optional local review manifest")
    parser.add_argument("--output-dir", type=Path, help="Required report destination")
    args = parser.parse_args(argv)
    if args.apply:
        parser.error("--apply is disabled. Use the offline preview with a local baseline.")
    if args.baseline is None or args.output_dir is None:
        parser.error("Read-only mode requires --baseline and --output-dir.")

    from preview_catalog_import import main as preview

    options = ["--candidate", str(args.candidate), "--baseline", str(args.baseline),
               "--output-dir", str(args.output_dir)]
    if args.review:
        options.extend(("--review", str(args.review)))
    return preview(options)


if __name__ == "__main__":
    raise SystemExit(main())
