import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  FolderKanban,
  User,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from "lucide-react";
import { Wordmark } from "../Brand";
import { Avatar } from "../ui/Bits";
import { useSession } from "@/lib/useSession";
import { session } from "@/lib/session";
import { api } from "@/lib/api";
import { confirmDialog } from "../ui/Modal";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export default function AppShell({ children }: { children: ReactNode }) {
  const s = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav: NavItem[] =
    s.role === "admin"
      ? [
          { to: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
          { to: "/profile", label: "Profile", icon: <User className="h-[18px] w-[18px]" /> },
          { to: "/settings", label: "Settings", icon: <Settings className="h-[18px] w-[18px]" /> },
        ]
      : [
          { to: "/home", label: "Home", icon: <FolderKanban className="h-[18px] w-[18px]" /> },
          { to: "/profile", label: "Profile", icon: <User className="h-[18px] w-[18px]" /> },
          { to: "/settings", label: "Settings", icon: <Settings className="h-[18px] w-[18px]" /> },
        ];

  async function signOut() {
    const ok = await confirmDialog({
      title: "Sign out?",
      message: "You'll need to sign in again to access your workspace.",
      confirmText: "Sign out",
      danger: true,
    });
    if (!ok) return;
    // Release the single-device session lock server-side so signing back in
    // (here or elsewhere) never sees a stale "already signed in" conflict.
    // Best-effort: local sign-out proceeds either way.
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore — token may already be invalid/expired */
    }
    session.clear();
    navigate("/login", { replace: true });
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[14px] font-medium transition-colors",
      isActive ? "text-white" : "text-white/55 hover:text-white/90",
    ].join(" ");

  return (
    <div className="relative min-h-screen">
      {/* floating glass top nav */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <nav className="glass-strong mx-auto flex h-16 max-w-6xl items-center justify-between rounded-xl2 px-3 pr-3.5 sm:px-4">
          <button
            onClick={() => navigate(session.snapshot().role === "admin" ? "/admin" : "/home")}
            className="ring-focus rounded-xl px-1"
          >
            <Wordmark />
          </button>

          <div className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass} end={n.to === "/admin"}>
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 -z-[1] rounded-xl bg-white/[0.07] ring-1 ring-white/10"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    {n.icon}
                    {n.label}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {/* user menu */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Account menu"
                aria-expanded={menuOpen}
                className="ring-focus flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition hover:bg-white/[0.06]"
              >
                <Avatar name={s.email || "?"} size={34} presence />
                <ChevronDown className="hidden h-4 w-4 text-white/40 sm:block" />
              </button>
              <AnimatePresence>
                {menuOpen ? (
                  <>
                    <div className="fixed inset-0 z-[1]" onClick={() => setMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className="glass-strong absolute right-0 top-12 z-[2] w-60 rounded-xl2 p-2"
                    >
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                        <Avatar name={s.email || "?"} size={38} />
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium capitalize text-white/90">
                            {s.role}
                          </p>
                          <p className="truncate font-mono text-[11.5px] text-white/45">
                            {s.email}
                          </p>
                        </div>
                      </div>
                      <div className="my-1.5 h-px bg-white/[0.07]" />
                      <MenuLink to="/profile" icon={<User className="h-4 w-4" />} onGo={() => setMenuOpen(false)}>
                        Profile
                      </MenuLink>
                      <MenuLink to="/settings" icon={<Settings className="h-4 w-4" />} onGo={() => setMenuOpen(false)}>
                        Settings
                      </MenuLink>
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          signOut();
                        }}
                        className="ring-focus flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-rose-300 transition hover:bg-rose-500/10"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </motion.div>
                  </>
                ) : null}
              </AnimatePresence>
            </div>

            <button
              onClick={() => setMobileOpen(true)}
              className="ring-focus grid h-10 w-10 place-items-center rounded-xl text-white/70 hover:bg-white/[0.06] md:hidden"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </nav>
      </header>

      {/* mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div className="fixed inset-0 z-[100] md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 34 }}
              className="glass-strong absolute right-0 top-0 flex h-full w-72 flex-col p-5"
            >
              <div className="mb-6 flex items-center justify-between">
                <Wordmark size={30} />
                <button onClick={() => setMobileOpen(false)} className="ring-focus rounded-lg p-1.5 text-white/60">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {nav.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.to === "/admin"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium ${
                        isActive ? "bg-white/[0.08] text-white" : "text-white/60"
                      }`
                    }
                  >
                    {n.icon}
                    {n.label}
                  </NavLink>
                ))}
              </div>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  signOut();
                }}
                className="mt-auto flex items-center gap-3 rounded-xl px-3.5 py-3 text-[15px] font-medium text-rose-300"
              >
                <LogOut className="h-[18px] w-[18px]" /> Sign out
              </button>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="relative z-[2] mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-5">{children}</main>
    </div>
  );
}

function MenuLink({
  to,
  icon,
  children,
  onGo,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onGo: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onGo}
      className="ring-focus flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white"
    >
      {icon}
      {children}
    </NavLink>
  );
}
