import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Copy, Check, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Bits";
import { Countdown } from "@/components/ui/Countdown";
import { Leaderboard } from "@/components/Leaderboard";
import { api } from "@/lib/api";
import type { Poll, PollStatus, ResultOut } from "@/lib/types";
import { voteLink } from "@/lib/format";
import { toast } from "@/components/Toast";

/** Live status + leaderboard for a poll just created (or just duplicated) in
 * this browser session — polls /status every 3s, then fetches results once
 * closed. */
export function PollLiveView({ poll, onReset }: { poll: Poll; onReset: () => void }) {
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
        /* transient */
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

  const pct =
    status && status.total_members
      ? Math.round((status.voted_count / status.total_members) * 100)
      : 0;

  return (
    <div className="rounded-2xl border border-[#D2D2D7] bg-white p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[#34C759]">
          <Radio className="h-3.5 w-3.5" />{" "}
          {status?.status === "closed" ? "Closed" : "Live"}
        </div>
        {status?.status === "open" ? (
          <span className="text-[13px] text-[#6E6E73]">
            <Countdown end={status.closes_at} />
          </span>
        ) : null}
      </div>
      <h2 className="mt-2 text-[19px] font-semibold text-[#1D1D1F]">{poll.name}</h2>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] py-2 pl-3 pr-1.5">
        <span className="flex-1 truncate font-mono text-[12.5px] text-[#6E6E73]">{link}</span>
        <Button
          size="sm"
          variant="glass"
          magnetic={false}
          leftIcon={
            copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )
          }
          onClick={copy}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <span className="text-[12.5px] text-[#6E6E73]">Responses</span>
        <span className="text-[13px] font-semibold tabnums text-[#1D1D1F]">
          {status ? `${status.voted_count} / ${status.total_members}` : "…"}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F5F5F7]">
        <motion.div
          className="h-full rounded-full bg-[#34C759]"
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        {status?.members.map((m) => (
          <div
            key={m.id}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              m.voted
                ? "border-[#34C759]/30 bg-[#E8FAF0]"
                : "border-[#D2D2D7] bg-[#F5F5F7]"
            }`}
          >
            <div className="flex items-center gap-2">
              <Avatar name={m.display_name} size={28} />
              <span className={`text-[14px] ${m.voted ? "text-[#1A7C3E]" : "text-[#6E6E73]"}`}>
                {m.display_name}
              </span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${
                m.voted
                  ? "bg-[#E8FAF0] text-[#1A7C3E]"
                  : "bg-[#F5F5F7] text-[#AEAEB2]"
              }`}
            >
              {m.voted ? "Voted ✓" : "Pending"}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {status?.status === "closed" ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-6 overflow-hidden border-t border-[#D2D2D7] pt-6"
          >
            <div className="mb-4 flex items-center gap-2 text-[14px] font-medium text-[#1D1D1F]">
              <Trophy className="h-4 w-4 text-[#B45309]" /> Final leaderboard
            </div>
            {results ? (
              <Leaderboard data={results} />
            ) : (
              <p className="text-center text-[13px] text-[#6E6E73]">Computing…</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Button variant="ghost" block className="mt-6" onClick={onReset}>
        ← Start a different poll
      </Button>
    </div>
  );
}
