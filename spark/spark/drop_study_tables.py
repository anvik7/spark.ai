"""Isolated one-time database migration utility for deprecated Study tables.

SAFETY NOTICE:
This module is strictly isolated and does NOT execute during normal application
startup (init_db / _migrate). It is invoked ONLY explicitly by administrators
via CLI with the required confirmation flag.

It drops the 10 approved deprecated Study tables in the exact reverse-dependency
order (leaf tables first, parent tables last):
    1. studyattempt
    2. activerecallevaluation
    3. studyquestion
    4. studychapter
    5. conceptmastery
    6. studymindmapnode
    7. studyactivesession
    8. studymediasource
    9. studysession
    10. usergoal

Usage:
    python -m spark.drop_study_tables --dry-run
    python -m spark.drop_study_tables --execute --confirm
"""
import argparse
import sys
from typing import Optional
from sqlalchemy import inspect, text as _sql

STUDY_TABLES_REVERSE_ORDER = [
    "studyattempt",
    "activerecallevaluation",
    "studyquestion",
    "studychapter",
    "conceptmastery",
    "studymindmapnode",
    "studyactivesession",
    "studymediasource",
    "studysession",
    "usergoal",
]


def drop_deprecated_study_tables(target_engine=None, dry_run: bool = True) -> dict:
    """Safely drop deprecated Study tables in reverse-dependency order.
    
    If dry_run is True, inspects and reports which tables exist without executing drops.
    If dry_run is False, executes DROP TABLE IF EXISTS "<table_name>" CASCADE.
    """
    if target_engine is None:
        from .models import engine as default_engine
        target_engine = default_engine

    results = {
        "existing_tables": [],
        "dropped_tables": [],
        "missing_tables": [],
        "dry_run": dry_run,
        "success": True,
        "error": None,
    }

    try:
        with target_engine.begin() as conn:
            inspector = inspect(conn)
            all_tables = set(inspector.get_table_names())

            cascade_clause = " CASCADE" if target_engine.dialect.name == "postgresql" else ""
            for tbl in STUDY_TABLES_REVERSE_ORDER:
                if tbl in all_tables:
                    results["existing_tables"].append(tbl)
                    if not dry_run:
                        print(f"[migration] Dropping table '{tbl}'...")
                        conn.execute(_sql(f'DROP TABLE IF EXISTS "{tbl}"{cascade_clause}'))
                        results["dropped_tables"].append(tbl)
                    else:
                        print(f"[dry-run] Table '{tbl}' exists and would be dropped.")
                else:
                    results["missing_tables"].append(tbl)
                    print(f"[info] Table '{tbl}' does not exist (already absent).")

        return results

    except Exception as e:
        results["success"] = False
        results["error"] = str(e)
        print(f"[error] Failed during drop sequence: {e}")
        return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description="One-time removal tool for deprecated SparkDhi Study database tables."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Inspect database and report tables that would be dropped without modifying anything.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Execute the drop table sequence.",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        default=False,
        help="Mandatory safety confirmation flag when executing drops.",
    )

    args = parser.parse_args()

    if not args.dry_run and not args.execute:
        print("Please specify either --dry-run or --execute --confirm.")
        sys.exit(1)

    if args.execute and not args.confirm:
        print("Safety error: --execute requires explicit --confirm flag.")
        sys.exit(1)

    is_dry_run = args.dry_run or not args.execute
    print(f"Running Study table removal (dry_run={is_dry_run})...")
    res = drop_deprecated_study_tables(dry_run=is_dry_run)
    if not res["success"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
