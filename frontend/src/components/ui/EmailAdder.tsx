import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, AtSign } from "lucide-react";
import { isEmail } from "@/lib/format";
import { toast } from "@/components/Toast";
import type { DirectoryUser } from "@/lib/types";
import { DirectorySuggestions, MAX_SUGGESTIONS, filterDirectory } from "./DirectorySuggestions";

// Add emails one at a time; each becomes a numbered chip. Enter/comma commits.
export function EmailAdder({
  value,
  onChange,
  label = "Add email",
  hint,
  directory,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  label?: string;
  /** Small helper line rendered under the input, e.g. explaining a minimum
   * member count or how to add multiple at once. */
  hint?: string;
  /** Registered, non-admin accounts to suggest as the admin types a name —
   * picking one adds it directly, skipping manual email entry. Omit to fall
   * back to plain manual typing only. */
  directory?: DirectoryUser[];
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const matches = directory ? filterDirectory(directory, draft, value) : [];

  function add() {
    const e = draft.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) return toast("Enter a valid email", "err");
    if (value.includes(e)) return toast("Already added", "err");
    onChange([...value, e]);
    setDraft("");
  }

  function pick(u: DirectoryUser) {
    if (!value.includes(u.email)) onChange([...value, u.email]);
    setDraft("");
    setOpen(false);
    setHighlighted(-1);
  }

  return (
    <div>
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <AtSign className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-white/35" />
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setHighlighted(-1);
              if (directory) setOpen(true);
            }}
            onFocus={() => {
              if (directory) setOpen(true);
            }}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!directory) {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add();
                }
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setHighlighted((h) => Math.min(h + 1, Math.min(matches.length, MAX_SUGGESTIONS) - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlighted((h) => Math.max(h - 1, -1));
              } else if (e.key === "Escape") {
                setOpen(false);
                setHighlighted(-1);
              } else if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                if (open && highlighted >= 0 && matches[highlighted]) {
                  pick(matches[highlighted]);
                } else {
                  add();
                }
              }
            }}
            placeholder={label}
            className="ring-focus h-12 w-full rounded-xl2 border border-white/10 bg-white/[0.03] pl-11 pr-4 text-[14px] text-white/90 outline-none transition focus:border-cyan-glow/50 placeholder:text-white/25"
          />
          <AnimatePresence>
            {open ? (
              <DirectorySuggestions matches={matches} highlighted={highlighted} onPick={pick} />
            ) : null}
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={add}
          className="ring-focus grid h-12 w-12 shrink-0 place-items-center rounded-xl2 bg-white/[0.06] text-cyan-glow transition hover:bg-white/[0.1]"
          aria-label="Add"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {hint ? <p className="mt-2 pl-1 text-[12px] text-white/40">{hint}</p> : null}

      {value.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {value.map((e, i) => (
              <motion.div
                key={e}
                layout
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-3 rounded-xl border border-teal-glow/25 bg-teal-glow/10 px-3 py-2"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-glow/80 text-[11px] font-bold text-ink-950 tabnums">
                  {i + 1}
                </span>
                <span className="flex-1 truncate font-mono text-[13px] text-teal-200">{e}</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== e))}
                  className="ring-focus rounded-md p-0.5 text-teal-300/70 transition hover:text-rose-400"
                  aria-label={`Remove ${e}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
