import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Vote, Lock, Sparkles, ShieldCheck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Reveal } from "@/components/ui/Bits";
import { toast } from "@/components/Toast";
import { useSession } from "@/lib/useSession";

export default function Home() {
  const s = useSession();
  const navigate = useNavigate();
  const [entry, setEntry] = useState("");
  const name = (s.email || "there").split("@")[0];

  function jump() {
    let v = entry.trim();
    if (!v) return;
    // Accept a full vote URL, a hash link, or a bare code — always end up with
    // just the token. Take everything after the LAST "vote/", then the leading
    // run of token characters (stops at / ? # or whitespace).
    const idx = v.toLowerCase().lastIndexOf("vote/");
    if (idx >= 0) v = v.slice(idx + 5);
    const m = v.match(/[A-Za-z0-9_-]+/);
    const token = m ? m[0] : "";
    if (!token) return toast("That doesn't look like a valid voting link or code", "err");
    navigate(`/vote/${token}`);
  }

  return (
    <AppShell>
      <Reveal>
        <p className="text-[14px] font-medium text-cyan-glow/80">Welcome back</p>
        <h1 className="mt-1 text-[clamp(2rem,5vw,3rem)] capitalize leading-tight">
          Hi, {name}.
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-white/50">
          You vote through the private links your team shares. Paste one below to jump
          straight into a round.
        </p>
      </Reveal>

      <Reveal delay={0.1}>
        <GlassCard tilt={false} className="mt-8 p-6 sm:p-7">
          <div className="flex items-center gap-2 text-[14px] font-medium text-white/80">
            <Vote className="h-5 w-5 text-cyan-glow" /> Enter a voting link or code
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              label="Voting link or code"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && jump()}
              className="flex-1"
            />
            <Button size="lg" onClick={jump} rightIcon={<ArrowRight className="h-5 w-5" />}>
              Go to round
            </Button>
          </div>
        </GlassCard>
      </Reveal>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        {[
          {
            icon: <Lock className="h-5 w-5" />,
            t: "Anonymous by design",
            d: "Your ranking is never linked back to you — vote honestly.",
          },
          {
            icon: <ShieldCheck className="h-5 w-5" />,
            t: "One ballot per round",
            d: "Once submitted, your vote is locked and counted.",
          },
          {
            icon: <Sparkles className="h-5 w-5" />,
            t: "Cinematic results",
            d: "The leaderboard reveals the moment a round closes.",
          },
        ].map((c, i) => (
          <Reveal key={c.t} delay={0.15 + i * 0.07}>
            <GlassCard className="h-full p-6">
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl2 bg-white/[0.05] text-cyan-glow ring-1 ring-white/10">
                {c.icon}
              </div>
              <h3 className="text-[16px] font-semibold text-white/90">{c.t}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/45">{c.d}</p>
            </GlassCard>
          </Reveal>
        ))}
      </div>
    </AppShell>
  );
}
