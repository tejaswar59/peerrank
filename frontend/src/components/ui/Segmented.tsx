import { motion } from "framer-motion";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

// Segmented control with a sliding glass highlight (shared layout animation).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  id,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="relative grid gap-1 rounded-xl2 border border-white/10 bg-white/[0.03] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`ring-focus relative z-[1] flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-medium transition-colors duration-200 ${
              active ? "text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            {active ? (
              <motion.span
                layoutId={`seg-${id || "x"}`}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 -z-[1] rounded-xl bg-gradient-to-br from-teal-glow/25 to-cyan-glow/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10"
              />
            ) : null}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
