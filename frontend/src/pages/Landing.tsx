import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, X, Radio, Copy, Check, Clock, Sparkles, Trophy, Inbox, Info, Lock, History, Hourglass,
} from "lucide-react";
import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import GlassCard from "@/components/ui/GlassCard";
import { Avatar, Reveal } from "@/components/ui/Bits";
import { Countdown } from "@/components/ui/Countdown";
import { Leaderboard } from "@/components/Leaderboard";
import { api, ApiError } from "@/lib/api";
import type { Poll, PollStatus, ResultOut } from "@/lib/types";
import { countdownText, parseUTC, voteLink } from "@/lib/format";
import * as mypolls from "@/lib/mypolls";
import { COUNTER_SHOWS_AT, MAX_MEMBERS, MAX_MEMBER_NAME_LEN, MAX_QUESTION_LEN } from "@/lib/limits";
import { toast } from "@/components/Toast";

const MIN_MEMBERS = 3;
// Mirrors app/config.py's results_retention_seconds. Only used for wording —
// the real deadline always comes from the server as ResultOut.expires_at, so a
// drift here can never make the UI outlive the data.
const RESULTS_TTL_SECONDS = 30 * 60;
// Seconds. Mirrors app/config.py's min/max_duration_seconds.
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60 * 60;
const DURATIONS = [
  { label: "5 min", seconds: 5 * 60 },
  { label: "10 min", seconds: 10 * 60 },
  { label: "30 min", seconds: 30 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
];
// Units for the custom window. Seconds is first so a very short window — handy
// for walking through a whole poll end to end in one sitting — is one tap away.
const UNITS = [
  { label: "sec", seconds: 1 },
  { label: "min", seconds: 60 },
  { label: "hour", seconds: 3600 },
];

function humanDuration(total: number): string {
  if (total < 60) return `${total} sec`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return s ? `${m} min ${s} sec` : `${m} min`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  return m ? `${h} hr ${m} min` : `${h} hour${h === 1 ? "" : "s"}`;
}

function NameAdder({
  names,
  onChange,
  inputRef,
}: {
  names: string[];
  onChange: (v: string[]) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const n = draft.trim();
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) {
      toast("Already added", "err");
      return;
    }
    if (names.length >= MAX_MEMBERS) {
      toast(`That's the maximum of ${MAX_MEMBERS} people for one poll`, "err");
      return;
    }
    onChange([...names, n]);
    setDraft("");
  }

  const nameLeft = MAX_MEMBER_NAME_LEN - draft.length;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_MEMBER_NAME_LEN}
            // autoComplete/name: without these the browser saves every name
            // ever typed here and offers them as a suggestion dropdown. That
            // dropdown eats the first Enter — it picks a suggestion instead of
            // letting the keypress reach this handler — so the name silently
            // fails to add. spellCheck off because people's names are not
            // misspelled words.
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            name="peerrank-new-name"
            enterKeyHint="done"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // While an IME is mid-composition, Enter commits the composition
              // rather than meaning "done" — adding here would store a
              // half-typed name.
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Type a name, press Enter…"
            className="ring-focus h-12 w-full rounded-xl2 border border-white/10 bg-white/[0.03] pl-4 pr-12 text-[14px] text-white/90 outline-none transition focus:border-cyan-glow/50 placeholder:text-white/25"
          />
          {nameLeft <= COUNTER_SHOWS_AT ? (
            <span
              className={`pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11.5px] font-medium tabnums ${
                nameLeft === 0 ? "text-amber-300/90" : "text-white/35"
              }`}
            >
              {nameLeft === 0 ? "Full" : nameLeft}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={add}
          className="ring-focus grid h-12 w-12 shrink-0 place-items-center rounded-xl2 bg-white/[0.06] text-cyan-glow transition hover:bg-white/[0.1]"
          aria-label="Add name"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      {nameLeft === 0 ? (
        <p className="flex items-center gap-1.5 pl-1 pt-1.5 text-[12px] font-medium text-amber-300/90">
          <Info className="h-3.5 w-3.5 shrink-0" />
          {`A name can be up to ${MAX_MEMBER_NAME_LEN} characters — that's as long as it goes.`}
        </p>
      ) : null}
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
                className="flex max-w-full items-center gap-2 rounded-full border border-teal-glow/25 bg-teal-glow/10 px-3 py-1.5"
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-teal-glow/80 text-[10px] font-bold text-ink-950 tabnums">
                  {i + 1}
                </span>
                <span className="min-w-0 truncate text-[13px] text-teal-200" title={n}>
                  {n}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(names.filter((x) => x !== n))}
                  className="shrink-0 text-teal-300/70 transition hover:text-rose-400"
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
  const [seconds, setSeconds] = useState(10 * 60);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [unit, setUnit] = useState(UNITS[1]); // default: minutes
  const [busy, setBusy] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isPreset = DURATIONS.some((d) => d.seconds === seconds);

  // Recompute the window from the typed number + the chosen unit. Kept as one
  // function so switching the unit and typing a number go through identical
  // validation instead of drifting apart.
  function applyCustom(raw: string, u = unit) {
    setCustomDraft(raw);
    setUnit(u);
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return;
    const total = Math.round(n * u.seconds);
    if (total >= MIN_DURATION && total <= MAX_DURATION) setSeconds(total);
  }

  async function create() {
    if (!name.trim()) return toast("Give it a question", "err");
    if (names.length < MIN_MEMBERS) {
      return toast(`Add at least ${MIN_MEMBERS} names before going live`, "err");
    }
    if (!(seconds >= MIN_DURATION && seconds <= MAX_DURATION)) {
      return toast(`Voting window must be between ${MIN_DURATION} seconds and 24 hours`, "err");
    }
    setBusy(true);
    try {
      const poll = await api<Poll>("/polls", {
        method: "POST",
        body: { name: name.trim(), member_names: names, duration_seconds: seconds },
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
        maxLength={MAX_QUESTION_LEN}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        // Enter here means "done with the question" — move straight to adding
        // people instead of leaving the cursor parked.
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            nameInputRef.current?.focus();
          }
        }}
        // At the cap the field silently stops accepting keys, which reads as a
        // broken input — so say plainly that the limit is what stopped it.
        hintTone={name.length >= MAX_QUESTION_LEN ? "warn" : "muted"}
        hint={
          name.length >= MAX_QUESTION_LEN
            ? `That's the full ${MAX_QUESTION_LEN} characters — delete some to keep typing.`
            : MAX_QUESTION_LEN - name.length <= COUNTER_SHOWS_AT
              ? `${MAX_QUESTION_LEN - name.length} characters left`
              : "Keep it short — this heading shows on everyone's screen."
        }
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
        <NameAdder names={names} onChange={setNames} inputRef={nameInputRef} />
        <p className="mt-2 pl-1 text-[12px] text-white/40">
          First names or nicknames work great — everyone picks their own off this list when they open the link.
        </p>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-[13px] text-white/50">Voting window</p>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.seconds}
              type="button"
              onClick={() => {
                setSeconds(d.seconds);
                setCustomOpen(false);
              }}
              className={`ring-focus flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition ${
                !customOpen && seconds === d.seconds
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
              setCustomDraft("");
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
                  min={1}
                  step={1}
                  value={customDraft}
                  onChange={(e) => applyCustom(e.target.value)}
                  placeholder="How long?"
                  className="ring-focus h-11 min-w-0 flex-1 rounded-xl2 border border-white/10 bg-white/[0.03] px-4 text-[14px] text-white/90 outline-none transition focus:border-cyan-glow/50 placeholder:text-white/25"
                />
                <div className="flex shrink-0 gap-1 rounded-xl2 border border-white/10 bg-white/[0.03] p-1">
                  {UNITS.map((u) => (
                    <button
                      key={u.label}
                      type="button"
                      // Re-run the same value through the new unit so the window
                      // updates immediately instead of on the next keystroke.
                      onClick={() => applyCustom(customDraft, u)}
                      className={`ring-focus rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition ${
                        unit.label === u.label
                          ? "bg-cyan-glow/20 text-cyan-100"
                          : "text-white/45 hover:text-white/80"
                      }`}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="mt-2 pl-1 text-[12px] text-white/40">
          Voting stays open for <span className="font-medium text-cyan-100/80">{humanDuration(seconds)}</span> — or
          closes the moment everyone's voted, whichever comes first.
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

/**
 * Live "this disappears in …" line under a finished result.
 *
 * Shown so the deletion is expected rather than discovered: the creator has a
 * visible window in which to screenshot or share the leaderboard. Ticks every
 * second, and reads the deadline from the server (`expires_at`) rather than
 * computing it locally, so it can never promise time the backend won't honour.
 */
function ExpiryNote({ expiresAt }: { expiresAt: string | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  if (!expiresAt) return null; // retention switched off server-side
  const left = countdownText(expiresAt);

  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11.5px] leading-relaxed text-white/35">
      <Hourglass className="h-3 w-3 shrink-0" />
      {left === "closed" ? (
        <span>Deleting now…</span>
      ) : (
        <span>
          Disappears in <span className="tabnums font-medium text-white/50">{left}</span> — save anything you want
          to keep.
        </span>
      )}
    </p>
  );
}

function LiveView({ poll, onReset }: { poll: Poll; onReset: () => void }) {
  const [status, setStatus] = useState<PollStatus | null>(null);
  const [results, setResults] = useState<ResultOut | null>(null);
  const [copied, setCopied] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Results are kept for a limited time and then deleted server-side. `gone` is
  // set when the API says 410, or when the client-side clock reaches
  // results.expires_at — whichever happens first.
  const [gone, setGone] = useState(false);
  const link = voteLink(poll.vote_token);
  // Keyed on "closed", not "open": before the first status arrives `status` is
  // null, and a freshly created poll is open — treating unknown as open keeps
  // the screen from flashing the closed/results layout for a moment.
  const isClosed = status?.status === "closed";

  useEffect(() => {
    // Stop once the poll is closed. Nothing about a closed poll can change
    // again, so continuing to poll is pure waste — and it was NOT harmless:
    // the interval had no exit condition, so a tab left open on a finished
    // poll kept hitting /status (and therefore the database) every 3 seconds
    // indefinitely, which on a metered/serverless Postgres never lets the
    // compute idle.
    if (isClosed || gone) return;

    let alive = true;
    async function poll_() {
      try {
        const s = await api<PollStatus>(`/polls/${poll.vote_token}/status`);
        if (alive) setStatus(s);
      } catch (e) {
        // 410 means the retention window elapsed and the poll was deleted.
        // Anything else is transient — try again on the next tick.
        if (alive && e instanceof ApiError && e.status === 410) setGone(true);
      }
    }
    poll_();
    const t = setInterval(poll_, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [poll.vote_token, isClosed, gone]);

  useEffect(() => {
    if (status?.status !== "closed" || results || gone) return;
    // admin_token, never vote_token — this is the one thing that can see results.
    // Sent as a header so the secret never appears in a URL (and therefore
    // never in an access log or a Referer).
    api<ResultOut>("/admin/results", { headers: { "X-Admin-Token": poll.admin_token } })
      .then(setResults)
      .catch((e) => {
        // Without this the card sat on "Computing…" forever once the poll had
        // been purged, which reads as a hang rather than as an expiry.
        if (e instanceof ApiError && (e.status === 410 || e.status === 404)) setGone(true);
      });
  }, [status?.status, results, gone, poll.admin_token]);

  // Flip to the expired state the moment the deadline passes, without waiting
  // for a request to fail. Nothing is left on screen that the server would no
  // longer hand out.
  useEffect(() => {
    if (!results?.expires_at || gone) return;
    const end = parseUTC(results.expires_at);
    if (!end) return;
    const ms = end.getTime() - Date.now();
    if (ms <= 0) {
      setGone(true);
      return;
    }
    const t = setTimeout(() => setGone(true), ms);
    return () => clearTimeout(t);
  }, [results?.expires_at, gone]);

  // Once it is deleted server-side, the stored admin token is dead weight —
  // and on a shared computer it is dead weight that identifies a past poll.
  useEffect(() => {
    if (gone) mypolls.forget(poll.vote_token);
  }, [gone, poll.vote_token]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy — select and copy the link manually", "err");
    }
  }

  // End voting before the timer. Irreversible, so it's behind a confirm step.
  // The response IS the frozen leaderboard, so results appear without waiting
  // for the next status poll.
  async function closeNow() {
    setClosing(true);
    try {
      const res = await api<ResultOut>("/admin/close", {
        method: "POST",
        headers: { "X-Admin-Token": poll.admin_token },
      });
      setResults(res);
      setStatus((s) => (s ? { ...s, status: "closed", seconds_remaining: 0 } : s));
      setConfirmClose(false);
      toast("Voting closed", "ok");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not close voting", "err");
    } finally {
      setClosing(false);
    }
  }

  const pct = status && status.total_members ? Math.round((status.voted_count / status.total_members) * 100) : 0;

  // Expired: the poll and every ballot under it are gone from the server, so
  // there is nothing to render but the explanation. Deliberately says the data
  // was deleted rather than "not found" — a link that simply stopped working
  // looks like a bug, whereas this was the promise.
  if (gone) {
    return (
      <GlassCard tilt={false} className="p-7 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05] text-white/40">
          <Hourglass className="h-7 w-7" />
        </div>
        <p className="text-[15px] font-medium text-white/80">These results have expired</p>
        <p className="mx-auto mt-1.5 max-w-[36ch] text-[13px] leading-relaxed text-white/45">
          Results stay up for {humanDuration(RESULTS_TTL_SECONDS)} after a poll closes, then the poll and every
          ranking in it are deleted for good. Nothing about this one is stored any more.
        </p>
        <Button variant="glass" block className="mt-6" onClick={onReset}>
          ← Start a different poll
        </Button>
      </GlassCard>
    );
  }

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
      {/* wrap-anywhere: an existing poll may predate the input caps, and the
          card must never widen past its column no matter what's in here. */}
      <h2 className="wrap-anywhere mt-2 text-xl leading-snug">{poll.name}</h2>

      {/* Everything for RUNNING the round — share link, turnout, who's voted —
          exists only while the round is running. Once it's closed the result is
          the whole point of the screen, so the podium takes the top and the
          share/progress UI is gone rather than pushing it below the fold. */}
      {isClosed ? null : (
        <>
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
                className={`flex max-w-full items-center gap-2 rounded-full border py-1 pl-1 pr-3 ${
                  m.voted ? "border-emerald-glow/30 bg-emerald-glow/10" : "border-white/8 bg-white/[0.02]"
                }`}
              >
                <Avatar name={m.display_name} size={22} />
                <span
                  className={`min-w-0 truncate text-[12px] ${m.voted ? "text-emerald-200" : "text-white/50"}`}
                  title={m.display_name}
                >
                  {m.display_name}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {isClosed ? (
        <div className="mt-5">
          {/* A closed poll with no ballots has NO leaderboard — showing one
              would crown whoever happens to be first on the roster. */}
          {results && results.ballot_count === 0 ? (
            <div className="text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.05] text-white/40">
                <Inbox className="h-7 w-7" />
              </div>
              <p className="text-[15px] font-medium text-white/80">No votes were cast</p>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-white/45">
                Voting closed before anyone submitted a ranking, so there's no result to show. Start a new poll to
                try again.
              </p>
              <ExpiryNote expiresAt={results.expires_at} />
            </div>
          ) : results ? (
            <>
              <Leaderboard data={results} />
              <p className="mt-4 flex items-center justify-center gap-1.5 text-[12px] text-white/35">
                <Trophy className="h-3.5 w-3.5 text-[#f5d580]/70" />
                Final result · {results.ballot_count} of {results.total_members} voted
              </p>
              <ExpiryNote expiresAt={results.expires_at} />
            </>
          ) : (
            <p className="text-center text-[13px] text-white/40">Computing…</p>
          )}
        </div>
      ) : null}

      {/* While the round is live the only action offered is ending it. Starting
          a different poll is hidden until this one is closed — walking away
          mid-round would abandon a link people are actively voting on. */}
      {!isClosed ? (
        <div className="mt-6">
          {confirmClose ? (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl2 border border-amber-300/25 bg-amber-300/[0.07] p-4"
            >
              <p className="flex items-start gap-2 text-[13px] leading-relaxed text-amber-100/90">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  End voting now? {status ? `${status.total_members - status.voted_count} of ${status.total_members}` : "Some"}{" "}
                  {status && status.total_members - status.voted_count === 1 ? "person hasn't" : "people haven't"} voted
                  yet, and this can't be undone.
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" loading={closing} onClick={closeNow} leftIcon={<Lock className="h-3.5 w-3.5" />}>
                  Yes, close it
                </Button>
                <Button size="sm" variant="glass" magnetic={false} onClick={() => setConfirmClose(false)}>
                  Keep it open
                </Button>
              </div>
            </motion.div>
          ) : (
            <Button
              variant="glass"
              block
              onClick={() => setConfirmClose(true)}
              leftIcon={<Lock className="h-[16px] w-[16px]" />}
            >
              Close voting now
            </Button>
          )}
        </div>
      ) : (
        <Button variant="glass" block className="mt-6" onClick={onReset}>
          ← Start a different poll
        </Button>
      )}
    </GlassCard>
  );
}

/**
 * Polls this browser created. Without this, the only way back to a poll's
 * results was the admin token held in memory — so closing the tab threw away
 * the leaderboard for good.
 */
function RecentPolls({ onOpen }: { onOpen: (p: Poll) => void }) {
  const [rows, setRows] = useState(() => mypolls.list());
  if (rows.length === 0) return null;

  function forget(token: string) {
    mypolls.forget(token);
    setRows(mypolls.list());
  }

  return (
    <div className="mt-5">
      <p className="mb-2 pl-1 text-[12.5px] text-white/45">
        Polls you created on this device — open one to see its results.
      </p>
      <div className="flex flex-col gap-2">
        {rows.map(({ poll: p }) => (
          <div
            key={p.vote_token}
            className="flex items-center gap-2 rounded-xl2 border border-white/8 bg-white/[0.02] px-3 py-2"
          >
            <History className="h-4 w-4 shrink-0 text-white/30" />
            <button
              type="button"
              onClick={() => onOpen(p)}
              className="ring-focus min-w-0 flex-1 truncate rounded text-left text-[13.5px] text-white/80 transition hover:text-cyan-glow"
              title={p.name}
            >
              {p.name}
            </button>
            <button
              type="button"
              onClick={() => forget(p.vote_token)}
              aria-label={`Forget ${p.name}`}
              className="ring-focus shrink-0 rounded p-1 text-white/25 transition hover:text-rose-400"
              title="Forget this poll on this device"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 pl-1 text-[11.5px] leading-relaxed text-white/30">
        Stored only in this browser. On a shared computer, use ✕ to forget a poll
        once you're done with it.
      </p>
    </div>
  );
}

export default function Landing() {
  // Restored from localStorage on the FIRST render, not in an effect: an effect
  // would flash the empty creation form for a frame and look like the poll had
  // been lost — which is the exact anxiety this fix exists to remove.
  const [poll, setPoll] = useState<Poll | null>(() => mypolls.mostRecent());

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
        {poll ? (
          <LiveView poll={poll} onReset={() => setPoll(null)} />
        ) : (
          <>
            <CreateForm
              onCreated={(p) => {
                // Remember it BEFORE showing the live view, so even an
                // immediate crash or refresh cannot lose the admin token.
                mypolls.remember(p);
                setPoll(p);
              }}
            />
            <RecentPolls onOpen={setPoll} />
          </>
        )}
      </div>

      <p className="mt-6 text-center text-[11.5px] leading-relaxed text-white/30">
        Rankings are never stored with a name attached — only who voted, never what they voted, is ever recorded.
      </p>
    </div>
  );
}
