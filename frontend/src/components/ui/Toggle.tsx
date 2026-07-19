import { motion } from "framer-motion";

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`ring-focus relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-300 disabled:opacity-40 ${
        checked
          ? "border-teal-glow/50 bg-gradient-to-r from-teal-glow/80 to-cyan-glow/80"
          : "border-white/12 bg-white/[0.06]"
      }`}
    >
      <motion.span
        className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-md"
        animate={{ left: checked ? "calc(100% - 22px)" : "2px" }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}
