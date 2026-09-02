import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X, Radio, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, ApiError } from "@/lib/api";
import type { DefaultRosterOut, MemberInput, Poll, RosterSelection } from "@/lib/types";
import { toast } from "@/components/Toast";

const MIN_MEMBERS = 3;
const MIN_DURATION = 1;
const MAX_DURATION = 24 * 60;
const DURATIONS = [
  { label: "5 min", minutes: 5 },
  { label: "10 min", minutes: 10 },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
];

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** Name + email inputs that append to the roster. Adding an email that is
 * already on the roster ticks that row instead of creating a duplicate. */
function MemberAdder({
  members,
  onChange,
}: {
  members: RosterSelection[];
  onChange: (v: RosterSelection[]) => void;
}) {
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  function add() {
    const n = nameDraft.trim();
    const e = emailDraft.trim();
    if (!n) return toast("Give them a name", "err");
    if (!e || !isValidEmail(e)) return toast("Enter a valid email", "err");
    const existing = members.find((x) => x.email.toLowerCase() === e.toLowerCase());
    if (existing) {
      if (existing.selected) {
        toast("Already added", "err");
        return;
      }
      // On the roster but unticked — tick it rather than duplicating the row.
      onChange(
        members.map((x) =>
          x.email.toLowerCase() === e.toLowerCase() ? { ...x, selected: true } : x,
        ),
      );
      toast(`${existing.name} is back in`, "ok");
    } else {
      onChange([...members, { name: n, email: e, selected: true }]);
    }
    setNameDraft("");
    setEmailDraft("");
    nameRef.current?.focus();
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={nameRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              emailRef.current?.focus();
            }
          }}
          placeholder="Name"
          className="ring-focus h-11 min-w-0 flex-1 rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-3 text-[15px] text-[#1D1D1F] outline-none transition focus:border-2 focus:border-[#0071E3] focus:bg-white placeholder:text-[#AEAEB2]"
        />
        <input
          ref={emailRef}
          type="email"
          value={emailDraft}
          onChange={(e) => setEmailDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Email"
          className="ring-focus h-11 min-w-0 flex-1 rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-3 text-[15px] text-[#1D1D1F] outline-none transition focus:border-2 focus:border-[#0071E3] focus:bg-white placeholder:text-[#AEAEB2]"
        />
        <button
          type="button"
          onClick={add}
          className="ring-focus grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73] transition hover:bg-[#EBEBED] hover:text-[#1D1D1F]"
          aria-label="Add member"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/** Tickable roster: every row stays visible, only ticked rows are submitted. */
function RosterPicker({
  members,
  onChange,
}: {
  members: RosterSelection[];
  onChange: (v: RosterSelection[]) => void;
}) {
  const selectedCount = members.filter((m) => m.selected).length;

  function toggle(email: string) {
    onChange(
      members.map((x) =>
        x.email.toLowerCase() === email.toLowerCase() ? { ...x, selected: !x.selected } : x,
      ),
    );
  }

  function setAll(selected: boolean) {
    onChange(members.map((x) => ({ ...x, selected })));
  }

  if (members.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <AnimatePresence initial={false}>
        {members.map((m) => (
          <motion.div
            key={m.email.toLowerCase()}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={m.selected}
                  onChange={() => toggle(m.email)}
                  aria-label={`Include ${m.name}, ${m.email}`}
                  className="ring-focus h-4 w-4 shrink-0 rounded border-[#D2D2D7] accent-[#0071E3]"
                />
                <span
                  className={`truncate text-[15px] ${m.selected ? "text-[#1D1D1F]" : "text-[#AEAEB2]"}`}
                >
                  {m.name}{" "}
                  <span className={`text-[13px] ${m.selected ? "text-[#6E6E73]" : "text-[#AEAEB2]"}`}>
                    {m.email}
                  </span>
                </span>
              </label>
              <button
                type="button"
                onClick={() =>
                  onChange(members.filter((x) => x.email.toLowerCase() !== m.email.toLowerCase()))
                }
                className="ring-focus rounded p-0.5 text-[#AEAEB2] transition hover:text-[#FF3B30]"
                aria-label={`Remove ${m.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex items-center gap-3 px-0.5 pt-0.5">
        <button
          type="button"
          onClick={() => setAll(true)}
          disabled={selectedCount === members.length}
          className="ring-focus rounded text-[12px] text-[#6E6E73] transition hover:text-[#1D1D1F] disabled:cursor-default disabled:text-[#AEAEB2] disabled:hover:text-[#AEAEB2]"
        >
          Select all
        </button>
        <span className="text-[12px] text-[#D2D2D7]">·</span>
        <button
          type="button"
          onClick={() => setAll(false)}
          disabled={selectedCount === 0}
          className="ring-focus rounded text-[12px] text-[#6E6E73] transition hover:text-[#1D1D1F] disabled:cursor-default disabled:text-[#AEAEB2] disabled:hover:text-[#AEAEB2]"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

/** Create-a-poll form, reused both for a fresh poll (empty roster) and for
 * duplicating a past one (roster/name pre-filled, endpoint differs). */
export function PollForm({
  endpoint,
  initialName = "",
  initialMembers = [],
  readonlyRoster = false,
  submitLabel = "Go live & get the link",
  onCreated,
}: {
  endpoint: string;
  initialName?: string;
  initialMembers?: MemberInput[];
  /** When true, hides the add-member inputs — roster is fixed (duplicate mode). */
  readonlyRoster?: boolean;
  submitLabel?: string;
  onCreated: (poll: Poll) => void;
}) {
  const [name, setName] = useState(initialName);
  const [members, setMembers] = useState<RosterSelection[]>(() =>
    initialMembers.map((m) => ({ ...m, selected: true })),
  );
  const [minutes, setMinutes] = useState(10);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Only ever true in create mode, and always cleared — a failed fetch falls
  // back to today's behaviour (empty roster + manual adder), never a stuck spinner.
  const [rosterLoading, setRosterLoading] = useState(!readonlyRoster);
  const [rosterFailed, setRosterFailed] = useState(false);

  // Pre-populate the default team roster, all ticked. Duplicate mode keeps the
  // roster it was handed and never calls this.
  useEffect(() => {
    if (readonlyRoster) return;
    let alive = true;
    const controller = new AbortController();
    api<DefaultRosterOut>("/polls/default-roster", { signal: controller.signal })
      .then((data) => {
        if (!alive) return;
        const fetched = Array.isArray(data?.members) ? data.members : [];
        setMembers((prev) => {
          const seen = new Set(prev.map((m) => m.email.toLowerCase()));
          const defaults = fetched
            .filter((m) => m.email && !seen.has(m.email.toLowerCase()))
            .map((m) => ({ name: m.name, email: m.email, selected: true }));
          return [...defaults, ...prev];
        });
      })
      .catch(() => {
        // Includes 403 (not an admin) and network errors. Silent by design:
        // the manual adder is a complete fallback and a toast here would fire
        // on every mount of the form.
        if (alive) setRosterFailed(true);
      })
      .finally(() => {
        if (alive) setRosterLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [readonlyRoster]);

  const selected = members.filter((m) => m.selected);
  const selectedCount = selected.length;
  const isPreset = DURATIONS.some((d) => d.minutes === minutes);

  function applyCustom(raw: string) {
    setCustomDraft(raw);
    const n = Math.floor(Number(raw));
    if (Number.isFinite(n) && n >= MIN_DURATION && n <= MAX_DURATION) {
      setMinutes(n);
    }
  }

  async function create() {
    if (!name.trim()) return toast("Give it a question", "err");
    if (selectedCount < MIN_MEMBERS) {
      return toast(`Add at least ${MIN_MEMBERS} members before going live`, "err");
    }
    if (!(minutes >= MIN_DURATION && minutes <= MAX_DURATION)) {
      return toast(`Voting window must be between ${MIN_DURATION} and ${MAX_DURATION} minutes`, "err");
    }
    setBusy(true);
    try {
      // Only ticked rows go to the backend, in the order they are shown.
      const payload: MemberInput[] = selected.map((m) => ({ name: m.name, email: m.email }));
      const poll = await api<Poll>(endpoint, {
        method: "POST",
        body: { name: name.trim(), members: payload, duration_minutes: minutes },
      });
      toast("Poll is live", "ok");
      onCreated(poll);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not create the poll", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Input
        label="What are you ranking?"
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[14px] text-[#6E6E73]">Who's eligible</p>
          <span className="text-[12px] font-medium text-[#34C759]">
            {selectedCount} member{selectedCount === 1 ? "" : "s"}
          </span>
        </div>

        {readonlyRoster ? (
          /* Duplicate mode: show roster with remove-only, no add inputs */
          <div className="flex flex-col gap-1.5">
            {members.map((m) => (
              <div
                key={m.email.toLowerCase()}
                className="flex items-center justify-between rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-3 py-2"
              >
                <span className="text-[15px] text-[#1D1D1F]">
                  {m.name}{" "}
                  <span className="text-[13px] text-[#6E6E73]">{m.email}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setMembers(members.filter((x) => x.email.toLowerCase() !== m.email.toLowerCase()))
                  }
                  className="ring-focus rounded p-0.5 text-[#AEAEB2] transition hover:text-[#FF3B30]"
                  aria-label={`Remove ${m.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <MemberAdder members={members} onChange={setMembers} />
            <RosterPicker members={members} onChange={setMembers} />
            {rosterLoading && (
              <p className="mt-2 text-[12px] text-[#AEAEB2]">Loading the team roster…</p>
            )}
            {rosterFailed && members.length === 0 && (
              <p className="mt-2 text-[12px] text-[#AEAEB2]">
                Couldn't load the default team — add people above.
              </p>
            )}
            {members.length > 0 && selectedCount < MIN_MEMBERS && (
              <p className="mt-2 text-[12px] text-[#AEAEB2]">
                Tick at least {MIN_MEMBERS} members to continue.
              </p>
            )}
          </>
        )}
      </div>

      <div>
        <p className="mb-2 text-[14px] text-[#6E6E73]">Voting window</p>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              onClick={() => {
                setMinutes(d.minutes);
                setCustomOpen(false);
              }}
              className={`ring-focus flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
                !customOpen && minutes === d.minutes
                  ? "border-[#1D1D1F] bg-[#1D1D1F] text-white"
                  : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#EBEBED] hover:text-[#1D1D1F]"
              }`}
            >
              <Clock className="h-3.5 w-3.5" /> {d.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCustomOpen(true);
              setCustomDraft(isPreset ? "" : String(minutes));
            }}
            className={`ring-focus flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${
              customOpen || !isPreset
                ? "border-[#1D1D1F] bg-[#1D1D1F] text-white"
                : "border-[#D2D2D7] bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#EBEBED] hover:text-[#1D1D1F]"
            }`}
          >
            <Clock className="h-3.5 w-3.5" /> Custom
          </button>
        </div>

        <AnimatePresence>
          {customOpen || !isPreset ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number"
                  min={MIN_DURATION}
                  max={MAX_DURATION}
                  value={customDraft}
                  onChange={(e) => applyCustom(e.target.value)}
                  placeholder={`Minutes (${MIN_DURATION}–${MAX_DURATION})`}
                  className="ring-focus h-11 w-full rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-4 text-[15px] text-[#1D1D1F] outline-none transition focus:border-2 focus:border-[#0071E3] focus:bg-white placeholder:text-[#AEAEB2]"
                />
                <span className="shrink-0 text-[13px] text-[#6E6E73]">minutes</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <p className="mt-2 text-[12px] text-[#AEAEB2]">
          Closes automatically after this timer, or the moment everyone's voted.
        </p>
      </div>

      <Button
        block
        size="lg"
        loading={busy}
        disabled={selectedCount < MIN_MEMBERS || !name.trim()}
        onClick={create}
        leftIcon={<Radio className="h-[18px] w-[18px]" />}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
