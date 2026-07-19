import { useRef, useEffect } from "react";
import { motion } from "framer-motion";

// Six (configurable) glowing digit cells. Handles paste, arrows, backspace, and
// auto-advance. Calls onComplete when full.
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  autoFocus = true,
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const digits = Array.from({ length }, (_, i) => value[i] || "");

  function commit(next: string[], focusIdx: number) {
    const joined = next.join("").slice(0, length);
    onChange(joined);
    refs.current[Math.min(Math.max(focusIdx, 0), length - 1)]?.focus();
    if (joined.length === length && !next.slice(0, length).includes("")) onComplete?.(joined);
  }

  function setAt(i: number, d: string) {
    const next = digits.slice();
    next[i] = d;
    commit(next, d ? i + 1 : i);
  }

  // Distribute one-or-many digits starting at cell `i` (handles fast typing,
  // autofill and paste where several digits land on one input at once).
  function fillFrom(i: number, raw: string) {
    const chars = raw.replace(/\D/g, "").split("");
    if (chars.length === 0) {
      setAt(i, "");
      return;
    }
    const next = digits.slice();
    let idx = i;
    for (const c of chars) {
      if (idx >= length) break;
      next[idx] = c;
      idx++;
    }
    commit(next, idx);
  }

  return (
    <div className="flex justify-center gap-2.5 sm:gap-3">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          value={d}
          whileFocus={{ scale: 1.05 }}
          onChange={(e) => fillFrom(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i] && i > 0) {
              refs.current[i - 1]?.focus();
              setAt(i - 1, "");
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            if (!paste) return;
            onChange(paste);
            if (paste.length === length) onComplete?.(paste);
            refs.current[Math.min(paste.length, length - 1)]?.focus();
          }}
          className={[
            "ring-focus h-14 w-11 rounded-xl2 border bg-white/[0.03] text-center text-2xl font-semibold text-white/90 outline-none transition-all duration-200 tabnums sm:h-16 sm:w-14",
            error
              ? "border-rose-500/60 shadow-[0_0_0_3px_rgba(244,63,94,0.15)]"
              : d
                ? "border-cyan-glow/50 shadow-[0_0_20px_-6px_rgba(34,211,238,0.5)]"
                : "border-white/12",
          ].join(" ")}
        />
      ))}
    </div>
  );
}
