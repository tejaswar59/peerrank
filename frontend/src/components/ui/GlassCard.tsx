import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  tilt?: boolean;  // accepted but ignored — kept for call-site compatibility
  glow?: boolean;  // accepted but ignored — kept for call-site compatibility
  onClick?: () => void;
  as?: "div" | "button";
}

export default function GlassCard({ children, className = "", onClick }: Props) {
  return (
    <div
      onClick={onClick}
      className={[
        "bg-white border border-[#D2D2D7] rounded-2xl shadow-card",
        onClick ? "cursor-pointer" : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
