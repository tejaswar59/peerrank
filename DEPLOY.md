# Deploying Peer Rank

The app is a single container: FastAPI serves both the JSON API (`/api/*`) and
the SPA (`/app/`), so there is **one service to deploy** and no separate frontend
host or CORS to wire up.

## Pre-deploy checklist

- [ ] **`SECRET_KEY`** — set a long random value. Rotating it logs everyone out
      (tokens are signed with it), so set it once per environment.
      `python -c "import secrets; print(secrets.token_urlsafe(48))"`
- [ ] **`DATABASE_URL`** — see the database note below.
- [ ] **`CORS_ORIGINS`** — set to your real origin (or leave `*` if the SPA is
      served same-origin, which it is by default).
- [ ] **HTTPS/TLS** — terminate at the load balancer / platform (never serve this
      over plain HTTP; it handles real people's evaluations of each other).
- [ ] **Google OAuth** — still a TODO. Until then the dev login (`admin`/`123`,
      `user`/`123`) is live. **Do not expose a public deployment with the dev
      login enabled** beyond a trusted demo. Wire OAuth in `app/auth.py` first,
      or restrict access at the network layer.
- [ ] **Persistent storage** — if using SQLite, mount a volume at `/data` so the
      DB survives redeploys (the image sets `DATABASE_URL=sqlite:////data/peerrank.db`).
- [ ] **`MASTER_OTP`** — clear it (`MASTER_OTP=`). It's a dev bypass that verifies
      any email without the emailed code; leaving it set lets anyone register any
      address. The server logs a warning at startup while it's set.
- [ ] **SMTP** — set `SMTP_*` (e.g. AWS SES) so real OTP emails send; otherwise
      the code only appears in the server log.

## Run with Docker

```bash
docker build -t peerrank .
docker run -p 8000:8000 \
  -e SECRET_KEY="<random>" \
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

- Google OAuth (dev login still active).
- Alembic migrations (currently `create_all` on startup).
- Rate limiting is in-process (per instance); use a shared store if you scale out.
