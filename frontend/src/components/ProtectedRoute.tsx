import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { OrbLoader } from "@/components/ui/Bits";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <OrbLoader label="Loading…" />
    </div>
  );
  if (!user) {
    // Remember where they were headed (e.g. a direct /r/:token link) so
    // Landing.tsx can send them straight there once they're signed in,
    // instead of stranding them on the generic code-entry screen.
    sessionStorage.setItem("postLoginRedirect", location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
