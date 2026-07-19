# Peer Rank — backend

Anonymous peer-ranking backend. A team ranks each other over a time-boxed voting
round; the system can tell you **who voted** but never **what any individual
voted** — that link is structurally impossible, not just access-controlled.

Built from the specs in `../peer-rank-mockups` (backend/frontend architecture +
admin/voting panel mockups).

## Stack

- **Backend:** **FastAPI** + **SQLAlchemy 2.0** (sync) + **SQLite**
- **Frontend:** single-page app in **vanilla HTML/CSS/JS** (no build step, no
  dependencies), in `web/`, served by FastAPI itself at `/app/` — same origin,
  so no CORS to configure. Hash-routed: login, admin console, voter ballot.
- Tables auto-created on startup; swap `DATABASE_URL` for Postgres later with no
  code changes.
- Background auto-close sweep runs in-process (no extra services).

Once the server is running, open **http://127.0.0.1:8000/** — it redirects to the
app. Sign in with the demo buttons (`admin`/`123` or `user`/`123`).

## The anonymity wall (the whole point)

Two tables share **no link back to identity**:

| Table | Knows | Identity? |
|-------|-------|-----------|
| `participation_log` | an email voted in a round — `unique(round_id, email)` | yes |
| `ballots` | a ranking happened — `ranked_member_ids` only | **never** |

See the guard comment in [`app/models.py`](app/models.py). **Never add a voter /
email / user column to `ballots`** — that one change destroys the guarantee.

## Run it

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt

copy .env.example .env            # optional; defaults work out of the box
uvicorn app.main:app --reload
```

Tables are created automatically on first start — sign in as admin and create
your projects/teams through the UI.

- Interactive API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/api/health
- Inspect the DB: open `peerrank.db` in any SQLite viewer (e.g. DB Browser for SQLite).

## Login (temporary dev shim — Google OAuth wired in later)

`POST /api/auth/login` returns a bearer token. Send it as
`Authorization: Bearer <token>` on every other call.

| Username | Password | Result |
|----------|----------|--------|
| `admin` | `123` | admin role |
| `user` | `123` | voter, signed in as `DEV_VOTER_EMAIL` (`teja@aufgang.com`) |
| any email | `123` | voter, signed in as that email (test any roster member) |

Only `app/auth.py::authenticate` changes when OAuth arrives; the role/eligibility
gates downstream stay the same.

## API surface

**Auth** — `POST /api/auth/login`, `GET /api/auth/me`

**Admin** (require admin role)
- `POST /api/projects`, `GET /api/projects`, `GET /api/projects/{id}`
- `POST /api/projects/{id}/teams`, `GET /api/projects/{id}/teams`
- `POST /api/teams/{id}/members`, `DELETE /api/teams/{id}/members/{member_id}`
- `POST /api/projects/{id}/rounds`, `GET /api/projects/{id}/rounds`
- `POST /api/rounds/{id}/close` — close early + freeze results
- `GET /api/rounds/{id}/participation` — counts + per-email voted flag (never ballot content)
- `GET /api/rounds/{id}/results` — frozen leaderboard (after close)

**Voting** (any signed-in member on the round's team)
- `GET /api/vote/{token}` — round info + teammates minus yourself + already-voted flag
- `POST /api/vote/{token}` — submit one ranking, within the window
- `GET /api/vote/{token}/results` — frozen leaderboard after close

> There is deliberately **no** endpoint that returns an individual ballot.

## How the core rules are enforced

- **Duplicate votes** — the `unique(round_id, email)` insert is the guard, so two
  simultaneous submits can't both slip through a read-then-write race.
- **Self-exclusion** — the server builds the candidate list without you; the
  client never receives its own row to filter out.
- **Voting window** — checked against the server clock at write time, never the
  client's countdown.
- **Point allocation** — in a ballot ranking `L` teammates, position `i` (best
  first) earns `L − i`. Score = sum received across all ballots.
- **Tie-break cascade** — pure function in [`app/scoring.py`](app/scoring.py):
  points → #1-place counts → #2, #3… → head-to-head → join-order fallback.
- **Auto-close** — [`app/scheduler.py`](app/scheduler.py) sweeps every 60s and
  closes rounds past `end_at`, so deadlines hold even with nobody on the site.

## Project layout

```
app/
  main.py         FastAPI app, table creation, sweep task, CORS
  config.py       settings (DATABASE_URL, dev creds) from .env
  database.py     engine / session / Base
  models.py       schema + the anonymity-wall guard comment
  schemas.py      Pydantic request/response models
  auth.py         dev login, signed token, current_user / require_admin
  ratelimit.py    small in-process rate limiter (login, submit)
  scoring.py      pure point allocation + tie-break cascade
  results.py      close a round + freeze the leaderboard (idempotent)
  scheduler.py    auto-close sweep loop
  routers/        auth_routes.py, admin.py, voting.py
web/
  index.html      SPA shell
  styles.css      design system (paper/ink + teal)
  app.js          session, API client, hash router, all views
```

## Deployment

One container serves both the API and the SPA. See **[DEPLOY.md](DEPLOY.md)** for
the Docker build, the pre-deploy checklist (secret key, CORS, HTTPS, persistent
storage), SQLite-vs-Postgres guidance, AWS-native options (App Runner / ECS
Fargate + RDS), the scaling caveat for the in-process sweep, and rollback steps.

```bash
docker build -t peerrank .
docker run -p 8000:8000 -e SECRET_KEY="<random>" -v peerrank-data:/data peerrank
```

## Not done yet (intentionally)

- **Google OAuth** — replaces the dev login in `app/auth.py`; the frontend login
  view gets a "Sign in with Google" button that hits the new endpoint.
- **Production hardening** — Alembic migrations, tighter CORS, per-user rate
  limiting, TLS, secrets management.
