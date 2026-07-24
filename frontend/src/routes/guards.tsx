import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useCallback, type ReactNode } from "react";
import { useSession } from "@/lib/useSession";
import { session } from "@/lib/session";
import type { LoginOut } from "@/lib/types";
import { toast } from "@/components/Toast";

export function homeFor(role: string | null | undefined): string {
  return role === "admin" ? "/admin" : "/home";
}

// After any successful auth, land on where the user was headed (e.g. a shared
// vote link) or the role's default home.
export function useAuthRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (r: LoginOut) => {
      session.set(r.token, r.role, r.email);
      toast(`Welcome, ${r.email}`, "ok");
      const from = (location.state as any)?.from as string | undefined;
      navigate(from || homeFor(r.role), { replace: true });
    },
    [navigate, location.state],
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const s = useSession();
  const location = useLocation();
  if (!s.token) {
    const from = location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from }} />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const s = useSession();
  if (!s.token) return <Navigate to="/login" replace />;
  if (s.role !== "admin") return <Navigate to="/home" replace />;
  return <>{children}</>;
}

// For auth pages: if already signed in, skip to home.
//
// Also honours a pending `state.from` (see useAuthRedirect above) — not just
// for the "typed /login while already signed in" case this guard is really
// for. Reason: session.set() inside useAuthRedirect notifies subscribers
// SYNCHRONOUSLY, so while Login is still mounted (wrapped by this very
// guard), this component re-renders and fires ITS OWN unstated redirect
// *before* useAuthRedirect's own from-aware navigate() call runs — a genuine
// race that was silently dropping the intended destination (e.g. a shared
// vote link) and always bouncing to the generic role home instead. Making
// both redirects agree on the same target closes the race regardless of
// which one "wins".
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const s = useSession();
  const location = useLocation();
  if (s.token) {
    const from = (location.state as any)?.from as string | undefined;
    return <Navigate to={from || homeFor(s.role)} replace />;
  }
  return <>{children}</>;
}
