// Clean Apple-style wordmark — no gradients, no animation.
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center rounded-[30%] bg-[#1D1D1F]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="none">
        <path
          d="M6 18V6h5a4 4 0 0 1 0 8H6"
          stroke="white"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="text-[17px] font-semibold tracking-tight text-[#1D1D1F]">
        peerrank
      </span>
    </span>
  );
}
