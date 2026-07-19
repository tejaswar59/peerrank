import { motion } from "framer-motion";
import { ShieldCheck, Mail, BadgeCheck, Lock, Sparkles, Vote, Trophy } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import { Avatar, Badge, Divider, Reveal } from "@/components/ui/Bits";
import { useSession } from "@/lib/useSession";
import { initials } from "@/lib/format";

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
