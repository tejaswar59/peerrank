// Animated aurora + mesh-gradient blobs + faint grid. Pure CSS/GPU, sits
// beneath the 3D canvas content and above the base colour for layered depth.
export default function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      {/* base vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 50% -10%, rgba(20,184,166,0.12), transparent 60%)," +
            "radial-gradient(900px 600px at 100% 100%, rgba(139,92,246,0.10), transparent 55%)," +
            "radial-gradient(800px 600px at 0% 80%, rgba(59,130,246,0.10), transparent 55%)," +
            "#04060a",
        }}
      />
      {/* drifting aurora blobs */}
      <div className="absolute left-[8%] top-[6%] h-[42vw] w-[42vw] rounded-full bg-teal-glow/20 blur-[120px] animate-aurora" />
      <div
        className="absolute right-[4%] top-[22%] h-[36vw] w-[36vw] rounded-full bg-cyan-glow/15 blur-[130px] animate-aurora"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="absolute bottom-[2%] left-[26%] h-[40vw] w-[40vw] rounded-full bg-violet-glow/15 blur-[140px] animate-aurora"
        style={{ animationDelay: "-14s" }}
      />
      {/* subtle grid */}
      <div className="absolute inset-0 bg-grid opacity-60" />
    </div>
  );
}
