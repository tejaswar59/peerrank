import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

export interface PwRule {
  label: string;
  test: (pw: string) => boolean;
}

// The password policy, reused for both the live checklist and validation.
export const PASSWORD_RULES: PwRule[] = [
  { label: "At least 8 characters", test: (p) => p.length >= 8 },
  { label: "One uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "One number (0–9)", test: (p) => /\d/.test(p) },
  { label: "One special symbol (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function passwordValid(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}

// Live checklist — each rule flips to a green tick the moment it's satisfied.
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.label} className="flex items-center gap-2">
            <span
              className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border transition-colors duration-300 ${
                ok
                  ? "border-emerald-glow/50 bg-emerald-glow/20 text-emerald-300"
                  : "border-white/15 bg-white/[0.03] text-transparent"
              }`}
            >
              <AnimatePresence mode="wait">
                {ok ? (
                  <motion.span
                    key="c"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </motion.span>
                ) : (
                  <motion.span key="d" className="h-1 w-1 rounded-full bg-white/25" />
                )}
              </AnimatePresence>
            </span>
            <span
              className={`text-[12.5px] transition-colors duration-300 ${
                ok ? "text-white/70" : "text-white/40"
              }`}
            >
              {rule.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
