import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Mail, BadgeCheck, Lock, Sparkles, Vote, Trophy, Crown, Medal, History } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import { Avatar, Badge, Divider, Reveal, Skeleton } from "@/components/ui/Bits";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Leaderboard } from "@/components/Leaderboard";
import { useSession } from "@/lib/useSession";
import { initials, ordinal, fmtDate } from "@/lib/format";
import { api } from "@/lib/api";
import type { HistoryEntry } from "@/lib/types";
import { ChevronRight } from "lucide-react";

// Medal styling per rank for the history cards.
function medalFor(rank: number) {
  if (rank === 1)
    return { grad: "from-[#ffe9b0] to-[#e0b25a]", text: "text-[#f5d580]", ring: "ring-[#f5d580]/50", icon: <Crown className="h-4 w-4" /> };
  if (rank === 2)
    return { grad: "from-[#e6e9ef] to-[#9aa3b2]", text: "text-white/80", ring: "ring-white/30", icon: <Medal className="h-4 w-4" /> };
  if (rank === 3)
    return { grad: "from-[#f0c69a] to-[#b6764a]", text: "text-[#e0a878]", ring: "ring-[#e0a878]/40", icon: <Medal className="h-4 w-4" /> };
  return { grad: "from-white/15 to-white/5", text: "text-white/60", ring: "ring-white/15", icon: null as React.ReactNode };
}

