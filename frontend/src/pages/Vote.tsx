import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import {
  GripVertical,
  Trophy,
  Lock,
  LinkIcon,
  CheckCircle2,
  ArrowUp,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { BallotPage, Candidate, PollStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { OrbLoader, Avatar } from "@/components/ui/Bits";
import { Countdown } from "@/components/ui/Countdown";
import { Wordmark } from "@/components/Brand";
import { toast } from "@/components/Toast";
// Voters NEVER see results — there is no vote_token-scoped results endpoint.
type Phase =
  | { k: "loading" }
  | { k: "select"; status: PollStatus }
  | { k: "ballot"; page: BallotPage; order: Candidate[] }
  | { k: "locked"; memberName: string; closesAt: string; status?: PollStatus }
  | { k: "closed"; pollName: string }
  | { k: "notfound" }
  | { k: "forbidden" };

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
    /* localStorage unavailable */
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex h-14 items-center border-b border-[#D2D2D7] bg-white px-4">
        <button
          onClick={() => navigate("/")}
          className="ring-focus rounded-lg"
          aria-label="Peerrank home"
        >
          <Wordmark />
        </button>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        {children}
      </div>
    </div>
  );
}

function Notice({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  tone?: string; // accepted for compat, unused
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="mx-auto max-w-md rounded-2xl border border-[#D2D2D7] bg-white p-9 text-center shadow-card"
    >
      <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#F5F5F7] text-[#6E6E73]">
        {icon}
      </div>
      <h2 className="text-[24px] font-semibold text-[#1D1D1F]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-[#6E6E73]">{message}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </motion.div>
  );
}

export default function Vote() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [submitting, setSubmitting] = useState(false);
  const [hasReordered, setHasReordered] = useState(false);

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
        setPhase({ k: "locked", memberName: mine.memberName, closesAt: status.closes_at, status });
        return;
      }
      // Auto-select via server-resolved my_member_id — the backend matched
      // our signed-in email to the roster, so we never see anyone else's email.
      if (status.my_member_id != null) {
        const mySelf = status.members.find((m) => m.id === status.my_member_id);
        if (mySelf?.voted) {
          setPhase({ k: "locked", memberName: mySelf.display_name, closesAt: status.closes_at, status });
        } else if (mySelf) {
          await pick(mySelf.id);
        } else {
          setPhase({ k: "forbidden" });
        }
        return;
      }
      setPhase({ k: "forbidden" });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404) setPhase({ k: "notfound" });
      else if (err.status === 403) setPhase({ k: "forbidden" });
      else {
        toast(err.message || "Could not load this poll", "err");
        setPhase({ k: "notfound" });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

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
        } else if (phase.k === "locked") {
          setPhase((prev) =>
            prev.k === "locked"
              ? { ...prev, status }
              : prev
          );
        }
      } catch {
        /* transient */
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

  async function pick(memberId: number) {
    try {
      const page = await api<BallotPage>(`/polls/${token}/candidates/${memberId}`);
      setPhase({ k: "ballot", page, order: page.candidates });
      setHasReordered(false);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 403) {
        setPhase({ k: "forbidden" });
        return;
      }
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
        body: {
          member_id: phase.page.member_id,
          ranked_member_ids: phase.order.map((c) => c.id),
        },
      });
      writeVoted(token, phase.page.member_id, phase.page.member_name);
      toast("Ballot submitted — thank you!", "ok");
      try {
        const status = await api<PollStatus>(`/polls/${token}/status`);
        if (status.status === "closed") {
          setPhase({ k: "closed", pollName: status.name });
        } else {
          setPhase({ k: "locked", memberName: phase.page.member_name, closesAt: status.closes_at, status });
        }
      } catch {
        setPhase({
          k: "locked",
          memberName: phase.page.member_name,
          closesAt: phase.page.closes_at,
        });
      }
    } catch (e) {
      const err = e as ApiError;
      toast(err.message || "Could not submit", "err");
      setSubmitting(false);
      // 409 = already voted, 403 = poll closed while they were ranking. Both
      // mean the ballot is moot; reload so they land on the real state instead
      // of re-clicking Submit into the same error.
      if (err.status === 409 || err.status === 403) load();
    }
  }

  return (
    <Shell>
      <AnimatePresence>
        {phase.k === "loading" ? (
          <motion.div key="l" exit={{ opacity: 0 }}>
            <OrbLoader label="Loading…" />
          </motion.div>
        ) : phase.k === "notfound" ? (
          <Notice
            key="nf"
            icon={<LinkIcon className="h-8 w-8" />}
            title="Voting link not found"
            message="This poll doesn't exist or has been removed. Check the link and try again."
            action={
              <Button variant="glass" onClick={() => navigate("/")}>
                Go home
              </Button>
            }
          />
        ) : phase.k === "forbidden" ? (
          <Notice
            key="fb"
            icon={<ShieldCheck className="h-8 w-8" />}
            title="You're not on this poll"
            message="Your account's email isn't on this roster, so there's nothing here for you to vote on."
            action={
              <Button variant="glass" onClick={() => navigate("/")}>
                Go home
              </Button>
            }
          />
        ) : phase.k === "select" ? (
          <SelectNameView key="sel" status={phase.status} onPick={pick} />
        ) : phase.k === "locked" ? (
          <LockedView
            key="lk"
            memberName={phase.memberName}
            closesAt={phase.closesAt}
            status={phase.status}
            onExpired={load}
          />
        ) : phase.k === "closed" ? (
          <ClosedView key="cl" pollName={phase.pollName} />
        ) : (
          <motion.div
            key="ballot"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="mb-6">
              <p className="text-[13px] font-medium uppercase tracking-wider text-[#6E6E73]">
                Voting as {phase.page.member_name}
              </p>
              <h1 className="mt-1 text-[34px] font-bold text-[#1D1D1F]">
                {phase.page.poll_name}
              </h1>
              <p className="mt-1 text-[14px] text-[#6E6E73]">
                Drag to rank · best first · <Countdown end={phase.page.closes_at} />
              </p>
            </div>

            <div className="rounded-2xl border border-[#D2D2D7] bg-white shadow-card">
              <Reorder.Group
                axis="y"
                values={phase.order}
                onReorder={(order) => {
                  setPhase({ ...phase, order });
                  setHasReordered(true);
                }}
                className="flex flex-col divide-y divide-[#D2D2D7]"
              >
                {phase.order.map((c, i) => {
                  const points = phase.order.length - i + 1;
                  const moveItem = (dir: -1 | 1) => {
                    const next = [...phase.order];
                    const target = i + dir;
                    if (target < 0 || target >= next.length) return;
                    [next[i], next[target]] = [next[target], next[i]];
                    setPhase({ ...phase, order: next });
                    setHasReordered(true);
                  };
                  return (
                    <Reorder.Item
                      key={c.id}
                      value={c}
                      whileDrag={{ scale: 1.02, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", zIndex: 10 }}
                      className="group flex cursor-grab items-center gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl hover:bg-[#F5F5F7] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071E3]"
                      tabIndex={0}
                      aria-label={`${c.display_name}, rank ${i + 1}. Use arrow keys to move.`}
                      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                        if (e.key === "ArrowUp") { e.preventDefault(); moveItem(-1); }
                        if (e.key === "ArrowDown") { e.preventDefault(); moveItem(1); }
                      }}
                    >
                      <span className="w-8 shrink-0 text-right text-[17px] font-semibold tabnums text-[#6E6E73]">
                        {i + 1}
                      </span>
                      <Avatar name={c.display_name} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-medium text-[#1D1D1F]">
                          {c.display_name}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#D2D2D7] bg-[#F5F5F7] px-2.5 py-1 text-[12px] font-semibold tabnums text-[#6E6E73]">
                        +{points} pt{points === 1 ? "" : "s"}
                      </span>
                      <GripVertical className="h-5 w-5 shrink-0 text-[#AEAEB2] transition group-hover:text-[#6E6E73]" />
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
            </div>

            {/* Disclosure sits ABOVE the submit button on purpose: this app is
                not anonymous, and the voter has to be told before they commit. */}
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#D2D2D7] bg-[#F5F5F7] px-4 py-3">
              <Eye className="mt-px h-4 w-4 shrink-0 text-[#6E6E73]" aria-hidden />
              <p className="text-[13px] leading-[1.45] text-[#6E6E73]">
                <strong className="font-semibold text-[#1D1D1F]">Not anonymous.</strong> Your
                name is saved with your ranking, and this poll's admins can see exactly how you
                ranked each person. Other people on the roster cannot.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-[13px] text-[#6E6E73]">
                <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                {hasReordered
                  ? "Top = most valued = most points"
                  : "Move at least one person to enable Submit"}
              </p>
              <Button
                size="lg"
                block
                className="sm:w-auto"
                loading={submitting}
                disabled={!hasReordered}
                onClick={submit}
                leftIcon={<Trophy className="h-5 w-5" />}
              >
                Submit ranking
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}

function SelectNameView({ status, onPick }: { status: PollStatus; onPick: (id: number) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-6">
        <h1 className="text-[34px] font-bold text-[#1D1D1F]">{status.name}</h1>
        <p className="mt-2 text-[17px] text-[#6E6E73]">Who are you on this team?</p>
        <p className="mt-1 text-[14px] text-[#AEAEB2]">
          {status.voted_count} / {status.total_members} voted · closes in{" "}
          <Countdown end={status.closes_at} phrase={false} />
        </p>
      </div>

      <div className="rounded-2xl border border-[#D2D2D7] bg-white shadow-card">
        <div className="flex flex-col divide-y divide-[#D2D2D7]">
          {status.members.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={m.voted}
              onClick={() => onPick(m.id)}
              aria-label={m.voted ? `${m.display_name} — already voted` : m.display_name}
              className={`ring-focus flex items-center gap-3 px-4 py-3.5 text-left transition first:rounded-t-2xl last:rounded-b-2xl ${
                m.voted
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-[#F5F5F7]"
              }`}
            >
              <Avatar name={m.display_name} size={38} />
              <span className="flex-1 text-[17px] font-medium text-[#1D1D1F]">
                {m.display_name}
              </span>
              {m.voted ? (
                <span className="flex items-center gap-1.5 rounded-full bg-[#E8FAF0] px-2.5 py-0.5 text-[12px] font-medium text-[#1A7C3E]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Voted
                </span>
              ) : (
                <span className="rounded-full bg-[#F5F5F7] px-2.5 py-0.5 text-[12px] font-medium text-[#AEAEB2]">
                  Pending
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-[12px] text-[#AEAEB2]">
        Pick your own name — you'll then rank everyone else on the list.
      </p>
    </motion.div>
  );
}

function LockedView({
  memberName,
  closesAt,
  status,
  onExpired,
}: {
  memberName: string;
  closesAt: string;
  status?: PollStatus;
  onExpired?: () => void;
}) {
  const navigate = useNavigate();
  const pct =
    status && status.total_members
      ? Math.round((status.voted_count / status.total_members) * 100)
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-[480px] rounded-2xl border border-[#D2D2D7] bg-white p-10 text-center shadow-card"
    >
      {/* Static check circle — Apple-style restraint */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#34C759]/30 bg-[#E8FAF0]">
        <CheckCircle2 className="h-10 w-10 text-[#34C759]" />
      </div>

      <h2 className="text-[34px] font-bold text-[#1D1D1F]">Your ranking is in.</h2>
      <p className="mx-auto mt-2 max-w-sm text-[17px] leading-relaxed text-[#6E6E73]">
        Thanks, <strong className="text-[#1D1D1F]">{memberName}</strong>. Your ranking is recorded and can't be changed.
      </p>

      <div className="my-6 h-px bg-[#D2D2D7]" />

      <p className="text-[14px] text-[#6E6E73]">Poll closes in</p>
      <div
        className="mt-1 text-[34px] font-bold tabnums text-[#1D1D1F]"
        aria-live="polite"
        aria-atomic="true"
      >
        <Countdown end={closesAt} phrase={false} />
      </div>
      <p className="mt-2 text-[14px] text-[#AEAEB2]">
        This poll's admins see the leaderboard, and can see your individual ranking.
      </p>

      {status && (
        <>
          <div className="my-6 h-px bg-[#D2D2D7]" />
          <div className="flex items-center justify-between text-[14px] text-[#6E6E73]">
            <span>Team progress</span>
            <span>{status.voted_count}/{status.total_members} voted</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F5F7]">
            <motion.div
              className="h-full rounded-full bg-[#34C759]"
              initial={{ width: 0 }}
              animate={{ width: `${pct ?? 0}%` }}
              transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
        </>
      )}

      <div className="mt-6 flex items-center justify-center gap-2 rounded-full border border-[#D2D2D7] bg-[#F5F5F7] px-4 py-2 text-[13px] text-[#6E6E73]">
        <Lock className="h-3.5 w-3.5" /> Voting closes <Countdown end={closesAt} onEnd={onExpired} />
      </div>

      <Button
        variant="ghost"
        block
        className="mt-4"
        onClick={() => navigate("/")}
      >
        ← Back to home
      </Button>
    </motion.div>
  );
}

function ClosedView({ pollName }: { pollName: string }) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <div className="rounded-2xl border border-[#D2D2D7] bg-white p-9 text-center shadow-card">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#F5F5F7] text-[#AEAEB2]">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-[24px] font-semibold text-[#1D1D1F]">{pollName}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-[#6E6E73]">
          Voting has closed. Thanks for taking part — results go only to whoever created this poll.
        </p>
      </div>
      <div className="mt-6 flex justify-center">
        <Button variant="glass" onClick={() => navigate("/")}>
          ← Start a new poll
        </Button>
      </div>
    </motion.div>
  );
}
