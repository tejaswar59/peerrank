import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Reorder, motion } from "framer-motion";
import {
  GripVertical,
  Trophy,
  Lock,
  LinkIcon,
  CheckCircle2,
  ArrowUp,
  ArrowLeft,
  ShieldCheck,
  ChevronUp,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { BallotPage, Candidate, PollStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { OrbLoader, Avatar } from "@/components/ui/Bits";
import GlassCard from "@/components/ui/GlassCard";
import { Countdown } from "@/components/ui/Countdown";
import { Wordmark } from "@/components/Brand";
import { toast } from "@/components/Toast";

// Voters NEVER see results — there is no vote_token-scoped results endpoint
// at all (see app/routers/polls.py). Once a poll closes, this is the only
// thing anyone with the voter link ever sees, whether they voted or not.
type Phase =
  | { k: "loading" }
  | { k: "select"; status: PollStatus }
  | { k: "ballot"; page: BallotPage; order: Candidate[] }
  | { k: "locked"; memberName: string; closesAt: string }
  | { k: "closed"; pollName: string }
  | { k: "notfound" };

// Remembers "I already voted as this name" per poll link, purely so a page
// refresh doesn't bounce someone back to "select your name" — there's no
// account behind it, so it's a convenience, not a security boundary. The
// server is still the only thing that actually blocks a name from voting twice.
function votedKey(token: string) {
  return `pr_voted_${token}`;
}
function readVoted(token: string): { memberId: number; memberName: string } | null {
  try {
    const raw = localStorage.getItem(votedKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeVoted(token: string, memberId: number, memberName: string) {
  try {
    localStorage.setItem(votedKey(token), JSON.stringify({ memberId, memberName }));
  } catch {
    /* localStorage unavailable — refresh will just re-ask for a name */
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="relative z-[2] mx-auto min-h-screen w-full max-w-2xl px-4 py-10">
      <div className="mb-8 flex justify-center">
        <button onClick={() => navigate("/")} className="ring-focus rounded-xl" aria-label="Peer Rank home">
          <Wordmark size={34} />
        </button>
      </div>
      {children}
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
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setPhase({ k: "loading" });
    try {
      const status = await api<PollStatus>(`/polls/${token}/status`);
      if (status.status === "closed") {
        setPhase({ k: "closed", pollName: status.name });
        return;
      }
      const mine = readVoted(token);
      if (mine && status.members.some((m) => m.id === mine.memberId && m.voted)) {
        setPhase({ k: "locked", memberName: mine.memberName, closesAt: status.closes_at });
        return;
      }
      setPhase({ k: "select", status });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404) setPhase({ k: "notfound" });
      else {
        toast(err.message || "Could not load this poll", "err");
        setPhase({ k: "notfound" });
      }
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // While waiting on the timer (locked) or before picking a name (select),
  // quietly poll so the screen flips to results the instant the poll closes
  // — no manual refresh needed.
  useEffect(() => {
    if (phase.k !== "locked" && phase.k !== "select") return;
    let cancelled = false;
    const check = async () => {
      try {
        const status = await api<PollStatus>(`/polls/${token}/status`);
        if (cancelled) return;
        if (status.status === "closed") {
          setPhase({ k: "closed", pollName: status.name });
        } else if (phase.k === "select") {
          setPhase({ k: "select", status });
        }
      } catch {
        /* transient — try again next tick */
      }
    };
    const id = setInterval(check, phase.k === "select" ? 4000 : 8000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.k, token]);

  // Swap a row with its neighbour. Same state shape as onReorder, so the
  // buttons and dragging are interchangeable rather than two code paths.
  function move(index: number, delta: -1 | 1) {
    setPhase((prev) => {
      if (prev.k !== "ballot") return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.order.length) return prev;
      const order = [...prev.order];
      [order[index], order[target]] = [order[target], order[index]];
      return { ...prev, order };
    });
  }

  async function pick(memberId: number) {
    try {
      const page = await api<BallotPage>(`/polls/${token}/candidates/${memberId}`);
      setPhase({ k: "ballot", page, order: page.candidates });
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || "Could not open your ballot", "err");
      load();
    }
  }

  async function submit() {
    if (phase.k !== "ballot" || submitting) return;
    setSubmitting(true);
    try {
      await api(`/polls/${token}/vote`, {
        method: "POST",
        body: { member_id: phase.page.member_id, ranked_member_ids: phase.order.map((c) => c.id) },
      });
      writeVoted(token, phase.page.member_id, phase.page.member_name);
      toast("Ballot submitted — thank you!", "ok");
      // This vote may have been the last one, auto-closing the poll — re-check
      // so the voter lands straight on the results if so.
      try {
        const status = await api<PollStatus>(`/polls/${token}/status`);
        if (status.status === "closed") {
          setPhase({ k: "closed", pollName: status.name });
        } else {
          setPhase({ k: "locked", memberName: phase.page.member_name, closesAt: status.closes_at });
        }
      } catch {
        setPhase({ k: "locked", memberName: phase.page.member_name, closesAt: phase.page.closes_at });
      }
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || "Could not submit", "err");
      setSubmitting(false);
      if (err.status === 409) load();
    }
  }

  // NO AnimatePresence here. This is a state machine, not a list: exactly one
  // phase may ever be mounted. Wrapping it in AnimatePresence left every
  // previous phase in the DOM waiting on an exit animation that never
  // completed, so "Loading…", "Select your name" and the ballot all stacked up
  // — the page grew to twice its height, the ballot ended up pushed below the
  // fold at opacity 0, and stale rows showed through above the card. Each phase
  // animates itself in on mount; nothing needs to animate out.
  return (
    <Shell>
      {phase.k === "loading" ? (
        <OrbLoader label="Loading…" />
      ) : phase.k === "notfound" ? (
        <Notice
          icon={<LinkIcon className="h-8 w-8" />}
          tone="bg-white/8 text-white/60"
          title="Voting link not found"
          message="This poll doesn't exist or has been removed. Check the link and try again."
          action={<Button variant="glass" onClick={() => navigate("/")}>Go home</Button>}
        />
      ) : phase.k === "select" ? (
        <SelectNameView status={phase.status} onPick={pick} />
      ) : phase.k === "locked" ? (
        <LockedView memberName={phase.memberName} closesAt={phase.closesAt} />
      ) : phase.k === "closed" ? (
        <ClosedView pollName={phase.pollName} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-6 text-center">
              {/* Same step language as the name-picking screen, so it's clear
                  this is the part where the vote actually happens. */}
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-cyan-glow/25 bg-cyan-glow/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-cyan-100">
                <span className="truncate">Step 2 of 2 · Voting as {phase.page.member_name}</span>
              </span>
              <h1 className="wrap-anywhere mt-1.5 text-3xl leading-tight">{phase.page.poll_name}</h1>
              <p className="mt-2 text-[14px] text-white/50">
                Drag or use the arrows to rank, best first · <Countdown end={phase.page.closes_at} />
              </p>
              {/* Escape hatch for picking the wrong name. Safe to offer: opening
                  a ballot is a read-only step — nothing is recorded until
                  Submit — so nobody is locked into a name by mistake. */}
              {/* Needs its own opaque surface: as bare low-opacity text it sat
                  directly over the animated 3D background and the moving shapes
                  read straight through it, so the control was easy to miss. */}
              <button
                type="button"
                onClick={() => load()}
                className="ring-focus mt-3.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/15 bg-ink-950/75 px-3.5 py-1.5 text-[12.5px] font-medium text-white/75 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.8)] backdrop-blur-md transition hover:border-cyan-glow/45 hover:bg-ink-950/90 hover:text-cyan-100"
              >
                <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Not {phase.page.member_name}? Pick a different name</span>
              </button>
            </div>

            <GlassCard tilt={false} className="p-4 sm:p-5">
              <Reorder.Group
                axis="y"
                values={phase.order}
                onReorder={(order) => setPhase({ ...phase, order })}
                className="flex flex-col gap-2.5"
              >
                {phase.order.map((c, i) => {
                  // Same formula as the backend (app/scoring.py): position i
                  // (0-based, best first) earns (L - i) + 1 points on THIS
                  // ballot. Shown live so ranking feels like it means something,
                  // not just an abstract order.
                  const points = phase.order.length - i + 1;
                  return (
                    <Reorder.Item
                      key={c.id}
                      value={c}
                      whileDrag={{ scale: 1.03, zIndex: 10 }}
                      className="group/row flex cursor-grab items-center gap-3 rounded-xl2 border border-white/8 bg-white/[0.03] px-3 py-2.5 active:cursor-grabbing"
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
                      </div>
                      <span className="shrink-0 rounded-full border border-cyan-glow/25 bg-cyan-glow/10 px-2.5 py-1 text-[12px] font-semibold tabnums text-cyan-100">
                        +{points} pt{points === 1 ? "" : "s"}
                      </span>
                      {/* Dragging is the nice path, not the only one: these give
                          a reliable way to reorder on any device and make the
                          ballot usable by keyboard, which drag alone never is. */}
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label={`Move ${c.display_name} up`}
                          disabled={i === 0}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => move(i, -1)}
                          className="ring-focus rounded text-white/35 transition hover:text-cyan-glow disabled:pointer-events-none disabled:opacity-20"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${c.display_name} down`}
                          disabled={i === phase.order.length - 1}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => move(i, 1)}
                          className="ring-focus rounded text-white/35 transition hover:text-cyan-glow disabled:pointer-events-none disabled:opacity-20"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                      <GripVertical className="h-5 w-5 shrink-0 text-white/25 transition group-hover/row:text-white/50" />
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </GlassCard>

            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="flex items-center gap-1.5 text-[13px] text-white/40">
                <ArrowUp className="h-3.5 w-3.5" /> Top = most valued = most points
              </p>
              <Button size="lg" loading={submitting} onClick={submit} leftIcon={<Trophy className="h-5 w-5" />}>
                Submit ranking
              </Button>
            </div>
            <p className="mt-4 text-center text-[12px] text-white/35">
              Points are just this ballot's contribution — everyone's ballots get added together for the final
              leaderboard. Your ranking itself stays anonymous; nobody, including the poll's creator, can see who
              ranked what.
            </p>
        </motion.div>
      )}
    </Shell>
  );
}

function SelectNameView({ status, onPick }: { status: PollStatus; onPick: (id: number) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      {/* The question used to be the hero here, with "select your name" as a
          small label above it. That reads as "here is the question, pick your
          answer" — so someone opening the link for the first time taps the
          person they want to vote for. The instruction is the hero now, and the
          question is demoted to context, because on THIS screen the only task
          is identifying yourself. */}
      <div className="mb-5 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-glow/25 bg-cyan-glow/10 px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-cyan-100">
          Step 1 of 2
        </span>
        <h1 className="mt-3 text-[26px] font-semibold leading-tight sm:text-[28px]">Which one is you?</h1>
        <p className="mx-auto mt-2 max-w-[40ch] text-[14px] leading-relaxed text-white/55">
          Tap your own name below. You're not voting yet — you'll rank everyone else on the next screen.
        </p>
        <p className="wrap-anywhere mx-auto mt-3 max-w-[42ch] text-[12.5px] text-white/35">
          Ranking for: <span className="font-medium text-white/60">{status.name}</span>
        </p>
      </div>
      <GlassCard tilt={false} className="p-3 sm:p-4">
        <div className="flex flex-col gap-2">
          {status.members.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={m.voted}
              onClick={() => onPick(m.id)}
              className={`ring-focus group/row flex items-center gap-3 rounded-xl2 border px-4 py-3 text-left transition ${
                m.voted
                  ? "cursor-not-allowed border-white/5 bg-white/[0.015] opacity-50"
                  : "border-white/8 bg-white/[0.03] hover:border-cyan-glow/40 hover:bg-white/[0.05]"
              }`}
            >
              <Avatar name={m.display_name} size={38} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white/90" title={m.display_name}>
                {m.display_name}
              </span>
              {m.voted ? (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/35">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Already voted
                </span>
              ) : (
                // Spells out what tapping a row means, so the list can't be
                // mistaken for a ballot.
                <span className="hidden shrink-0 items-center gap-1 text-[12px] font-medium text-cyan-glow/90 sm:flex sm:opacity-0 sm:transition-opacity sm:group-hover/row:opacity-100">
                  This is me <ArrowRight className="h-3.5 w-3.5" />
                </span>
              )}
            </button>
          ))}
        </div>
      </GlassCard>
      {/* Turnout + countdown live here rather than under the heading, so they
          can't compete with the instruction for attention. */}
      <p className="mt-4 text-center text-[12px] text-white/35">
        {status.voted_count} of {status.total_members} voted · closes in{" "}
        <Countdown end={status.closes_at} phrase={false} />
      </p>
    </motion.div>
  );
}

function LockedView({ memberName, closesAt }: { memberName: string; closesAt: string }) {
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
      <p className="wrap-anywhere mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/55">
        Thanks, <b className="text-white/80">{memberName}</b>. Your vote is anonymous and can't be changed.
      </p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[13px] text-white/60">
        <Lock className="h-3.5 w-3.5" /> Voting <Countdown end={closesAt} />
      </div>
      <p className="mt-4 text-[12px] text-white/35">Results go to whoever created this poll — not shown here.</p>
    </motion.div>
  );
}

function ClosedView({ pollName }: { pollName: string }) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard tilt={false} className="p-9 text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.06] text-white/50">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="wrap-anywhere text-2xl leading-tight">{pollName}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-white/55">
          Voting has closed. Thanks for taking part — results go only to whoever created this poll.
        </p>
      </GlassCard>
      <div className="mt-6 flex justify-center">
        <Button variant="glass" leftIcon={<ArrowLeft className="h-[18px] w-[18px]" />} onClick={() => navigate("/")}>
          Start a new poll
        </Button>
      </div>
    </motion.div>
  );
}
