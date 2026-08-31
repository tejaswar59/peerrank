import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { initials, avatarGradient } from "@/lib/format";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-[#D2D2D7] border-t-[#1D1D1F] ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

// Simple loading spinner for full-screen states.
export function OrbLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#D2D2D7] border-t-[#1D1D1F]" />
      {label ? <p className="text-[14px] text-[#6E6E73]">{label}</p> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-xl bg-[#F5F5F7] ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[#EBEBED] to-transparent" />
    </div>
  );
}

type BadgeTone = "open" | "closed" | "cyan" | "violet" | "gold" | "muted";
const BADGE: Record<BadgeTone, string> = {
  open: "bg-[#E8FAF0] text-[#1A7C3E] border-[#34C759]/30",
  closed: "bg-[#F5F5F7] text-[#6E6E73] border-[#D2D2D7]",
  cyan: "bg-[#E8F4FD] text-[#0071E3] border-[#0071E3]/30",
  violet: "bg-[#F3EFFE] text-[#6B21A8] border-[#7C3AED]/30",
  gold: "bg-[#FEF9EC] text-[#B45309] border-[#F5D580]/30",
  muted: "bg-[#F5F5F7] text-[#6E6E73] border-[#D2D2D7]",
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
        className="grid place-items-center rounded-full font-semibold text-white ring-1 ring-[#D2D2D7]"
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
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#34C759]" />
      ) : null}
    </span>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px w-full bg-[#D2D2D7] ${className}`} />;
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
