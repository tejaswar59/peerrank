import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";

import { ToastViewport } from "./components/Toast";
import PageTransition from "./components/PageTransition";
import { getReduceMotion } from "./lib/prefs";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Vote from "./pages/Vote";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";

// Keep lazy import for Scene but don't render it — replaced by clean white bg
const _Scene = lazy(() => import("./three/Scene"));

function wrap(node: React.ReactNode) {
  return <PageTransition>{node}</PageTransition>;
}

// Reset scroll to top whenever the route path changes.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <div key={location.pathname}>
      <Routes location={location}>
        <Route path="/login" element={wrap(<Login />)} />
        <Route path="/" element={<ProtectedRoute>{wrap(<Landing />)}</ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute>{wrap(<Dashboard />)}</ProtectedRoute>} />
        {/* the shared link: select your name, rank, submit, see results */}
        <Route path="/r/:token" element={<ProtectedRoute>{wrap(<Vote />)}</ProtectedRoute>} />

        <Route path="/404" element={wrap(<NotFound />)} />
        <Route path="*" element={wrap(<NotFound />)} />
      </Routes>
    </div>
  );
}

export default function App() {
  const _reduce = getReduceMotion();
  return (
    <HashRouter>
      <AuthProvider>
        <div className="relative min-h-screen bg-white">
          {/* Clean dot-grid background replacing Three.js scene + aurora */}
          <div aria-hidden className="fixed inset-0 -z-10 dot-grid" />
          <ScrollToTop />
          <AnimatedRoutes />
          <ToastViewport />
        </div>
      </AuthProvider>
    </HashRouter>
  );
}
