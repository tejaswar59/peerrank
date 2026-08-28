# Deploying Peer Rank

The app is a single container: FastAPI serves both the JSON API (`/api/*`) and
the SPA (`/app/`), so there is **one service to deploy** and no separate frontend
host or CORS to wire up.

## Pre-deploy checklist

No accounts, no login, no secrets to rotate — there's nothing to authenticate
in this app, so the checklist is short:

- [ ] **Rebuild the frontend** — `cd frontend && npm run build`. The image ships
      the prebuilt `web/` directory; nothing in the Docker build creates it, so
      skipping this silently deploys the previous UI.
- [ ] **`--proxy-headers`** — already in the image's `CMD`. If you override the
      start command, keep it: without it every request appears to come from the
      load balancer's IP, and the per-IP rate limiter throttles all voters as
      though they were one client.
- [ ] **Schema change (one-time)** — the poll timer column was renamed
      `duration_minutes` → `duration_seconds`. The app calls `create_all`, which
      creates missing tables but **never alters existing ones**, so a database
      that predates this change keeps the old NOT NULL column and every poll
      creation fails. Drop the `polls`/`candidates`/`ballots`/`participation_log`/
      `result_snapshots` tables (or reset the volume) once, before this deploy.
- [ ] **`DATABASE_URL`** — see the database note below.
- [ ] **`CORS_ORIGINS`** — set to your real origin (or leave `*` if the SPA is
      served same-origin, which it is by default).
- [ ] **HTTPS/TLS** — terminate at the load balancer / platform (never serve this
      over plain HTTP; it handles real people's evaluations of each other).
- [ ] **Persistent storage** — if using SQLite, mount a volume at `/data` so the
      DB survives redeploys (the image sets `DATABASE_URL=sqlite:////data/peerrank.db`).
- [ ] **Anyone with a poll's link can vote as any name not yet taken** — this is
      by design (no accounts), but means the link itself is the only access
      control. Don't post a poll link somewhere more public than its intended
      audience.

## Run with Docker

```bash
docker build -t peerrank .
docker run -p 8000:8000 \
  -e CORS_ORIGINS="https://peerrank.arcitech.ai" \
  -v peerrank-data:/data \
  peerrank
```

Open `http://localhost:8000/`.

## Database: SQLite vs Postgres

- **SQLite (default)** — zero setup, one file. Fine for a single instance / small
  team. **Limitation:** it does not support running multiple app instances against
  the same file, so you cannot horizontally scale. The volume at `/data` must
  persist or you lose data on redeploy.
- **Postgres (recommended for real production / scaling)** — add the driver
  (`pip install "psycopg[binary]"`) and set
  `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/peerrank`. No app code
  changes; the schema is created on startup. On AWS this is **RDS** or **Aurora
  Serverless v2**. *Cost note:* a `db.t4g.micro` RDS instance is a few USD/month;
  Aurora Serverless v2 scales to near-zero but has a higher floor — pick RDS for a
  small team.

## AWS-native options (in order of simplicity)

1. **App Runner** — point it at this repo or the image in ECR; it builds, runs,
   gives you HTTPS + autoscaling. Simplest path. *Caveat:* App Runner has no
   persistent local disk, so **use RDS Postgres**, not SQLite. *Cost:* ~1 vCPU/2GB
   is roughly \$25–40/month at low traffic; scales with usage.
2. **ECS Fargate + ALB** — the image on Fargate behind an Application Load
   Balancer (TLS via ACM), DB on RDS. More control, more moving parts. Use an EFS
   mount only if you insist on SQLite; otherwise RDS. *Cost:* ALB (~\$16/mo) +
   Fargate task + RDS.
3. **EC2 + Docker** — cheapest and simplest to reason about for one small box:
   run the container, put Nginx or an ALB in front for TLS. You manage patching.

**Recommendation for this stage (small team, pre-OAuth):** App Runner + a small
RDS Postgres. It is the least ops for HTTPS + autoscaling, and moving to Postgres
now avoids the SQLite single-instance dead-end later.

## Scaling note (important)

The auto-close sweep (`app/scheduler.py`) runs **in-process**. With more than one
instance/worker, every instance runs its own sweep. Closing is idempotent so this
is safe, but it is wasteful. Before scaling out, either:
- keep the web tier at 1 instance for the sweep and scale reads separately, or
- move the sweep to a scheduled job (EventBridge → a small task hitting an
  internal "run sweep" endpoint), or a single leader.

## Rollback

- **App Runner / ECS:** redeploy the previous image tag (keep immutable tags,
  e.g. the git SHA — not just `latest`). App Runner keeps prior configurations;
  ECS: update the service to the previous task definition revision.
- **Schema:** the app uses `create_all` (additive only — it never drops columns),
  so rolling the image back is safe as long as no destructive migration ran. When
  you adopt Alembic, gate migrations as a separate, reversible deploy step.
- **Data:** enable automated RDS snapshots (or back up the SQLite volume) so you
  can restore point-in-time.

## Not production-ready yet (known gaps)

- Alembic migrations (currently `create_all` on startup). Because `create_all`
  only ever CREATES tables, any column change needs a manual migration or a
  table drop — see the schema-change item in the checklist above.
- Rate limiting is in-process (per instance); use a shared store if you scale out.
- **The container runs as root.** This is deliberate for now: managed platforms
  mount persistent volumes with platform-chosen ownership, and a fixed non-root
  UID often cannot write to them — which is exactly how you get a 500 on every
  DB write while `/api/health` still returns 200. Moving to Postgres removes the
  volume entirely and with it the reason to stay root; do that before adding a
  `USER` line.
- The frontend build is not part of the image build, so a stale `web/` can ship
  silently. A multi-stage Dockerfile (node stage → python stage) would remove
  that footgun.
