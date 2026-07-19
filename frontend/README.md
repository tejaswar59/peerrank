# Peer Rank — Frontend

Premium React + TypeScript SPA (Vite, Tailwind, Framer Motion, React Three Fiber).
It builds **into `../web`**, which the FastAPI backend already serves at `/app/`
via `StaticFiles`. So there is **zero backend change** — same origin, same `/api`
calls, same deploy.

## Stack
- React 18 + TypeScript + Vite
- TailwindCSS (dark, glassmorphism design system)
- Framer Motion (page/UI motion) + React Three Fiber / drei (3D backdrop)
- React Hook Form + Zod (forms), lucide-react (icons)
- Hash routing (works under static `/app/` serving without a server catch-all)

## Develop (hot reload)
```bash
# 1) run the backend (from repo root)
uvicorn app.main:app --port 8000
# 2) run the Vite dev server (from frontend/)
npm install
npm run dev        # open the printed URL, then go to /app/
```
`/api/*` is proxied to the backend at `http://127.0.0.1:8000` (see vite.config.ts).

## Build (what ships)
```bash
npm run build      # outputs to ../web  (index.html + assets/)
```
Commit the generated `web/` folder — the existing `pip install`-only deploy
serves it unchanged. No Node step is needed in production.

## Notes
- API contract is fixed and mirrored exactly in `src/lib/types.ts` +
  `src/lib/api.ts`. Do not rename fields; the backend owns the schema.
- Session keys (`pr_token` / `pr_role` / `pr_email`) match the old SPA, so
  signed-in users stay signed in across the redesign.
- Google Sign-In appears only when the backend reports a `GOOGLE_CLIENT_ID`
  (`GET /api/auth/config`).
- Respects `prefers-reduced-motion` and an in-app "Reduce motion" toggle
  (Settings) that also disables the 3D scene.
