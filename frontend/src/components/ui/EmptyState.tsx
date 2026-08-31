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
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D2D2D7] bg-[#F5F5F7] px-6 py-16 text-center"
    >
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-white text-[#AEAEB2]">
        {icon}
      </div>
      <h3 className="text-lg text-[#1D1D1F]">{title}</h3>
      {message ? <p className="mt-1.5 max-w-sm text-[14px] text-[#6E6E73]">{message}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </motion.div>
  );
}
