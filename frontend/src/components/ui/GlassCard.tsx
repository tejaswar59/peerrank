import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion, useTransform } from "framer-motion";

interface Props {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
  glow?: boolean;
  onClick?: () => void;
  as?: "div" | "button";
}

// A glass surface that tilts in 3D toward the pointer and lifts a specular
// highlight where the cursor is. The hallmark "premium card".
export default function GlassCard({
  children,
  className = "",
  tilt = true,
  glow = true,
  onClick,
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 200, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 200, damping: 18 });
  const glowX = useTransform(px, (v) => `${v * 100}%`);
  const glowY = useTransform(py, (v) => `${v * 100}%`);

  function move(e: React.MouseEvent) {
    if (!tilt || reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function leave() {
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={move}
      onMouseLeave={leave}
      onClick={onClick}
      style={
        tilt && !reduce
          ? { rotateX: rx, rotateY: ry, transformPerspective: 1000 }
          : undefined
      }
      className={[
        "group glass gradient-border relative rounded-xl3",
        onClick ? "cursor-pointer" : "",
        className,
      ].join(" ")}
    >
      {glow && !reduce ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: useTransform(
              [glowX, glowY],
              ([x, y]) =>
                `radial-gradient(400px circle at ${x} ${y}, rgba(34,211,238,0.14), transparent 45%)`,
            ),
          }}
        />
      ) : null}
      <div className="relative z-[2] [transform:translateZ(40px)]">{children}</div>
    </motion.div>
  );
}
