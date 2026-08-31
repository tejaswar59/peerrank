import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/Brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Link to="/" className="ring-focus mb-10 rounded-lg">
        <Wordmark size={34} />
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        <div className="select-none text-[clamp(7rem,26vw,16rem)] font-bold leading-none tracking-tighter text-[#1D1D1F]">
          404
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-2 text-[24px] font-semibold text-[#1D1D1F]"
      >
        Page not found
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="mt-2 max-w-sm text-[17px] text-[#6E6E73]"
      >
        This page doesn't exist. Let's get you back on track.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 flex gap-3"
      >
        <Link to="/">
          <Button size="lg" leftIcon={<Home className="h-5 w-5" />}>
            Back home
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
