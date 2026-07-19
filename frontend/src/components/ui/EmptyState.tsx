import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-xl3 border border-dashed border-white/10 bg-white/[0.015] px-6 py-16 text-center"
    >
      <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.04] text-cyan-glow">
        <span className="absolute inset-0 animate-pulse-ring rounded-2xl border border-cyan-glow/30" />
        {icon}
      </div>
      <h3 className="text-lg text-white/90">{title}</h3>
      {message ? <p className="mt-1.5 max-w-sm text-[14px] text-white/45">{message}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </motion.div>
  );
}
