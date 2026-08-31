# Peer Rank - CLAUDE.md

Peer Rank is a peer-ranking web app. An admin creates a poll (a name, a fixed
roster of people, and a countdown timer), shares a voting link, and everyone on
the roster signs in with Google, picks their own name, and ranks everyone else.
Results are revealed to admins once the poll closes.

> **This app requires Google sign-in.** Earlier revisions were no-login and
> fully anonymous; that is no longer true. Read "Identity and disclosure" below
> before reasoning about privacy here - a previous version of this file promised
> anonymity that the code no longer provides.

## Architecture

Single-process Python/FastAPI backend serves both the REST API and the pre-built
React SPA. Session-cookie auth via Starlette `SessionMiddleware` + Google OAuth.

```
app/          Python backend (FastAPI + SQLAlchemy 2.0, sync)
frontend/     React 18 + TypeScript source (Vite, Tailwind, Three.js)
web/          Built SPA output - what FastAPI serves (do not edit by hand)
```

## Backend

**Key files**

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI entry point - tables, sweep loop, CORS + session middleware, mounts SPA at `/app` |
| `app/models.py` | ORM models - **read the anonymity docstring before touching** |
| `app/auth.py` | OAuth client, domain/admin checks, `get_current_user` / `require_admin` |
| `app/routers/auth_routes.py` | `/auth/google`, callback, `/auth/me`, logout |
| `app/routers/polls.py` | Poll create / status / candidates / vote / results |
| `app/routers/admin.py` | Admin dashboard, vote transparency list, poll duplication |
| `app/scoring.py` | Pure ranking computation (no DB access - unit-testable in isolation) |
| `app/results.py` | `close_poll` / `compute_and_freeze` - called at close time |
| `app/scheduler.py` | Background sweep loop - auto-closes expired polls every 15 s |
| `app/config.py` | `Settings` via pydantic-settings - all tunables come from env vars |
| `app/database.py` | SQLAlchemy engine + `get_db` dependency |
| `app/ratelimit.py` | In-process fixed-window rate limiter (IP-keyed) |

**Database**

SQLite by default (`sqlite:///./peerrank.db`). Set `DATABASE_URL` to a Postgres
URL (`postgresql+psycopg://...`) to switch - no code changes needed. Production
uses Neon Postgres via Render.

There are **no migrations** - `main.py` calls `Base.metadata.create_all` on
startup. That creates *missing tables* only; it will not alter an existing
table. Against a database that already holds an older schema, new tables and
columns are silently absent.

There *is* a test suite (added at launch prep): `pytest tests` — 43 tests over
the scoring tiebreak cascade, admin/auth boundaries, token separation, identity
binding, and double-vote rejection. Install with `pip install -r
requirements-dev.txt`. It authenticates by forging a correctly-signed session
cookie rather than stubbing dependencies, so requests run through the real
SessionMiddleware -> `get_current_user` -> `require_admin` path. It is not
wired into CI.

**Auth model**

Sign-in is required for nearly everything:

- Only Google accounts on `ALLOWED_EMAIL_DOMAIN` (default `arcitech.ai`) may
  sign in, plus any address listed in `ALLOWED_EMAIL_EXCEPTIONS`.
- `ADMIN_EMAILS` grants admin. **It defaults to empty, and `require_admin`
  guards poll creation itself** - so with it unset, nobody can create a poll.
- The OAuth client's authorized redirect URIs must contain
  `<APP_BASE_URL>/auth/google/callback` exactly, or every sign-in fails.

**API routes**

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/google` | none | Start Google OAuth |
| GET | `/auth/google/callback` | none | OAuth callback - sets session |
| GET | `/auth/me` | session | Current user |
| POST | `/auth/logout` | session | Clear session |
| POST | `/api/polls` | **admin** | Create poll - returns `vote_token` + `admin_token` |
| GET | `/api/polls/mine` | **admin** | Polls created by this admin |
| GET | `/api/polls/{vote_token}/status` | signed in | Poll status, roster, countdown |
| GET | `/api/polls/{vote_token}/candidates/{member_id}` | signed in | Ranking form for one voter |
| POST | `/api/polls/{vote_token}/vote` | signed in | Submit ballot |
| GET | `/api/admin/{admin_token}/results` | admin_token | Closed poll leaderboard |
| GET | `/api/admin/{admin_token}/votes` | **admin** | Per-voter identity + ranking (see disclosure note) |
| GET | `/api/admin/polls` | **admin** | Dashboard - all polls |
| GET | `/api/admin/polls/{poll_id}` | **admin** | Poll detail |
| GET | `/api/admin/polls/{poll_id}/results` | **admin** | Results by poll id |
| POST | `/api/admin/polls/{poll_id}/duplicate` | **admin** | Clone a poll |
| GET | `/api/health` | none | Health check |

## Frontend

React 18 + TypeScript, Vite, Tailwind CSS, Framer Motion, Three.js/React Three Fiber.

```
frontend/src/
  main.tsx          App entry
  App.tsx           Router
  contexts/         Auth context (session state)
  pages/            Landing, Login, Dashboard, Vote, NotFound
  components/       UI (PollForm, PollLiveView, ProtectedRoute, Leaderboard, ...)
  three/Scene.tsx   3D backdrop (particles, shards, energy ring - pointer-parallax)
  lib/prefs.ts      Local user prefs (localStorage)
