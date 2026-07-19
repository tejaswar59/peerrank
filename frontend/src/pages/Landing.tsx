import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Sparkles,
  BarChart3,
  Users2,
  Lock,
  Zap,
  Trophy,
} from "lucide-react";
import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import GlassCard from "@/components/ui/GlassCard";
import { Badge, Reveal } from "@/components/ui/Bits";
import { useSession } from "@/lib/useSession";
import { homeFor } from "@/routes/guards";

const FEATURES = [
  {
    icon: <Lock className="h-6 w-6" />,
    title: "Truly anonymous",
    body: "A hard wall separates who voted from what they voted. Ballots carry no identity, ever.",
  },
  {
    icon: <BarChart3 className="h-6 w-6" />,
    title: "Ranked-choice scoring",
    body: "Condorcet-aware, cycle-safe tallying turns honest peer input into a defensible leaderboard.",
  },
  {
    icon: <Zap className="h-6 w-6" />,
    title: "Live participation",
    body: "Watch completion climb in real time and auto-close the round the moment everyone's in.",
  },
  {
    icon: <Users2 className="h-6 w-6" />,
    title: "Team-native",
    body: "Projects, teams and rounds map to how you already work. Invite by email, done in seconds.",
  },
];

const STATS = [
  { k: "100%", v: "Anonymous ballots" },
  { k: "<60s", v: "To launch a round" },
  { k: "0", v: "Identities stored" },
  { k: "∞", v: "Rounds & teams" },
];

const STEPS = [
  { n: "01", t: "Create a round", d: "Spin up a project, add your team by email, and open a voting window." },
  { n: "02", t: "Everyone ranks", d: "Members privately drag peers into their honest order. No names attached." },
  { n: "03", t: "Reveal the leaderboard", d: "Scores freeze into a cinematic, shareable result the instant it closes." },
];

export default function Landing() {
  const s = useSession();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div className="relative z-[2]">
      {/* floating glass nav */}
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
        className="sticky top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4"
      >
        <nav className="glass-strong mx-auto flex h-16 max-w-6xl items-center justify-between rounded-xl2 px-4 sm:px-5">
          <Wordmark />
          <div className="hidden items-center gap-7 text-[14px] text-white/60 md:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            <a href="#trust" className="transition hover:text-white">Trust</a>
          </div>
          <div className="flex items-center gap-2">
            {s.token ? (
              <Link to={homeFor(s.role)}>
                <Button size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Sign in</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm" rightIcon={<ArrowRight className="h-4 w-4" />}>Get started</Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </motion.header>

      {/* hero */}
      <section ref={heroRef} className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 text-center sm:pt-28">
        <motion.div style={{ y, opacity }}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.7 }}
            className="mb-7 flex justify-center"
          >
            <Badge tone="cyan" className="gap-2 px-3.5 py-1.5 text-[13px] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Peer recognition, reimagined
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}
            className="mx-auto max-w-4xl text-[clamp(2.6rem,7vw,5.4rem)] font-semibold leading-[0.98] tracking-tight"
          >
            Know who your team
            <br />
            <span className="text-gradient">truly values.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.8 }}
            className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-white/55"
          >
            Peer Rank turns anonymous, ranked-choice peer input into a beautiful,
            defensible leaderboard — in under a minute.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link to={s.token ? homeFor(s.role) : "/signup"}>
              <Button size="lg" rightIcon={<ArrowRight className="h-5 w-5" />}>
                {s.token ? "Open your workspace" : "Start ranking free"}
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="glass" size="lg">
                I have an account
              </Button>
            </Link>
          </motion.div>
        </motion.div>

        {/* stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {STATS.map((st) => (
            <div key={st.v} className="glass rounded-xl2 px-4 py-5">
              <div className="text-gradient text-3xl font-semibold tabnums">{st.k}</div>
              <div className="mt-1 text-[12.5px] text-white/45">{st.v}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <Badge tone="violet" className="mb-4">Why Peer Rank</Badge>
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] leading-tight">Built for honest signal</h2>
          <p className="mt-3 text-[16px] text-white/50">
            Everything you need to run recognition that people actually trust.
          </p>
        </Reveal>
        <div className="grid gap-5 sm:grid-cols-2">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <GlassCard className="h-full p-7">
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-xl2 bg-gradient-to-br from-teal-glow/25 to-cyan-glow/10 text-cyan-glow ring-1 ring-white/10">
                  {f.icon}
                </div>
                <h3 className="text-xl">{f.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/50">{f.body}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-6xl px-5 py-20">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <Badge tone="cyan" className="mb-4">How it works</Badge>
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] leading-tight">Three steps to signal</h2>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((st, i) => (
            <Reveal key={st.n} delay={i * 0.1}>
              <GlassCard tilt={false} className="h-full p-7">
                <div className="text-gradient font-mono text-4xl font-semibold">{st.n}</div>
                <h3 className="mt-4 text-lg">{st.t}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">{st.d}</p>
              </GlassCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* trust / final CTA */}
      <section id="trust" className="mx-auto max-w-5xl px-5 py-20">
        <Reveal>
          <GlassCard tilt={false} className="overflow-hidden p-10 text-center sm:p-14">
            <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-glow/25 to-teal-glow/10 text-emerald-300 ring-1 ring-white/10">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h2 className="mx-auto max-w-2xl text-[clamp(1.8rem,4vw,2.8rem)] leading-tight">
              Anonymity isn't a feature. It's the <span className="text-gradient">foundation.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/50">
              We never link a ballot to a voter. Not in the database, not in logs, not anywhere.
              Your team can be honest because they're genuinely protected.
            </p>
            <div className="mt-8 flex justify-center">
              <Link to={s.token ? homeFor(s.role) : "/signup"}>
                <Button size="lg" leftIcon={<Trophy className="h-5 w-5" />}>
                  {s.token ? "Go to dashboard" : "Create your first round"}
                </Button>
              </Link>
            </div>
          </GlassCard>
        </Reveal>
      </section>

      <footer className="mx-auto max-w-6xl px-5 pb-14 pt-6">
        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/[0.07] pt-8 sm:flex-row">
          <Wordmark size={30} />
          <p className="text-[13px] text-white/35">© {new Date().getFullYear()} Peer Rank · Arcitech</p>
        </div>
      </footer>
    </div>
  );
}
