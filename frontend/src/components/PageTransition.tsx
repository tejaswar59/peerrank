import type { ReactNode } from "react";
import { motion } from "framer-motion";

// Cinematic page transition — content rises + fades in.
// NOTE: no CSS `filter` here. A lingering `filter` on this wrapper becomes a
// containing block and BREAKS `position: sticky` on the header (it stops
// sticking and overlaps the page). `y`/opacity are cleaned up by Framer after
// the animation, so they don't create that problem.
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Stagger container + item helpers for lists.
export const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
export const listItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] } },
};