```

Run the dev server: `cd frontend && npm run dev`
Build for production: `cd frontend && npm run build` - output goes to `web/`

The Vite dev server proxies both `/api` and `/auth` to `127.0.0.1:8000`, so the
full OAuth flow works against `http://localhost:5173` in dev.

## Local development

```bash
# Backend (in project root)
uvicorn app.main:app --reload

# Frontend (in separate terminal)
cd frontend && npm run dev
```

For a fully integrated test, build the frontend first (`npm run build`) and run
only uvicorn.

## Deployment

Render.com via `render.yaml`. One web service, Python runtime, free plan.
Vars marked `sync: false` must be set in the Render dashboard:

| Var | Notes |
|---|---|
| `DATABASE_URL` | Neon Postgres URL (`postgresql+psycopg://...`) |
| `SECRET_KEY` | Session cookie signing - auto-generated by Render |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Web client credentials |
| `APP_BASE_URL` | Must match the OAuth redirect URI origin |
| `HTTPS_ONLY` | `true` in production (marks session cookie Secure) |
| `ADMIN_EMAILS` | **Required.** Empty means nobody can create a poll |
| `ALLOWED_EMAIL_DOMAIN` | Sign-in domain allowlist (default `arcitech.ai`) |
| `ALLOWED_EMAIL_EXCEPTIONS` | Comma-separated addresses outside that domain |
| `CORS_ORIGINS` | `*` is safe: SPA is same-origin and CORS credentials are off |

Note: the free plan spins the service down when idle, which pauses the sweep
loop. Countdowns still resolve, because `_maybe_close_if_expired` closes an
expired poll on the next request that touches it - just not on schedule.

Docker is also supported (`Dockerfile`). Mount a volume at `/data` for SQLite.

## Critical invariants - do not violate

### Identity and disclosure

There are **two separate records of a vote**, and both facts matter:

1. `Ballot` is still structurally anonymous. It has no voter column, no
   timestamp, and no sequential/rowid key (random UUID PK, `WITHOUT ROWID`).
   Tallies read only `ranked_member_ids`.
   - **Never add** a voter ID, member ID, user column, or FK to `Ballot`.
   - **Never add** a timestamp or sequential/rowid key to `Ballot`.
   - **Never add** a `ballot_id` FK to `AdminVoteRecord`.
2. `AdminVoteRecord` **deliberately records who voted and exactly how they
   ranked** (`voter_email`, `voter_display_name`, `ranked_member_ids`,
   `voted_at`), and `GET /api/admin/{admin_token}/votes` exposes it to admins.

So the structural unlinkability of `Ballot` is real, but it is **not** an
end-to-end privacy guarantee: an admin can read any individual's ranking from
`AdminVoteRecord`. This is an intentional product decision.

**Voters must be told this before they vote.** Do not describe this app as
anonymous in UI copy, docs, or announcements. If the anonymity guarantee is
wanted back, the change is to stop writing `AdminVoteRecord` and remove the
`/votes` endpoint - never to weaken the `Ballot` rules above.

### Token separation

`vote_token` is for voters. `admin_token` is for results.
These use **separate endpoints** - `_get_poll` only accepts `vote_token`;
`_get_poll_by_admin_token` only accepts `admin_token`. Do not merge or cross them.

### Single-process only

The in-process rate limiter (`app/ratelimit.py`) and the sweep loop both assume
one process. Do not scale to multiple uvicorn workers without swapping the rate
limiter to Redis-backed and moving the sweep to a separate service/cron.

## Scoring algorithm (`app/scoring.py`)

Points: in a ballot of L members, rank i (0-based, best first) earns `(L - i) + 1` points.

Tiebreak cascade (single deterministic sort key — never a pairwise comparator):
1. More total points wins
2. More high placements wins (marginal counts at each position)
3. Better Copeland head-to-head record (net wins vs every other member)
4. Earlier join order (deterministic fallback — disclosed in advance)

Rock-paper-scissors Copeland cycles collapse to 0 for all involved members and fall through to join order — no undefined ordering.
