import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle } from "lucide-react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
}

// Floating-label glass input. The label lifts when focused or filled; the ring
// glows cyan on focus and rose on error.
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, icon, hint, className = "", onFocus, onBlur, onChange, value, defaultValue, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hasValue, setHasValue] = useState(
    Boolean(value ?? defaultValue ?? ""),
  );
  const lifted = focused || hasValue;

  return (
    <div className={className}>
      <div
        className={[
          "relative rounded-xl2 border bg-white/[0.03] transition-all duration-300",
          error
            ? "border-rose-500/60 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]"
            : focused
              ? "border-cyan-glow/60 shadow-[0_0_0_3px_rgba(34,211,238,0.16)]"
              : "border-white/10 hover:border-white/20",
        ].join(" ")}
      >
        {icon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
            {icon}
          </span>
        ) : null}
        <label
          className={[
            "pointer-events-none absolute left-0 origin-left text-white/45 transition-all duration-200",
            icon ? "left-11" : "left-4",
            lifted
              ? "top-1.5 text-[11px] font-medium text-cyan-glow/80"
              : "top-1/2 -translate-y-1/2 text-[14px]",
          ].join(" ")}
        >
          {label}
        </label>
        <input
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            setHasValue(Boolean(e.target.value));
            onBlur?.(e);
          }}
          onChange={(e) => {
            setHasValue(Boolean(e.target.value));
            onChange?.(e);
          }}
          className={[
            "ring-focus w-full bg-transparent pb-2 pt-6 text-[14px] text-white/90 outline-none placeholder:text-white/25",
            icon ? "pl-11 pr-4" : "px-4",
          ].join(" ")}
        />
      </div>
      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            className="flex items-center gap-1.5 overflow-hidden pl-1 pt-1.5 text-[12px] text-rose-400"
          >
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </motion.div>
        ) : hint ? (
          <p className="pl-1 pt-1.5 text-[12px] text-white/35">{hint}</p>
        ) : null}
      </AnimatePresence>
    </div>
  );
});
