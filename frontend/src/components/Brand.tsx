import { motion } from "framer-motion";

// Animated monogram — a glass tile with an orbiting spark.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-[30%] bg-gradient-to-br from-teal-glow to-emerald-glow text-white shadow-[0_6px_20px_-6px_rgba(20,184,166,0.7)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none">
        <path
          d="M6 18V6h5a4 4 0 0 1 0 8H6"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <motion.span
        className="absolute h-1 w-1 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.8)]"
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        style={{ top: 2, left: "50%", transformOrigin: `0 ${size / 2 - 2}px` }}
      />
    </span>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="text-[17px] font-semibold tracking-tight text-white">
        Peer<span className="text-gradient">Rank</span>
      </span>
    </span>
  );
}
