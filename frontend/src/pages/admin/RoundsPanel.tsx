import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Radio,
  Copy,
  BarChart2,
  Trophy,
  Ban,
  Check,
  Clock,
} from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, Avatar, Spinner } from "@/components/ui/Bits";
import { EmptyState } from "@/components/ui/EmptyState";
import { Countdown } from "@/components/ui/Countdown";
import { confirmDialog } from "@/components/ui/Modal";
import { Leaderboard } from "@/components/Leaderboard";
import { api } from "@/lib/api";
import type { Team, Round, Participation, ResultOut } from "@/lib/types";
import { fmtDateTime, voteLink } from "@/lib/format";
import { toast } from "@/components/Toast";
import { listContainer, listItem } from "@/components/PageTransition";

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    p(d.getMonth() + 1) +
    "-" +
    p(d.getDate()) +
    "T" +
    p(d.getHours()) +
    ":" +
    p(d.getMinutes())
  );
}

const DURATIONS = [
  { label: "10 min", ms: 10 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "1 day", ms: 24 * 60 * 60 * 1000 },
  { label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
];

export function RoundsPanel({
  projectId,
  teams,
  rounds,
  reload,
}: {
  projectId: number;
  teams: Team[];
  rounds: Round[];
  reload: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<number | "">("");
  const [opens, setOpens] = useState(localInput(new Date()));
  const [closes, setCloses] = useState(localInput(new Date(Date.now() + 10 * 60 * 1000)));
  const [busy, setBusy] = useState(false);

  function openForm() {
    if (!teams.length) return toast("Create a team first", "err");
    const now = new Date();
    setOpens(localInput(now));
    setCloses(localInput(new Date(now.getTime() + 10 * 60 * 1000)));
    setTeamId(teams[0].id);
    setName("");
    setCreating(true);
  }

  function setDuration(ms: number) {
    const base = opens ? new Date(opens) : new Date();
    setCloses(localInput(new Date(base.getTime() + ms)));
  }

  async function create() {
    if (!name.trim() || !teamId || !opens || !closes) return toast("Fill in all fields", "err");
    setBusy(true);
    try {
      await api(`/projects/${projectId}/rounds`, {
        method: "POST",
        body: {
          name: name.trim(),
          team_id: teamId,
          start_at: new Date(opens).toISOString(),
          end_at: new Date(closes).toISOString(),
        },
      });
      toast("Round opened", "ok");
      setCreating(false);
      reload();
    } catch (e: any) {
      toast(e?.message || "Could not open round", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg text-white/80">Rounds &amp; results</h2>
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => (creating ? setCreating(false) : openForm())}>
          {creating ? "Close" : "Open a round"}
        </Button>
      </div>

      <AnimatePresence>
        {creating ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden"
          >
            <GlassCard tilt={false} className="p-6">
              <Input label="Round name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              <div className="mt-4">
                <label className="mb-2 block text-[13px] text-white/50">Team</label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(Number(e.target.value))}
                  className="ring-focus h-12 w-full rounded-xl2 border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white/90 outline-none focus:border-cyan-glow/50"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id} className="bg-ink-800">
                      {t.name} ({t.members.length})
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-[13px] text-white/50">Opens</label>
                  <input
                    type="datetime-local"
                    value={opens}
                    onChange={(e) => setOpens(e.target.value)}
                    className="ring-focus h-12 w-full rounded-xl2 border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white/90 outline-none focus:border-cyan-glow/50 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-[13px] text-white/50">Closes</label>
                  <input
                    type="datetime-local"
                    value={closes}
                    onChange={(e) => setCloses(e.target.value)}
                    className="ring-focus h-12 w-full rounded-xl2 border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white/90 outline-none focus:border-cyan-glow/50 [color-scheme:dark]"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setDuration(d.ms)}
                    className="ring-focus flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-white/60 transition hover:border-cyan-glow/40 hover:text-white"
                  >
                    <Clock className="h-3.5 w-3.5" /> {d.label}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <Button variant="glass" onClick={() => setCreating(false)}>Cancel</Button>
                <Button loading={busy} onClick={create} leftIcon={<Radio className="h-4 w-4" />}>
                  Open round
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {rounds.length === 0 && !creating ? (
        <EmptyState
          icon={<Radio className="h-7 w-7" />}
          title="No rounds yet"
          message="Open a voting round to start collecting anonymous rankings."
          action={<Button leftIcon={<Plus className="h-[18px] w-[18px]" />} onClick={openForm}>Open a round</Button>}
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          {rounds.map((r) => (
            <motion.div key={r.id} variants={listItem}>
              <RoundCard round={r} reload={reload} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function RoundCard({ round, reload }: { round: Round; reload: () => void }) {
  const open = round.status === "open";
  const [panel, setPanel] = useState<null | "part" | "res">(null);
  const [closing, setClosing] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(voteLink(round.vote_token));
      toast("Link copied", "ok");
    } catch {
      toast("Copy failed", "err");
    }
  }

  async function closeNow() {
    const ok = await confirmDialog({
      title: "Close this round?",
      message: "Voting stops immediately and the leaderboard is computed and frozen. This can't be undone.",
      confirmText: "Close round",
      danger: true,
    });
    if (!ok) return;
    setClosing(true);
    try {
      await api(`/rounds/${round.id}/close`, { method: "POST" });
      toast("Round closed", "ok");
      reload();
    } catch (e: any) {
      toast(e?.message || "Could not close", "err");
      setClosing(false);
    }
  }

  return (
    <GlassCard tilt={false} className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg">{round.name}</h3>
          <p className="mt-1 text-[13px] text-white/45">
            {fmtDateTime(round.start_at)} → {fmtDateTime(round.end_at)}
            {open ? (
              <>
                {" · "}
                <span className="text-cyan-glow/80">
                  <Countdown end={round.end_at} />
                </span>
              </>
            ) : null}
          </p>
        </div>
        <Badge tone={open ? "open" : "closed"} dot={open}>
          {open ? "Open" : "Closed"}
        </Badge>
      </div>

      {/* link row */}
      <div className="mt-4 flex items-center gap-2 rounded-xl2 border border-white/8 bg-white/[0.02] py-1.5 pl-3.5 pr-1.5">
        <span className="flex-1 truncate font-mono text-[12.5px] text-white/45">{voteLink(round.vote_token)}</span>
        <Button size="sm" variant="glass" leftIcon={<Copy className="h-3.5 w-3.5" />} onClick={copy} magnetic={false}>
          Copy
        </Button>
      </div>

      {/* actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={panel === "part" ? "primary" : "glass"}
          leftIcon={<BarChart2 className="h-4 w-4" />}
          magnetic={false}
          onClick={() => setPanel(panel === "part" ? null : "part")}
        >
          Participation
        </Button>
        {open ? (
          <Button size="sm" variant="danger" leftIcon={<Ban className="h-4 w-4" />} loading={closing} magnetic={false} onClick={closeNow}>
            Close now
          </Button>
        ) : (
          <Button
            size="sm"
            variant={panel === "res" ? "primary" : "glass"}
            leftIcon={<Trophy className="h-4 w-4" />}
            magnetic={false}
            onClick={() => setPanel(panel === "res" ? null : "res")}
          >
            View results
          </Button>
        )}
      </div>

      <AnimatePresence>
        {panel === "part" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ParticipationView roundId={round.id} live={open} />
          </motion.div>
        ) : panel === "res" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <ResultsView roundId={round.id} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3">
      <div className="text-[12px] text-white/45">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabnums">{value}</div>
    </div>
  );
}

function ParticipationView({ roundId, live }: { roundId: number; live: boolean }) {
  const [data, setData] = useState<Participation | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function draw() {
      try {
        const p = await api<Participation>(`/rounds/${roundId}/participation`);
        if (alive) setData(p);
      } catch {
        /* ignore transient */
      }
    }
    draw();
    if (live) timer.current = window.setInterval(draw, 5000);
    return () => {
      alive = false;
      if (timer.current) clearInterval(timer.current);
    };
  }, [roundId, live]);

  if (!data) {
    return (
      <div className="mt-4 flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-white/[0.07] pt-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Members" value={data.total} />
        <Metric label="Submitted" value={data.submitted} />
        <Metric label="Pending" value={data.pending} />
        <Metric label="Completion" value={`${data.completion_pct}%`} />
      </div>
      <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-teal-glow to-cyan-glow"
          animate={{ width: `${data.completion_pct}%` }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
      <p className="mb-3 mt-5 text-[12.5px] text-white/40">Who voted — never what they voted</p>
      <div className="flex flex-col divide-y divide-white/[0.05]">
        {data.rows.map((row) => (
          <div key={row.email} className="flex items-center gap-3 py-2.5">
            <Avatar name={row.email} size={30} />
            <span className="flex-1 truncate font-mono text-[13px] text-white/70">{row.email}</span>
            {row.voted ? (
              <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-300">
                <Check className="h-4 w-4" /> Voted
              </span>
            ) : (
              <span className="text-[12.5px] text-white/35">Pending</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultsView({ roundId }: { roundId: number }) {
  const [data, setData] = useState<ResultOut | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<ResultOut>(`/rounds/${roundId}/results`)
      .then((r) => alive && setData(r))
      .catch((e) => alive && setErr(e?.message || "No results"));
    return () => {
      alive = false;
    };
  }, [roundId]);

  return (
    <div className="mt-5 border-t border-white/[0.07] pt-5">
      <div className="mb-4 flex items-center gap-2 text-[14px] font-medium text-white/80">
        <Trophy className="h-4 w-4 text-[#f5d580]" /> Final leaderboard
      </div>
      {err ? (
        <p className="py-6 text-center text-[14px] text-white/45">{err}</p>
      ) : !data ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        <Leaderboard data={data} />
      )}
    </div>
  );
}
