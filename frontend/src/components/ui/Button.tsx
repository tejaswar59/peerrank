import { forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "glass" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  magnetic?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  block?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-br from-teal-glow to-emerald-glow shadow-[0_10px_40px_-10px_rgba(20,184,166,0.6)] hover:shadow-[0_14px_50px_-8px_rgba(20,184,166,0.75)]",
  glass:
    "text-white/90 glass hover:bg-white/[0.07] border-white/10",
  ghost: "text-white/70 hover:text-white hover:bg-white/[0.06]",
  danger:
    "text-white bg-gradient-to-br from-rose-500 to-red-600 shadow-[0_10px_40px_-10px_rgba(244,63,94,0.6)]",
  gold: "text-ink-950 bg-gradient-to-br from-[#ffe9b0] to-[#e0b25a] shadow-[0_10px_40px_-10px_rgba(224,178,90,0.6)] font-semibold",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-xl gap-1.5",
  md: "h-11 px-5 text-[14px] rounded-xl2 gap-2",
  lg: "h-[52px] px-7 text-[15px] rounded-xl2 gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    magnetic = true,
    leftIcon,
    rightIcon,
    block,
    className = "",
    children,
    disabled,
    onClick,
    ...rest
  },
  _ref,
) {
  const reduce = useReducedMotion();
  const localRef = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 300, damping: 20 });
  const sy = useSpring(my, { stiffness: 300, damping: 20 });

  function handleMove(e: React.MouseEvent) {
    if (!magnetic || reduce) return;
    const el = localRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    mx.set((e.clientX - (r.left + r.width / 2)) * 0.25);
    my.set((e.clientY - (r.top + r.height / 2)) * 0.35);
  }
  function reset() {
    mx.set(0);
    my.set(0);
  }

  return (
    <motion.button
      ref={localRef}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      onClick={onClick as any}
      disabled={disabled || loading}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: reduce ? 1 : 0.96 }}
      className={[
        "group ring-focus relative inline-flex select-none items-center justify-center overflow-hidden font-medium transition-[box-shadow,background,color,opacity] duration-300",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...(rest as any)}
    >
      {/* sheen sweep on hover */}
      {variant === "primary" || variant === "gold" ? (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      ) : null}
      {loading ? (
        <Loader2 className="h-[1.1em] w-[1.1em] animate-spin" />
      ) : (
        leftIcon
      )}
      {children ? <span className="relative">{children}</span> : null}
      {!loading ? rightIcon : null}
    </motion.button>
  );
});
