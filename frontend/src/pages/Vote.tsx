import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Navigate, useLocation } from "react-router-dom";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import {
  GripVertical,
  Trophy,
  Lock,
  ShieldAlert,
  Ban,
  LinkIcon,
  CheckCircle2,
  ArrowUp,
  Home,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { VotePage, Candidate, ResultOut } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { session } from "@/lib/session";
import { Button } from "@/components/ui/Button";
import { OrbLoader, Avatar } from "@/components/ui/Bits";
import GlassCard from "@/components/ui/GlassCard";
import { Countdown } from "@/components/ui/Countdown";
import { homeFor } from "@/routes/guards";
import { Leaderboard } from "@/components/Leaderboard";
import { Wordmark } from "@/components/Brand";
import { toast } from "@/components/Toast";

type Phase =
  | { k: "loading" }
  | { k: "ballot"; page: VotePage; order: Candidate[] }
  | { k: "locked"; page: VotePage }
  | { k: "closed"; page: VotePage; results: ResultOut | null }
  | { k: "notmember" }
  | { k: "notfound" }
  | { k: "admin" };

function Shell({ children }: { children: React.ReactNode }) {
  const s = useSession();
  const navigate = useNavigate();
  return (
    <div className="relative z-[2] mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <div className="mb-8 flex justify-center">
        <button
          onClick={() => s.token && navigate(homeFor(s.role))}
          className="ring-focus rounded-xl"
          aria-label="Peer Rank home"
        >
          <Wordmark size={34} />
        </button>
      </div>
      {children}
    </div>
  );
}

// A "back to home" button for the post-vote screens (member → /home).
function BackHome() {
  const s = useSession();
  const navigate = useNavigate();
  if (!s.token) return null;
  return (
    <div className="mt-6 flex justify-center">
      <Button variant="glass" leftIcon={<Home className="h-[18px] w-[18px]" />} onClick={() => navigate(homeFor(s.role))}>
        Back to home
      </Button>
    </div>
  );
}

function Notice({
  icon,
  tone,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="glass-strong mx-auto max-w-md rounded-xl3 p-9 text-center"
    >
      <div className={`mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl ${tone}`}>{icon}</div>
      <h2 className="text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/55">{message}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </motion.div>
  );
}

export default function Vote() {
  const { token = "" } = useParams();
  const s = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const switchAccount = useCallback(() => {
    session.clear();
    navigate("/login", { state: { from: `/vote/${token}` } });
  }, [navigate, token]);

  const load = useCallback(async () => {
    setPhase({ k: "loading" });
    try {
      const page = await api<VotePage>(`/vote/${token}`);
      if (page.status === "closed") {
        let results: ResultOut | null = null;
        try {
          results = await api<ResultOut>(`/vote/${token}/results`);
        } catch {
          results = null;
        }
        setPhase({ k: "closed", page, results });
      } else if (page.already_voted) {
        setPhase({ k: "locked", page });
      } else {
        setPhase({ k: "ballot", page, order: page.candidates });
      }
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) setPhase({ k: "notmember" });
      else if (err.status === 404) setPhase({ k: "notfound" });
      else {
        toast(err.message || "Could not load this round", "err");
        setPhase({ k: "notfound" });
      }
    }
  }, [token]);

  useEffect(() => {
    if (!s.token || s.role === "admin") return;
    load();
  }, [s.token, s.role, load]);

  // Auto-reveal: while a voter is on the "Ballot locked in" screen, quietly poll
  // for closure. The round can close early (everyone voted) or on the deadline;
  // either way the screen flips to the results podium — no manual refresh, and
  // no loader flash (we only swap phase once it's actually closed).
  useEffect(() => {
    if (phase.k !== "locked") return;
    let cancelled = false;
    const check = async () => {
      try {
        const page = await api<VotePage>(`/vote/${token}`);
        if (!cancelled && page.status === "closed") {
          const results = await api<ResultOut>(`/vote/${token}/results`).catch(() => null);
          setPhase({ k: "closed", page, results });
        }
      } catch {
        /* transient — try again next tick */
      }
    };
    const id = setInterval(check, 8000); // poll every 8s while locked
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", check); // instant re-check when tab refocuses
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", check);
    };
  }, [phase.k, token]);

  // Auth gate — send to login, remember where we were headed.
  if (!s.token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (s.role === "admin") {
    return (
      <Shell>
        <Notice
          icon={<ShieldAlert className="h-8 w-8" />}
          tone="bg-amber-400/15 text-amber-300"
          title="Admins don't vote here"
          message="This link is for team members. Sign in with a member account to cast a ballot."
          action={<Button variant="glass" onClick={switchAccount}>Use another account</Button>}
        />
      </Shell>
    );
  }

  async function submit() {
    if (phase.k !== "ballot" || submitting) return;
    setSubmitting(true);
    try {
      await api(`/vote/${token}`, {
        method: "POST",
        body: { ranked_member_ids: phase.order.map((c) => c.id) },
      });
      toast("Ballot submitted — thank you!", "ok");
      // This vote may have been the last one, auto-closing the round — re-check
      // so the voter lands straight on the results podium if so.
      try {
        const page = await api<VotePage>(`/vote/${token}`);
        if (page.status === "closed") {
          const results = await api<ResultOut>(`/vote/${token}/results`).catch(() => null);
          setPhase({ k: "closed", page, results });
        } else {
          setPhase({ k: "locked", page });
        }
      } catch {
        setPhase({ k: "locked", page: phase.page });
      }
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || "Could not submit", "err");
      if (err.status === 409) load();
      setSubmitting(false);
    }
  }

  return (
    <Shell>
      <AnimatePresence mode="wait">
        {phase.k === "loading" ? (
          <motion.div key="l" exit={{ opacity: 0 }}>
            <OrbLoader label="Loading your ballot…" />
          </motion.div>
        ) : phase.k === "notmember" ? (
          <Notice
            key="nm"
            icon={<Ban className="h-8 w-8" />}
            tone="bg-rose-500/15 text-rose-400"
            title="You're not on this team"
            message={`You're signed in as ${s.email}, which isn't on the roster for this round. Try another account.`}
            action={<Button variant="glass" onClick={switchAccount}>Use another account</Button>}
          />
        ) : phase.k === "notfound" ? (
          <Notice
            key="nf"
            icon={<LinkIcon className="h-8 w-8" />}
            tone="bg-white/8 text-white/60"
            title="Voting link not found"
            message="This voting round doesn't exist or has been removed. Check the link and try again."
            action={<Button variant="glass" onClick={() => navigate("/home")}>Go home</Button>}
          />
        ) : phase.k === "locked" ? (
          <LockedView key="lk" page={phase.page} />
        ) : phase.k === "closed" ? (
          <ClosedView key="cl" page={phase.page} results={phase.results} />
        ) : (
          <motion.div
            key="ballot"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-6 text-center">
              <p className="text-[13px] font-medium uppercase tracking-wider text-cyan-glow/80">
                {phase.page.team_name}
              </p>
              <h1 className="mt-1.5 text-3xl">{phase.page.round_name}</h1>
              <p className="mt-2 text-[14px] text-white/50">
                Drag to rank your teammates best-first · <Countdown end={phase.page.end_at} />
              </p>
            </div>

            <GlassCard tilt={false} className="p-4 sm:p-5">
              <Reorder.Group
                axis="y"
                values={phase.order}
                onReorder={(order) => setPhase({ ...phase, order })}
                className="flex flex-col gap-2.5"
              >
                {phase.order.map((c, i) => (
                  <Reorder.Item
                    key={c.id}
                    value={c}
                    whileDrag={{ scale: 1.03, zIndex: 10 }}
                    className="group flex cursor-grab items-center gap-3 rounded-xl2 border border-white/8 bg-white/[0.03] px-3 py-2.5 active:cursor-grabbing"
                  >
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[14px] font-bold tabnums ${
                        i === 0
                          ? "bg-gradient-to-br from-[#f5d580] to-[#e0b25a] text-ink-950"
                          : "bg-white/8 text-white/60"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <Avatar name={c.display_name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-white/90">{c.display_name}</p>
                      <p className="truncate font-mono text-[12px] text-white/40">{c.email}</p>
                    </div>
                    <GripVertical className="h-5 w-5 shrink-0 text-white/25 transition group-hover:text-white/50" />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </GlassCard>

            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="flex items-center gap-1.5 text-[13px] text-white/40">
                <ArrowUp className="h-3.5 w-3.5" /> Top = most valued
              </p>
              <Button
                size="lg"
                loading={submitting}
                onClick={submit}
                leftIcon={<Trophy className="h-5 w-5" />}
              >
                Submit ranking
              </Button>
            </div>
            <p className="mt-4 text-center text-[12px] text-white/35">
              Signed in as {phase.page.signed_in_as} · your ballot is anonymous.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function LockedView({ page }: { page: VotePage }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong mx-auto max-w-md rounded-xl3 p-9 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.1 }}
        className="relative mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-glow/25 to-teal-glow/10 text-emerald-300"
      >
        <span className="absolute inset-0 animate-pulse-ring rounded-full border border-emerald-glow/40" />
        <CheckCircle2 className="h-10 w-10" />
      </motion.div>
      <h2 className="text-2xl">Ballot locked in</h2>
      <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/55">
        Thanks for ranking your team. Your vote is anonymous and can't be changed.
        The leaderboard unlocks when <b className="text-white/80">{page.round_name}</b> closes.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] text-white/60">
        <Lock className="h-3.5 w-3.5" /> Results <Countdown end={page.end_at} />
      </div>
      <BackHome />
    </motion.div>
  );
}

function ClosedView({ page, results }: { page: VotePage; results: ResultOut | null }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#f5d580]/15 text-[#f5d580]">
          <Trophy className="h-7 w-7" />
        </div>
        <h1 className="text-3xl">{page.round_name}</h1>
        <p className="mt-1.5 text-[14px] text-white/50">Final leaderboard · {page.team_name}</p>
      </div>
      <GlassCard tilt={false} className="p-5 sm:p-6">
        {results ? (
          <Leaderboard data={results} />
        ) : (
          <p className="py-10 text-center text-[14px] text-white/45">
            This round is closed. Results aren't available.
          </p>
        )}
      </GlassCard>
      <BackHome />
    </motion.div>
  );
}
