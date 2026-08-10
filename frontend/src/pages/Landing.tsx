import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, Radio, Copy, Check, Clock, Sparkles, Trophy } from "lucide-react";
import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import GlassCard from "@/components/ui/GlassCard";
import { Avatar, Reveal } from "@/components/ui/Bits";
import { Countdown } from "@/components/ui/Countdown";
import { Leaderboard } from "@/components/Leaderboard";
import { api, ApiError } from "@/lib/api";
import type { Poll, PollStatus, ResultOut } from "@/lib/types";
import { voteLink } from "@/lib/format";
import { toast } from "@/components/Toast";

const MIN_MEMBERS = 3;
const MIN_DURATION = 1;
const MAX_DURATION = 24 * 60; // matches app/config.py's max_duration_minutes
const DURATIONS = [
  { label: "5 min", minutes: 5 },
  { label: "10 min", minutes: 10 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

function NameAdder({ names, onChange }: { names: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function add() {
    const n = draft.trim();
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) {
      toast("Already added", "err");
      return;
    }
    onChange([...names, n]);
    setDraft("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a name, press Enter…"
          className="ring-focus h-12 flex-1 rounded-xl2 border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white/90 outline-none transition focus:border-cyan-glow/50 placeholder:text-white/25"
        />
        <button
          type="button"
          onClick={add}
          className="ring-focus grid h-12 w-12 shrink-0 place-items-center rounded-xl2 bg-white/[0.06] text-cyan-glow transition hover:bg-white/[0.1]"
          aria-label="Add name"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      {names.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <AnimatePresence initial={false}>
            {names.map((n, i) => (
              <motion.span
                key={n}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 rounded-full border border-teal-glow/25 bg-teal-glow/10 px-3 py-1.5"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-teal-glow/80 text-[10px] font-bold text-ink-950 tabnums">
                  {i + 1}
                </span>
                <span className="text-[13px] text-teal-200">{n}</span>
                <button
                  type="button"
                  onClick={() => onChange(names.filter((x) => x !== n))}
                  className="text-teal-300/70 transition hover:text-rose-400"
                  aria-label={`Remove ${n}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (poll: Poll) => void }) {
  const [name, setName] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(10);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const isPreset = DURATIONS.some((d) => d.minutes === minutes);

  function applyCustom(raw: string) {
    setCustomDraft(raw);
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= MIN_DURATION && n <= MAX_DURATION) {
      setMinutes(n);
    }
  }

  async function create() {
    if (!name.trim()) return toast("Give it a question", "err");
    if (names.length < MIN_MEMBERS) {
      return toast(`Add at least ${MIN_MEMBERS} names before going live`, "err");
    }
    if (!(minutes >= MIN_DURATION && minutes <= MAX_DURATION)) {
      return toast(`Voting window must be between ${MIN_DURATION} and ${MAX_DURATION} minutes`, "err");
    }
    setBusy(true);
    try {
      const poll = await api<Poll>("/polls", {
        method: "POST",
        body: { name: name.trim(), member_names: names, duration_minutes: minutes },
      });
      toast("Poll is live", "ok");
      onCreated(poll);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not create the poll", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassCard tilt={false} className="p-7">
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-cyan-glow/80">
        <Sparkles className="h-3.5 w-3.5" /> One screen, that's it
      </div>
      <Input
        label="What are you ranking?"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        className="mt-4"
      />
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] text-white/50">Who's eligible</p>
          <span
            className={`text-[12px] font-medium ${names.length >= MIN_MEMBERS ? "text-emerald-glow" : "text-white/35"}`}
          >
            {names.length} / {MIN_MEMBERS} minimum
          </span>
        </div>
        <NameAdder names={names} onChange={setNames} />
        <p className="mt-2 pl-1 text-[12px] text-white/40">
          First names or nicknames work great — everyone picks their own off this list when they open the link.
        </p>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[13px] text-white/50">Voting window</p>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              onClick={() => {
                setMinutes(d.minutes);
                setCustomOpen(false);
              }}
              className={`ring-focus flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                !customOpen && minutes === d.minutes
                  ? "border-cyan-glow/50 bg-cyan-glow/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> {d.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomOpen(true);
              setCustomDraft(isPreset ? "" : String(minutes));
            }}
            className={`ring-focus flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
              customOpen || !isPreset
                ? "border-cyan-glow/50 bg-cyan-glow/15 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white"
            }`}
          >
            <Clock className="h-3.5 w-3.5" /> Custom
          </button>
        </div>

        <AnimatePresence>
          {customOpen || !isPreset ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  value={customDraft}
                  onChange={(e) => applyCustom(e.target.value)}
                  placeholder={`Minutes (${MIN_DURATION}-${MAX_DURATION})`}
                  className="ring-focus h-11 w-full rounded-xl2 border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white/90 outline-none transition focus:border-cyan-glow/50 placeholder:text-white/25"
                />
                <span className="shrink-0 text-[12.5px] text-white/40">minutes</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="mt-2 pl-1 text-[12px] text-white/40">
          Closes automatically after this timer, or the moment everyone's voted — whichever comes first.
        </p>
      </div>
      <Button
        block
        size="lg"
        loading={busy}
        disabled={names.length < MIN_MEMBERS || !name.trim()}
        onClick={create}
        leftIcon={<Radio className="h-[18px] w-[18px]" />}
        className="mt-6"
      >
        Go live &amp; get the link
      </Button>
    </GlassCard>
  );
}

function LiveView({ poll, onReset }: { poll: Poll; onReset: () => void }) {
  const [status, setStatus] = useState<PollStatus | null>(null);
  const [results, setResults] = useState<ResultOut | null>(null);
  const [copied, setCopied] = useState(false);
  const link = voteLink(poll.vote_token);

  useEffect(() => {
    let alive = true;
    async function poll_() {
      try {
        const s = await api<PollStatus>(`/polls/${poll.vote_token}/status`);
        if (alive) setStatus(s);
      } catch {
        /* transient — try again next tick */
      }
    }
    poll_();
    const t = setInterval(poll_, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [poll.vote_token]);

  useEffect(() => {
    if (status?.status !== "closed" || results) return;
    // admin_token, never vote_token — this is the one thing that can see results.
    api<ResultOut>(`/admin/${poll.admin_token}/results`)
      .then(setResults)
      .catch(() => {});
  }, [status?.status, results, poll.admin_token]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy — select and copy the link manually", "err");
    }
  }

  const pct = status && status.total_members ? Math.round((status.voted_count / status.total_members) * 100) : 0;

  return (
    <GlassCard tilt={false} className="p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-emerald-glow">
          <Radio className="h-3.5 w-3.5" /> {status?.status === "closed" ? "Closed" : "Live"}
        </div>
        {status?.status === "open" ? (
          <span className="text-[13px] text-cyan-glow/80">
            <Countdown end={status.closes_at} />
          </span>
        ) : null}
      </div>
      <h2 className="mt-2 text-xl">{poll.name}</h2>

      <div className="mt-4 flex items-center gap-2 rounded-xl2 border border-white/8 bg-white/[0.02] py-1.5 pl-3.5 pr-1.5">
        <span className="flex-1 truncate font-mono text-[12.5px] text-white/60">{link}</span>
        <Button size="sm" variant="glass" magnetic={false} leftIcon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <span className="text-[12.5px] text-white/50">Responses</span>
        <span className="text-[13px] font-semibold tabnums text-white/85">
          {status ? `${status.voted_count} / ${status.total_members}` : "…"}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-teal-glow to-cyan-glow"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status?.members.map((m) => (
          <span
            key={m.id}
            className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 ${
              m.voted ? "border-emerald-glow/30 bg-emerald-glow/10" : "border-white/8 bg-white/[0.02]"
            }`}
          >
            <Avatar name={m.display_name} size={22} />
            <span className={`text-[12px] ${m.voted ? "text-emerald-200" : "text-white/50"}`}>{m.display_name}</span>
          </span>
        ))}
      </div>

      <AnimatePresence>
        {status?.status === "closed" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-6 overflow-hidden border-t border-white/[0.07] pt-6"
          >
            <div className="mb-4 flex items-center gap-2 text-[14px] font-medium text-white/80">
              <Trophy className="h-4 w-4 text-[#f5d580]" /> Final leaderboard
            </div>
            {results ? <Leaderboard data={results} /> : <p className="text-center text-[13px] text-white/40">Computing…</p>}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Button variant="glass" block className="mt-6" onClick={onReset}>
        ← Start a different poll
      </Button>
    </GlassCard>
  );
}

export default function Landing() {
  const [poll, setPoll] = useState<Poll | null>(null);

  return (
    <div className="relative z-[2] mx-auto flex min-h-screen max-w-[520px] flex-col px-5 py-12">
      <Reveal className="text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <div className="mt-6 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-glow/85">
          Ask. Share. Rank.
        </div>
        <h1 className="mt-2 text-[clamp(1.9rem,6vw,2.6rem)] font-semibold leading-[1.08] tracking-tight">
          One screen to ask.
          <br />
          <span className="text-gradient">One click to answer.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-[38ch] text-[14.5px] leading-relaxed text-white/55">
          Name your people, set a timer, share the link. Everyone ranks everyone else — anonymously, with a result
          nobody ties for.
        </p>
      </Reveal>

      <div className="mt-8">
        {poll ? <LiveView poll={poll} onReset={() => setPoll(null)} /> : <CreateForm onCreated={setPoll} />}
      </div>

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-white/30">
        Rankings are never stored with a name attached — only who voted, never what they voted, is ever recorded.
      </p>
    </div>
  );
}
