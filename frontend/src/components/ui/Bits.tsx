import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { initials, avatarGradient } from "@/lib/format";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-white/15 border-t-cyan-glow ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

// Liquid orbital loader for full-screen states.
export function OrbLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-20">
      <div className="relative h-16 w-16">
        <span className="absolute inset-0 rounded-full border border-cyan-glow/30" />
        <span className="absolute inset-0 animate-pulse-ring rounded-full border border-cyan-glow/40" />
        <span className="absolute inset-2 animate-spin rounded-full border-2 border-transparent border-t-teal-glow border-r-cyan-glow" />
        <span className="absolute inset-[38%] rounded-full bg-cyan-glow/80 blur-[2px]" />
      </div>
      {label ? <p className="text-sm text-white/50">{label}</p> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-white/[0.04] ${className}`}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

type BadgeTone = "open" | "closed" | "cyan" | "violet" | "gold" | "muted";
const BADGE: Record<BadgeTone, string> = {
  open: "bg-emerald-glow/15 text-emerald-300 border-emerald-glow/30",
  closed: "bg-white/5 text-white/50 border-white/10",
  cyan: "bg-cyan-glow/15 text-cyan-200 border-cyan-glow/30",
  violet: "bg-violet-glow/15 text-violet-200 border-violet-glow/30",
  gold: "bg-[#f5d580]/15 text-[#f5d580] border-[#f5d580]/30",
  muted: "bg-white/5 text-white/45 border-white/10",
};
export function Badge({
  tone = "muted",
  children,
  dot,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${BADGE[tone]} ${className}`}
    >
      {dot ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  size = 40,
  presence,
}: {
  name: string;
  size?: number;
  presence?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <span
        className="grid place-items-center rounded-full font-semibold text-white/95 ring-1 ring-white/10"
        style={{
          width: size,
          height: size,
          background: avatarGradient(name),
          fontSize: size * 0.36,
        }}
      >
        {initials(name)}
      </span>
      {presence ? (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-emerald-glow" />
      ) : null}
    </span>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-white/[0.07] ${className}`} />;
}

// Section reveal wrapper: fades + rises into view.
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
