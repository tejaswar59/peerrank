import { motion } from "framer-motion";
import type { DirectoryUser } from "@/lib/types";

// Cap the visible list so the dropdown never grows into an unusable wall of
// rows on a large directory — the "+N more" hint keeps this honest instead of
// silently hiding results.
export const MAX_SUGGESTIONS = 8;

/** Names/emails matching `query`, alphabetical (directory arrives pre-sorted
 * from the backend), minus anyone already on the roster/team. */
export function filterDirectory(
  directory: DirectoryUser[],
  query: string,
  excludeEmails: string[],
): DirectoryUser[] {
  const exclude = new Set(excludeEmails.map((e) => e.toLowerCase()));
  const q = query.trim().toLowerCase();
  return directory.filter((u) => {
    if (exclude.has(u.email.toLowerCase())) return false;
    if (!q) return true;
    return u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
}

export function DirectorySuggestions({
  matches,
  highlighted,
  onPick,
}: {
  matches: DirectoryUser[];
  highlighted: number;
  onPick: (u: DirectoryUser) => void;
}) {
  if (matches.length === 0) return null;
  const shown = matches.slice(0, MAX_SUGGESTIONS);
  const hiddenCount = matches.length - shown.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15 }}
      className="glass-strong absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-auto rounded-xl2 p-1.5"
      role="listbox"
    >
      {shown.map((u, i) => (
        <button
          type="button"
          key={u.email}
          role="option"
          aria-selected={i === highlighted}
          // pointerdown (not click) fires before the input's onBlur closes
          // the dropdown; preventDefault stops the input from losing focus
          // mid-click so the pick always registers.
          onPointerDown={(e) => {
            e.preventDefault();
            onPick(u);
          }}
          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition ${
            i === highlighted
              ? "bg-cyan-glow/15 text-white"
              : "text-white/70 hover:bg-white/[0.06]"
          }`}
        >
          <span className="truncate text-[13.5px] font-medium">{u.display_name}</span>
          <span className="truncate font-mono text-[11.5px] text-white/35">{u.email}</span>
        </button>
      ))}
      {hiddenCount > 0 ? (
        <p className="px-3 py-1.5 text-[11px] text-white/30">
          +{hiddenCount} more — keep typing to narrow it down
        </p>
      ) : null}
    </motion.div>
  );
}