function HistorySection() {
  const [data, setData] = useState<HistoryEntry[] | null>(null);
  const [open, setOpen] = useState<HistoryEntry | null>(null);
  useEffect(() => {
    let alive = true;
    api<HistoryEntry[]>("/auth/history")
      .then((r) => alive && setData(r))
      .catch(() => alive && setData([]));
    return () => {
      alive = false;
    };
  }, []);

  const podiums = data?.filter((h) => h.rank <= 3).length ?? 0;

  return (
    <GlassCard tilt={false} className="p-6 sm:p-7">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-wider text-white/40">
          <History className="h-4 w-4" /> Your voting history
        </div>
        {data && data.length > 0 ? (
          <Badge tone="gold">
            <Trophy className="h-3.5 w-3.5" /> {podiums} podium{podiums === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
      <Divider className="my-3" />

      {data === null ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-7 w-7" />}
          title="No results yet"
          message="Once a round you're part of closes, your rank shows up here — every recognition, in one place."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((h, i) => {
            const m = medalFor(h.rank);
            return (
              <motion.button
                key={h.round_id}
                type="button"
                onClick={() => setOpen(h)}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ scale: 1.01 }}
                className={`ring-focus group relative flex w-full items-center gap-4 overflow-hidden rounded-xl2 border px-4 py-3.5 text-left transition-colors ${
                  h.rank === 1
                    ? "border-[#f5d580]/25 bg-gradient-to-r from-[#f5d580]/10 to-transparent hover:from-[#f5d580]/15"
                    : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]"
                }`}
              >
                {/* rank medal */}
                <div className="relative shrink-0">
                  <div
                    className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${m.grad} text-[17px] font-bold tabnums ${
                      h.rank <= 3 ? "text-ink-950" : "text-white/80"
                    }`}
                  >
                    {h.rank}
                  </div>
                  {m.icon ? (
                    <span className={`absolute -right-1.5 -top-1.5 ${m.text}`}>{m.icon}</span>
                  ) : null}
                </div>

                {/* round + project */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-white/90">{h.round_name}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-white/45">
                    {h.project_name} · {h.team_name}
                    {h.end_at ? <span className="text-white/30"> · {fmtDate(h.end_at)}</span> : null}
                  </p>
                </div>

                {/* placement + points */}
                <div className="shrink-0 text-right">
                  <p className={`text-[15px] font-bold ${m.text}`}>
                    {ordinal(h.rank)}
                    <span className="text-[12px] font-normal text-white/40"> / {h.total}</span>
                  </p>
                  <p className="text-[12px] text-white/45">{h.points} pts</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-white/50" />
              </motion.button>
            );
          })}
        </div>
      )}

      {/* full round result — everyone's placement */}
      <Modal open={!!open} onClose={() => setOpen(null)} className="!max-w-2xl">
        {open ? (
          <div>
            <div className="mb-4 text-center">
              <p className="text-[12.5px] font-medium uppercase tracking-wider text-cyan-glow/80">
                {open.project_name} · {open.team_name}
              </p>
              <h3 className="mt-1 text-2xl">{open.round_name}</h3>
              <p className="mt-1 text-[13.5px] text-white/50">
                You finished <span className={`font-semibold ${medalFor(open.rank).text}`}>{ordinal(open.rank)}</span> of{" "}
                {open.total}
              </p>
            </div>
            <div className="max-h-[68vh] overflow-y-auto pr-1">
              <Leaderboard
                data={{ round_id: open.round_id, computed_at: open.computed_at || "", ranking: open.ranking }}
                highlightMemberId={open.member_id}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </GlassCard>
  );
}

const TIMELINE = [
  { icon: <Vote className="h-4 w-4" />, t: "Rank your peers", d: "Privately drag teammates into your honest order." },
  { icon: <Lock className="h-4 w-4" />, t: "Stay anonymous", d: "Your ballot is never linked to your identity." },
  { icon: <Trophy className="h-4 w-4" />, t: "See the signal", d: "Results freeze into a shareable leaderboard." },
];

export default function Profile() {
  const s = useSession();
  const name = (s.email || "user").split("@")[0];

  return (
    <AppShell>
      <Reveal>
        <div className="relative overflow-hidden rounded-xl3">
          {/* banner */}
          <div className="h-36 w-full bg-gradient-to-br from-teal-glow/30 via-cyan-glow/20 to-violet-glow/25 sm:h-44">
            <div className="h-full w-full bg-grid opacity-40" />
          </div>
          <div className="glass-strong -mt-14 rounded-xl3 px-6 pb-7 pt-0 sm:px-8">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
              <div className="-mt-10 rounded-full ring-4 ring-ink-950">
                <span
                  className="grid place-items-center rounded-full text-3xl font-semibold text-white ring-1 ring-white/10"
                  style={{
                    width: 96,
                    height: 96,
                    background: `linear-gradient(135deg, #14b8a6, #22d3ee)`,
                  }}
                >
                  {initials(s.email || "?")}
                </span>
              </div>
              <div className="flex-1 pt-3 sm:pb-2">
                <h1 className="text-3xl capitalize">{name}</h1>
                <p className="mt-1 flex items-center gap-1.5 font-mono text-[13px] text-white/45">
                  <Mail className="h-3.5 w-3.5" /> {s.email}
                </p>
              </div>
              <div className="pb-2">
                <Badge tone={s.role === "admin" ? "violet" : "cyan"}>
                  <BadgeCheck className="h-3.5 w-3.5" /> {s.role}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Members get their recognition history front-and-centre. */}
      {s.role === "member" ? (
        <Reveal delay={0.05} className="mt-6 block">
          <HistorySection />
        </Reveal>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Reveal delay={0.05} className="lg:col-span-2">
          <GlassCard tilt={false} className="h-full p-7">
            <h2 className="text-lg">How Peer Rank works</h2>
            <div className="mt-5 flex flex-col gap-0">
              {TIMELINE.map((step, i) => (
                <div key={step.t} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < TIMELINE.length - 1 ? (
                    <span className="absolute left-[19px] top-10 h-full w-px bg-white/10" />
                  ) : null}
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-cyan-glow ring-1 ring-white/10">
                    {step.icon}
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-white/90">{step.t}</p>
                    <p className="mt-0.5 text-[13.5px] text-white/45">{step.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </Reveal>

        <Reveal delay={0.1}>
          <GlassCard tilt={false} className="h-full p-7">
            <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl2 bg-gradient-to-br from-emerald-glow/25 to-teal-glow/10 text-emerald-300 ring-1 ring-white/10">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg">Your privacy</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-white/50">
              Peer Rank stores your account to sign you in — but never connects it to any
              ballot you cast. Votes are aggregated behind an anonymity wall.
            </p>
            <Divider className="my-5" />
            <div className="flex items-center gap-2 text-[13px] text-white/60">
              <Sparkles className="h-4 w-4 text-cyan-glow" /> Account secured &amp; verified
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </AppShell>
  );
}
