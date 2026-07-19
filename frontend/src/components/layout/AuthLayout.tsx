import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Wordmark } from "../Brand";

// Centered glass panel for all auth screens, floating over the shared 3D scene.
export default function AuthLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="relative z-[2] flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="ring-focus mb-8 rounded-xl">
        <Wordmark size={38} />
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        className="glass-strong w-full max-w-[440px] rounded-xl3 p-7 sm:p-9"
      >
        <div className="mb-7">
          <h1 className="text-[26px] leading-tight">{title}</h1>
          {subtitle ? <p className="mt-1.5 text-[14px] text-white/50">{subtitle}</p> : null}
        </div>
        {children}
      </motion.div>
      <p className="mt-8 text-center text-[12px] text-white/30">
        Peer Rank — recognition, reimagined.
      </p>
    </div>
  );
}
