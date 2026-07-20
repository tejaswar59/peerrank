import { motion } from "framer-motion";
import { Crown, Medal, Inbox } from "lucide-react";
import type { ResultOut, ResultRow } from "@/lib/types";
import { Avatar } from "./ui/Bits";
import { fmtDateTime } from "@/lib/format";

// Per-rank medal styling (1 = gold, 2 = silver, 3 = bronze).
const MEDAL: Record<
  number,
  { grad: string; ring: string; text: string; bar: string; height: string; icon: React.ReactNode }
> = {
  1: {
    grad: "from-[#ffe9b0] to-[#e0b25a]",
    ring: "ring-[#f5d580]/60",
    text: "text-[#f5d580]",
    bar: "from-[#f5d580] to-[#e0b25a]",
    height: "h-32 sm:h-40",
    icon: <Crown className="h-4 w-4" />,
  },
  2: {
    grad: "from-[#e6e9ef] to-[#9aa3b2]",
    ring: "ring-white/40",
    text: "text-white/80",
    bar: "from-[#d7dbe4] to-[#9aa3b2]",
    height: "h-24 sm:h-28",
    icon: <Medal className="h-4 w-4" />,
  },
  3: {
    grad: "from-[#f0c69a] to-[#b6764a]",
    ring: "ring-[#e0a878]/50",
    text: "text-[#e0a878]",
    bar: "from-[#e6a877] to-[#b6764a]",
    height: "h-20 sm:h-24",
    icon: <Medal className="h-4 w-4" />,
  },
};

function PodiumColumn({ row, delay, me }: { row: ResultRow; delay: number; me?: boolean }) {
  const m = MEDAL[row.rank];
  const first = row.rank === 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 240, damping: 22 }}
      className="flex flex-1 flex-col items-center justify-end"
    >
      {/* crown slot — sits above the name so it never overlaps it; the empty
          slot on 2nd/3rd keeps all three column tops aligned */}
      <div className="mb-1 flex h-5 items-end justify-center">
        {first ? (
          <motion.span
            initial={{ scale: 0, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: delay + 0.2, type: "spring", stiffness: 300, damping: 14 }}
            className="text-[#f5d580]"
          >
            <Crown className="h-5 w-5 drop-shadow-[0_2px_6px_rgba(245,213,128,0.6)]" />
          </motion.span>
        ) : null}
      </div>

      {/* name */}
      <p className="mb-2 max-w-[96%] truncate text-center text-[12.5px] font-medium text-white/75 sm:text-[13.5px]">
        {row.display_name}
        {me ? <span className="ml-1.5 text-[10px] font-semibold text-cyan-glow">You</span> : null}
      </p>

      {/* avatar with medal ring */}
      <div className="mb-3">
        <span className={`block rounded-full ring-2 ${m.ring}`}>
          <Avatar name={row.display_name} size={first ? 60 : 48} />
        </span>
      </div>

      {/* pedestal: a fixed-height block with a subtle medal tint + content on top */}
      <div
        className={`relative flex w-full flex-col items-center rounded-t-xl2 border border-white/10 bg-white/[0.03] ${m.height}`}
      >
        <div className={`absolute inset-0 rounded-t-xl2 bg-gradient-to-b ${m.grad} opacity-[0.18]`} />
        <div className="relative flex flex-col items-center gap-0.5 px-1 pt-3">
          <span
            className={`grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br ${m.grad} text-[14px] font-bold text-ink-950 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)]`}
          >
            {row.rank}
          </span>
          <span className="mt-1.5 text-xl font-bold tabnums text-white sm:text-2xl">{row.points}</span>
          <span className="text-[11px] text-white/45">pts</span>
        </div>
      </div>
    </motion.div>
  );
}

function Podium({ top, highlightMemberId }: { top: ResultRow[]; highlightMemberId?: number }) {
  // Visual order: 2nd (left), 1st (center), 3rd (right).
  const left = top[1];
  const center = top[0];
  const right = top[2];
  const isMe = (r?: ResultRow) => !!r && r.member_id === highlightMemberId;
  return (
    <div className="mb-6 flex items-end justify-center gap-2.5 px-2 pt-6 sm:gap-4">
      {left ? <PodiumColumn row={left} delay={0.15} me={isMe(left)} /> : <div className="flex-1" />}
      {center ? <PodiumColumn row={center} delay={0} me={isMe(center)} /> : null}
      {right ? <PodiumColumn row={right} delay={0.3} me={isMe(right)} /> : <div className="flex-1" />}
    </div>
  );
}

function RestRow({ row, i, max, me }: { row: ResultRow; i: number; max: number; me?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.35 + i * 0.06 }}
      className={`flex items-center gap-3 rounded-xl2 border px-4 py-3 ${
        me ? "border-cyan-glow/40 bg-cyan-glow/[0.06]" : "border-white/8 bg-white/[0.02]"
      }`}
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/8 text-[13px] font-semibold tabnums text-white/60">
        {row.rank}
      </span>
      <Avatar name={row.display_name} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-white/85">
          {row.display_name}
          {me ? <span className="ml-2 text-[11px] font-semibold text-cyan-glow">You</span> : null}
        </p>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(row.points / max) * 100}%` }}
            transition={{ delay: 0.45 + i * 0.06, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-teal-glow to-cyan-glow"
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <span className="text-[15px] font-bold tabnums text-white">{row.points}</span>
        <span className="ml-1 text-[11px] text-white/40">pts</span>
      </div>
    </motion.div>
  );
}

export function Leaderboard({
  data,
  highlightMemberId,
}: {
  data: ResultOut;
  highlightMemberId?: number;
}) {
  const ranking = data.ranking;
  const max = Math.max(1, ...ranking.map((r) => r.points));
  const totalPoints = ranking.reduce((a, r) => a + r.points, 0);

  // Everyone at 0 points ⇒ no ballots were cast — show a clear "no votes" state.
  if (totalPoints === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
        <div className="relative mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-white/[0.04] text-cyan-glow">
          <span className="absolute inset-0 animate-pulse-ring rounded-2xl border border-cyan-glow/30" />
          <Inbox className="h-6 w-6" />
        </div>
        <h4 className="text-lg text-white/90">No votes were cast</h4>
        <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-white/45">
          This round closed without any ballots, so there's no ranking to show.
        </p>
        <p className="mt-4 text-[12px] text-white/30">Frozen at {fmtDateTime(data.computed_at)}</p>
      </div>
    );
  }

  const top = ranking.slice(0, 3);
  const rest = ranking.slice(3);

  return (
    <div>
      <Podium top={top} highlightMemberId={highlightMemberId} />

      {rest.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2.5">
          {rest.map((row, i) => (
            <RestRow key={row.member_id} row={row} i={i} max={max} me={row.member_id === highlightMemberId} />
          ))}
        </div>
      ) : null}

      <p className="mt-5 text-center text-[12px] text-white/35">
        Frozen at {fmtDateTime(data.computed_at)} · individual ballots are never stored.
      </p>
    </div>
  );
}
