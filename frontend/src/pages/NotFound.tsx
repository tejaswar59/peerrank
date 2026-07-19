import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Compass } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/Brand";
import { useSession } from "@/lib/useSession";
import { homeFor } from "@/routes/guards";

export default function NotFound() {
  const s = useSession();
  return (
    <div className="relative z-[2] flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Link to="/" className="ring-focus mb-10 rounded-xl">
        <Wordmark size={34} />
      </Link>

      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="relative"
      >
        <div
          className="animate-floaty select-none text-[clamp(7rem,26vw,16rem)] font-semibold leading-none tracking-tighter text-gradient"
          style={{ WebkitTextStroke: "0px" }}
        >
          404
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10 blur-[80px]">
          <div className="mx-auto h-40 w-40 rounded-full bg-cyan-glow/40" />
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-2 text-2xl"
      >
        Lost in the aurora
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="mt-2 max-w-sm text-[15px] text-white/50"
      >
        This page drifted out of orbit. Let's get you back to solid ground.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 flex gap-3"
      >
        <Link to={s.token ? homeFor(s.role) : "/"}>
          <Button size="lg" leftIcon={<Home className="h-5 w-5" />}>
            {s.token ? "Back to dashboard" : "Back home"}
          </Button>
        </Link>
        {!s.token ? (
          <Link to="/login">
            <Button variant="glass" size="lg" leftIcon={<Compass className="h-5 w-5" />}>
              Sign in
            </Button>
          </Link>
        ) : null}
      </motion.div>
    </div>
  );
}
