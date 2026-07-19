import { Suspense, lazy, useEffect } from "react";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";

import AuroraBackground from "./components/AuroraBackground";
import { ToastViewport, toast } from "./components/Toast";
import { ConfirmHost } from "./components/ui/Modal";
import PageTransition from "./components/PageTransition";
import { getReduceMotion } from "./lib/prefs";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Verify from "./pages/Verify";
import Forgot from "./pages/Forgot";
import Home from "./pages/Home";
import Vote from "./pages/Vote";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ProjectDetail from "./pages/admin/ProjectDetail";
import { RequireAuth, RequireAdmin, RedirectIfAuthed } from "./routes/guards";

// 3D scene is heavy — load it lazily and skip it entirely when motion is reduced.
const Scene = lazy(() => import("./three/Scene"));

function SessionWatcher() {
  const navigate = useNavigate();
  useEffect(() => {
    const onExpired = () => {
      toast("Your session has ended. Please sign in again.", "err");
      navigate("/login", { replace: true });
    };
    window.addEventListener("pr:session-expired", onExpired);
    return () => window.removeEventListener("pr:session-expired", onExpired);
  }, [navigate]);
  return null;
}

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

        {/* auth */}
        <Route path="/login" element={<RedirectIfAuthed>{wrap(<Login />)}</RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed>{wrap(<Signup />)}</RedirectIfAuthed>} />
        <Route path="/verify" element={wrap(<Verify />)} />
        <Route path="/forgot" element={wrap(<Forgot />)} />
        <Route path="/reset" element={wrap(<Forgot />)} />

        {/* public voting link (handles its own auth gate) */}
        <Route path="/vote/:token" element={wrap(<Vote />)} />

        {/* member + shared */}
        <Route path="/home" element={<RequireAuth>{wrap(<Home />)}</RequireAuth>} />
        <Route path="/profile" element={<RequireAuth>{wrap(<Profile />)}</RequireAuth>} />
        <Route path="/settings" element={<RequireAuth>{wrap(<Settings />)}</RequireAuth>} />

        {/* admin */}
        <Route path="/admin" element={<RequireAdmin>{wrap(<AdminDashboard />)}</RequireAdmin>} />
        <Route
          path="/admin/project/:id"
          element={<RequireAdmin>{wrap(<ProjectDetail />)}</RequireAdmin>}
        />

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
        <SessionWatcher />
        <ScrollToTop />
        <AnimatedRoutes />
        <ToastViewport />
        <ConfirmHost />
      </div>
    </HashRouter>
  );
}
