"""One-off dev migration: add Candidate.email and rebuild the unique constraint.

SQLite can't ALTER a UNIQUE constraint in place, so this:
  1. ALTER TABLE candidates ADD COLUMN email ... (nullable-ish default '')
  2. Backs up the whole DB file
  3. Drops + recreates the candidates table (via create_all after a rename dance)

Existing candidate rows predate identity-binding and have no real email on
file. A bare '' default would collide under the new UNIQUE(poll_id, email)
constraint the moment a poll has more than one legacy member (every dev poll
here has 3), so each legacy row instead gets a unique placeholder
"legacy-<id>@placeholder.invalid". These can't match any real signed-in
user's email, so those old polls simply can't be voted on until an admin
re-creates them (or someone updates the emails directly) — acceptable for
dev data.

Run manually: python scripts/migrate_candidate_email.py
"""
import shutil
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "peerrank.db"


def main() -> None:
    if not DB_PATH.exists():
        print(f"No dev DB at {DB_PATH}, nothing to migrate.")
        return

    backup_path = DB_PATH.with_suffix(".db.bak")
    shutil.copy2(DB_PATH, backup_path)
    print(f"Backed up {DB_PATH} -> {backup_path}")

    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.cursor()
        cols = [row[1] for row in cur.execute("PRAGMA table_info(candidates)").fetchall()]

        if "email" not in cols:
            cur.execute("ALTER TABLE candidates ADD COLUMN email VARCHAR(254) NOT NULL DEFAULT ''")
            print("Added candidates.email column.")
        else:
            print("candidates.email already exists; skipping ALTER TABLE.")

        # Backfill unique placeholder emails for legacy rows (still '') before
        # rebuilding with the UNIQUE(poll_id, email) constraint — an empty
        # string default would collide across every member of the same poll.
        legacy_rows = cur.execute("SELECT id FROM candidates WHERE email = ''").fetchall()
        for (cid,) in legacy_rows:
            cur.execute(
                "UPDATE candidates SET email = ? WHERE id = ?",
                (f"legacy-{cid}@placeholder.invalid", cid),
            )
        if legacy_rows:
            print(f"Backfilled {len(legacy_rows)} legacy candidate row(s) with placeholder emails.")

        # Rebuild the table so the UNIQUE constraint moves from
        # (poll_id, display_name) to (poll_id, email) — SQLite can't alter
        # a UNIQUE constraint in place.
        cur.execute("""
            CREATE TABLE candidates_new (
                id INTEGER PRIMARY KEY,
                poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
                display_name VARCHAR(200) NOT NULL,
                email VARCHAR(254) NOT NULL DEFAULT '',
                UNIQUE (poll_id, email)
            )
        """)
        cur.execute("""
            INSERT INTO candidates_new (id, poll_id, display_name, email)
            SELECT id, poll_id, display_name, email FROM candidates
        """)
        cur.execute("DROP TABLE candidates")
        cur.execute("ALTER TABLE candidates_new RENAME TO candidates")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_candidates_poll_id ON candidates (poll_id)")
        conn.commit()
        print("Rebuilt candidates table with (poll_id, email) unique constraint.")
    except sqlite3.IntegrityError as exc:
        conn.rollback()
        print(f"Migration failed, rolled back: {exc}")
        print("Likely cause: duplicate empty-string emails within the same poll "
              "(more than one pre-existing member). Restore from the .bak backup, "
              "manually assign distinct emails to existing candidates, and re-run.")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
