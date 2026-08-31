"""Portable migration for the auth/admin release. Works on Postgres and SQLite.

`main.py` only calls `Base.metadata.create_all`, which creates MISSING TABLES
but never alters an existing one. This release adds two columns to tables that
already exist in any previously-deployed database:

  * candidates.email        NOT NULL, plus UNIQUE (poll_id, email)
  * polls.created_by_email  nullable

Against a non-empty database, `create_all` leaves those columns absent and the
app then fails at runtime on the first query that touches them. This script
adds them.

`scripts/migrate_candidate_email.py` does the same job but is SQLite-only (it
uses the sqlite3 module and a table-rebuild dance). Use this one for Neon
Postgres.

Safe to run repeatedly: every step checks the live schema first. Run with
--dry-run to see the plan without writing.

    python scripts/migrate_auth_schema.py --dry-run
    python scripts/migrate_auth_schema.py

DATABASE_URL is read from the environment / .env, same as the app.
"""
import argparse
import sys

from sqlalchemy import inspect, text

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from app.config import settings          # noqa: E402
from app.database import Base, engine    # noqa: E402
from app import models                   # noqa: E402,F401  (registers all tables)

PLACEHOLDER = "legacy-{id}@placeholder.invalid"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report the plan, write nothing")
    args = ap.parse_args()

    dialect = engine.dialect.name
    # Never print the full URL - it carries credentials.
    print(f"dialect: {dialect}")
    print(f"mode:    {'DRY RUN (no writes)' if args.dry_run else 'APPLY'}\n")

    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if not tables:
        print("Database is empty. No migration needed - the app's create_all()")
        print("will build the full current schema on startup.")
        return 0

    print(f"existing tables: {sorted(tables)}\n")
    plan, applied = [], []

    with engine.begin() as conn:
        # --- 1. Missing tables (e.g. admin_vote_records) -------------------
        missing_tables = [t for t in Base.metadata.tables if t not in tables]
        if missing_tables:
            plan.append(f"CREATE missing tables: {missing_tables}")
            if not args.dry_run:
                Base.metadata.create_all(bind=conn)
                applied.append(f"created tables {missing_tables}")

        # --- 2. polls.created_by_email (nullable - trivial) ----------------
        if "polls" in tables:
            cols = {c["name"] for c in insp.get_columns("polls")}
            if "created_by_email" not in cols:
                plan.append("ALTER polls ADD COLUMN created_by_email VARCHAR(254) NULL")
                if not args.dry_run:
                    conn.execute(text(
                        "ALTER TABLE polls ADD COLUMN created_by_email VARCHAR(254)"
                    ))
                    applied.append("added polls.created_by_email")

        # --- 3. candidates.email (NOT NULL + unique) -----------------------
        if "candidates" in tables:
            cols = {c["name"] for c in insp.get_columns("candidates")}
            if "email" not in cols:
                plan.append("ALTER candidates ADD COLUMN email (nullable)")
                plan.append("BACKFILL legacy rows with unique placeholder emails")
                plan.append("SET candidates.email NOT NULL")
                plan.append("ADD CONSTRAINT uq_poll_email UNIQUE (poll_id, email)")

                if not args.dry_run:
                    if dialect == "sqlite":
                        print("SQLite cannot add a UNIQUE constraint in place.")
                        print("Use scripts/migrate_candidate_email.py for SQLite instead.")
                        return 2

                    # Add nullable first so existing rows survive the ALTER.
                    conn.execute(text(
                        "ALTER TABLE candidates ADD COLUMN email VARCHAR(254)"
                    ))
                    # Unique placeholder per row. A shared '' default would
                    # violate UNIQUE(poll_id, email) for any poll with more
                    # than one member. These addresses are unroutable, so no
                    # real signed-in user can ever match them - legacy polls
                    # become unvotable and must be recreated. That is
                    # intentional: there is no way to recover which email
                    # belonged to which pre-auth roster slot.
                    conn.execute(text(
                        "UPDATE candidates SET email = 'legacy-' || id || "
                        "'@placeholder.invalid' WHERE email IS NULL"
                    ))
                    conn.execute(text(
                        "ALTER TABLE candidates ALTER COLUMN email SET NOT NULL"
                    ))
                    conn.execute(text(
                        "ALTER TABLE candidates ADD CONSTRAINT uq_poll_email "
                        "UNIQUE (poll_id, email)"
                    ))
                    n = conn.execute(text("SELECT count(*) FROM candidates")).scalar()
                    applied.append(f"added candidates.email + uq_poll_email ({n} rows backfilled)")
            else:
                # Column exists; make sure the constraint came with it.
                uqs = {u["name"] for u in insp.get_unique_constraints("candidates")}
                if "uq_poll_email" not in uqs and dialect != "sqlite":
                    plan.append("ADD CONSTRAINT uq_poll_email UNIQUE (poll_id, email)")
                    if not args.dry_run:
                        conn.execute(text(
                            "ALTER TABLE candidates ADD CONSTRAINT uq_poll_email "
                            "UNIQUE (poll_id, email)"
                        ))
                        applied.append("added uq_poll_email constraint")

        if args.dry_run:
            # Roll back rather than commit an empty transaction.
            conn.rollback()

    if not plan:
        print("Schema already current - nothing to do.")
        return 0

    print("PLAN:")
    for step in plan:
        print(f"  - {step}")
    if args.dry_run:
        print("\nDry run: nothing was written. Re-run without --dry-run to apply.")
    else:
        print("\nAPPLIED:")
        for step in applied:
            print(f"  - {step}")
        print("\nDone. Any legacy poll whose members got placeholder emails cannot")
        print("be voted on - recreate those polls.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
