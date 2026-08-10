import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";

import AuroraBackground from "./components/AuroraBackground";
import { ToastViewport } from "./components/Toast";
import PageTransition from "./components/PageTransition";
import { getReduceMotion } from "./lib/prefs";

import Landing from "./pages/Landing";
import Vote from "./pages/Vote";
import NotFound from "./pages/NotFound";

// 3D scene is heavy — load it lazily and skip it entirely when motion is reduced.
const Scene = lazy(() => import("./three/Scene"));

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
  // Enter-only page transitions keyed by path: each route mounts fresh and plays
  // its intro. (An AnimatePresence "wait" wrapper here can deadlock route swaps.)
  return (
    <div key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={wrap(<Landing />)} />
        {/* the shared link: select your name, rank, submit, see results */}
        <Route path="/r/:token" element={wrap(<Vote />)} />

        <Route path="/404" element={wrap(<NotFound />)} />
        <Route path="*" element={wrap(<NotFound />)} />
      </Routes>
    </div>
  );
}

export default function App() {
  const reduce = getReduceMotion();
  return (
    <HashRouter>
      <div className="noise relative min-h-screen">
        <AuroraBackground />
        {!reduce ? (
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        ) : null}
        <ScrollToTop />
        <AnimatedRoutes />
        <ToastViewport />
      </div>
    </HashRouter>
  );
}
