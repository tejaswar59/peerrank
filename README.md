# Peer Rank — backend

Anonymous peer-ranking tool. No accounts, no login, anywhere. One person creates
a poll — a question, a fixed roster of names, a countdown — and shares the
link. Anyone who opens it identifies themselves only by picking their own name
off the roster, then ranks everyone else. The system can tell you **who
voted** but never **what any individual voted** — that link is structurally
impossible, not just access-controlled.

## Stack

- **Backend:** **FastAPI** + **SQLAlchemy 2.0** (sync) + **SQLite**
- **Frontend:** **React 18** + **TypeScript** + **Vite**, built into `web/`,
  served by FastAPI itself at `/app/` — same origin, so no CORS to configure.
- Tables auto-created on startup; swap `DATABASE_URL` for Postgres later with no
  code changes.
- Background auto-close sweep runs in-process (no extra services) — closes a
  poll the instant its timer runs out, even with nobody on the site.

Once the server is running, open **http://127.0.0.1:8000/** — it redirects to
the app, which is the poll-creation form itself. No sign-in step at all.

## The anonymity wall (the whole point)

Two tables share **no link back to identity**:

| Table | Knows | Identity? |
|-------|-------|-----------|
| `participation_log` | a candidate (by id) voted — `unique(poll_id, member_id)` | yes |
| `ballots` | a ranking happened — `ranked_member_ids` only | **never** |

See the guard comment in [`app/models.py`](app/models.py). **Never add a voter /
member_id / user column to `ballots`** — that one change destroys the guarantee.

## Run it

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

copy .env.example .env            # optional; defaults work out of the box
uvicorn app.main:app --reload
```

Tables are created automatically on first start.

- Interactive API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/api/health
- Inspect the DB: open `peerrank.db` in any SQLite viewer (e.g. DB Browser for SQLite).

## API surface

No auth header on any of these — the poll's `vote_token` (in the URL) and, once
a name is picked, that candidate's id (in the body) are the only things that
stand in for identity.

- `POST /api/polls` — create a poll: `{name, member_names, duration_seconds}`.
  The window is 5 seconds to 24 hours; the question is capped at 100 characters,
  each name at 32, and a roster at 100 people (see `app/schemas.py`).
- `GET /api/polls/{token}/status` — live status: who's voted, time remaining.
  Powers both the creator's live count and the voter's "select your name" screen.
- `GET /api/polls/{token}/candidates/{member_id}` — after picking a name, the
  ranking screen for that name: everyone else on the roster, self excluded.
- `POST /api/polls/{token}/vote` — submit one ranking: `{member_id, ranked_member_ids}`
- `POST /api/admin/{admin_token}/close` — end voting early. Admin-only and
  idempotent; returns the frozen leaderboard. A voter's link cannot reach it.
- `GET /api/admin/{admin_token}/results` — the frozen leaderboard. **Only**
  `admin_token` reaches this; there is no `vote_token` variant, so a voter's
  link structurally cannot see results. `ranking` comes back **empty** when
  nobody voted — that is the correct answer, not an error.

> There is deliberately **no** endpoint that returns an individual ballot.

## How the core rules are enforced

- **No two people tie** — [`app/scoring.py`](app/scoring.py) is a pure function
  with a strict tie-break cascade (points → placement counts → head-to-head →
  join-order fallback) and nudges displayed point totals so no two candidates
  ever show the same number either.
- **No votes ⇒ no leaderboard** — with zero ballots the scorer returns an empty
  ranking and the UI says "no votes were cast". It must never fall through to
  the tie-break/spacing logic, which would otherwise crown whoever happens to
  be first on the roster with points nobody awarded.
- **Duplicate votes** — the `unique(poll_id, member_id)` insert is the guard,
  so two simultaneous submits for the same picked name can't both slip through.
- **Self-exclusion** — the server builds the candidate list without the picked
  name; the client never receives its own row to filter out.
- **Voting window** — checked against the server clock at write time, never
  the client's countdown.
- **Auto-close** — closes the instant ANY of these happens:
  - everyone on the roster has voted — checked inline on every submit, so it is
    instant and does **not** wait for the timer or the next sweep;
  - the timer runs out — [`app/scheduler.py`](app/scheduler.py) sweeps every 5s
    so this holds even with nobody on the site;
  - the creator ends it early via `POST /api/admin/{admin_token}/close`.

## Project layout

```
app/
  main.py         FastAPI app, table creation, sweep task, CORS
  config.py       settings (DATABASE_URL, rate limits, duration bounds) from .env
  database.py     engine / session / Base
  models.py       schema + the anonymity-wall guard comment
  schemas.py      Pydantic request/response models
  ratelimit.py    small in-process rate limiter (poll creation, submit)
  scoring.py      pure point allocation + tie-break cascade
  results.py      close a poll + freeze the leaderboard (idempotent)
  scheduler.py    auto-close sweep loop
  routers/
    polls.py      the entire API — create, status, candidates, vote, results
frontend/src/
  pages/
    Landing.tsx   create a poll + watch it live (the creator's whole experience)
    Vote.tsx      select your name -> rank -> submit -> results
```

## Deployment

One container serves both the API and the SPA. See **[DEPLOY.md](DEPLOY.md)** for
the Docker build, the pre-deploy checklist, SQLite-vs-Postgres guidance,
AWS-native options (App Runner / ECS Fargate + RDS), the scaling caveat for the
in-process sweep, and rollback steps.

```bash
docker build -t peerrank .
docker run -p 8000:8000 -v peerrank-data:/data peerrank
```
