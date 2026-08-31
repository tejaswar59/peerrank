import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, error, icon: _icon, hint, className = "", type, onFocus, onBlur, ...rest },
  ref,
) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  const effectiveType = isPassword ? (reveal ? "text" : "password") : type;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[14px] text-[#6E6E73]">{label}</label>
      <div
        className={[
          "relative rounded-lg transition-all duration-150",
          error
            ? "border-2 border-[#FF3B30] bg-white"
            : focused
              ? "border-2 border-[#0071E3] bg-white"
              : "border border-[#D2D2D7] bg-[#F5F5F7]",
        ].join(" ")}
      >
        <input
          ref={ref}
          id={id}
          type={effectiveType}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          className={[
            "ring-focus w-full rounded-lg bg-transparent px-[14px] py-[11px] text-[17px] text-[#1D1D1F] outline-none placeholder:text-[#AEAEB2]",
            isPassword ? "pr-11" : "",
          ].join(" ")}
        />
        {isPassword ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            className="ring-focus absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#AEAEB2] transition hover:text-[#6E6E73]"
          >
            {reveal ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-[14px] text-[#FF3B30]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[14px] text-[#AEAEB2]">{hint}</p>
      ) : null}
    </div>
  );
});
