import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "glass" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  magnetic?: boolean; // accepted but unused — kept for call-site compatibility
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  block?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[#1D1D1F] text-white hover:bg-[#3A3A3C] active:bg-[#1D1D1F]",
  glass:
    "bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:bg-[#F5F5F7]",
  ghost:
    "bg-transparent text-[#1D1D1F] hover:bg-[#EBEBED]",
  danger:
    "bg-[#FF3B30] text-white hover:bg-[#D63028]",
  gold:
    "bg-[#F5F5F7] text-[#1D1D1F] border border-[#D2D2D7] hover:bg-[#EBEBED]",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] rounded-lg gap-1.5",
  md: "h-11 px-5 text-[15px] rounded-lg gap-2",
  lg: "h-[52px] px-7 text-[17px] rounded-lg gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    magnetic: _magnetic,
    leftIcon,
    rightIcon,
    block,
    className = "",
    children,
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={[
        "ring-focus relative inline-flex select-none items-center justify-center font-medium transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        block ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-[1.1em] w-[1.1em] animate-spin" />
      ) : (
        leftIcon
      )}
      {children ? <span className="relative">{children}</span> : null}
      {!loading ? rightIcon : null}
    </button>
  );
});
