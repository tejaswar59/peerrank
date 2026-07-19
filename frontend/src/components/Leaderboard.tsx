import { motion } from "framer-motion";
import { Crown, Medal, Inbox } from "lucide-react";
import type { ResultOut } from "@/lib/types";
import { Avatar } from "./ui/Bits";
import { fmtDateTime } from "@/lib/format";

const MEDAL: Record<number, { ring: string; label: string; icon?: React.ReactNode }> = {
  1: { ring: "from-[#ffe9b0] to-[#d8a94a]", label: "text-[#f5d580]", icon: <Crown className="h-4 w-4" /> },
  2: { ring: "from-[#e6e9ef] to-[#9aa3b2]", label: "text-white/80", icon: <Medal className="h-4 w-4" /> },
  3: { ring: "from-[#f0c69a] to-[#b6764a]", label: "text-[#e0a878]", icon: <Medal className="h-4 w-4" /> },
};

export function Leaderboard({ data }: { data: ResultOut }) {
  const max = Math.max(1, ...data.ranking.map((r) => r.points));
  const totalPoints = data.ranking.reduce((a, r) => a + r.points, 0);

  // Everyone at 0 points ⇒ no ballots were cast. A wall of zeros reads as broken,
  // so show a clear "no votes" state instead of a fake ranking.
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
          Points appear here once teammates submit their rankings.
        </p>
        <p className="mt-4 text-[12px] text-white/30">Frozen at {fmtDateTime(data.computed_at)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {data.ranking.map((row, i) => {
        const medal = MEDAL[row.rank];
        const top = row.rank === 1;
        return (
          <motion.div
            key={row.member_id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, type: "spring", stiffness: 260, damping: 26 }}
            className={`relative flex items-center gap-4 overflow-hidden rounded-xl2 border px-4 py-3.5 ${
              top
                ? "border-[#f5d580]/30 bg-gradient-to-r from-[#f5d580]/10 to-transparent"
                : "border-white/8 bg-white/[0.02]"
            }`}
          >
            {/* rank medal */}
            <div className="relative shrink-0">
              <div
                className={`grid h-10 w-10 place-items-center rounded-full text-[15px] font-bold tabnums ${
                  medal ? `bg-gradient-to-br ${medal.ring} text-ink-950` : "bg-white/8 text-white/60"
                }`}
              >
                {row.rank}
              </div>
              {top ? (
                <span className="absolute -right-1 -top-1 text-[#f5d580]">{medal?.icon}</span>
              ) : null}
            </div>

            <Avatar name={row.display_name} size={38} />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[15px] font-semibold text-white/90">{row.display_name}</p>
                {medal ? <span className={medal.label}>{medal.icon}</span> : null}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(row.points / max) * 100}%` }}
                  transition={{ delay: 0.2 + i * 0.07, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
                  className={`h-full rounded-full ${
                    top
                      ? "bg-gradient-to-r from-[#f5d580] to-[#e0b25a]"
                      : "bg-gradient-to-r from-teal-glow to-cyan-glow"
                  }`}
                />
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className="text-lg font-bold tabnums text-white">{row.points}</span>
              <span className="ml-1 text-[12px] text-white/40">pts</span>
            </div>

            {top ? (
              <span className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            ) : null}
          </motion.div>
        );
      })}
      <p className="mt-2 text-center text-[12px] text-white/35">
        Frozen at {fmtDateTime(data.computed_at)} · individual ballots are never stored.
      </p>
    </div>
  );
}
