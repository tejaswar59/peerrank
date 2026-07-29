import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Trash2, Pencil, Check, UserPlus, X, Users, Radio } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmailAdder } from "@/components/ui/EmailAdder";
import { DirectorySuggestions, filterDirectory, MAX_SUGGESTIONS } from "@/components/ui/DirectorySuggestions";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import type { DirectoryUser, Team } from "@/lib/types";
import { toast } from "@/components/Toast";
import { isEmail } from "@/lib/format";
import { listContainer, listItem } from "@/components/PageTransition";

export function TeamsPanel({
  teams,
  reload,
  onOpenRounds,
}: {
  teams: Team[];
  reload: () => void;
  /** Navigate to this team's rounds & results. Omit to hide the affordance. */
  onOpenRounds?: (teamId: number) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [addEmail, setAddEmail] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addHighlight, setAddHighlight] = useState(-1);

  // Registered, non-admin accounts — powers the "pick a teammate by name"
  // autocomplete on both the create-team form and the edit-team add-member
  // input. A fetch failure degrades gracefully: the fields still work as
  // plain manual email entry, just without suggestions.
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  useEffect(() => {
    api<DirectoryUser[]>("/users")
      .then(setDirectory)
      .catch((e) => console.error("Could not load teammate directory", e));
  }, []);

  const MIN_TEAM_SIZE = 3;

  async function createTeam() {
    if (!name.trim()) return toast("Name the team", "err");
    if (emails.length < MIN_TEAM_SIZE) {
      return toast(
        `A team needs at least ${MIN_TEAM_SIZE} members to create — please add a few more teammates.`,
        "err",
      );
    }
    setBusy(true);
    try {
      await api("/teams", {
        method: "POST",
        body: { name: name.trim(), emails },
      });
      toast("Team created", "ok");
      setCreating(false);
      setName("");
      setEmails([]);
      reload();
    } catch (e: any) {
      toast(e?.message || "Could not create team", "err");
    } finally {
      setBusy(false);
    }
  }

  async function delTeam(t: Team) {
    const ok = await confirmDialog({
      title: `Delete team "${t.name}"?`,
      message: "Its members and rounds will be archived.",
      confirmText: "Delete team",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/teams/${t.id}`, { method: "DELETE" });
      toast("Team deleted", "ok");
      setEditing(null);
      reload();
    } catch (e: any) {
      toast(e?.message || "Could not delete", "err");
    }
  }

  async function addMember(t: Team, emailOverride?: string) {
    const e = (emailOverride ?? addEmail).trim().toLowerCase();
    if (!isEmail(e)) return toast("Enter a valid email", "err");
    try {
      await api(`/teams/${t.id}/members`, { method: "POST", body: { email: e } });
      toast("Teammate added", "ok");
      setAddEmail("");
      setAddOpen(false);
      setAddHighlight(-1);
      reload();
    } catch (err: any) {
      toast(err?.message || "Could not add", "err");
    }
  }

  async function removeMember(t: Team, memberId: number, email: string) {
    const ok = await confirmDialog({
      title: "Remove teammate?",
      message: `${email} will no longer be on ${t.name}.`,
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/teams/${t.id}/members/${memberId}`, { method: "DELETE" });
      toast("Teammate removed", "ok");
      reload();
    } catch (e: any) {
      toast(e?.message || "Could not remove", "err");
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg text-white/80">Teams</h2>
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating((v) => !v)}>
          {creating ? "Close" : "New team"}
        </Button>
      </div>

      <AnimatePresence>
        {creating ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-5 overflow-hidden"
          >
            <GlassCard tilt={false} className="p-6">
              <Input label="Team name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] text-white/50">Members</p>
                  <span
                    className={`text-[12px] font-medium ${
                      emails.length >= MIN_TEAM_SIZE ? "text-emerald-glow" : "text-white/35"
                    }`}
                  >
                    {emails.length} / {MIN_TEAM_SIZE} minimum
                  </span>
                </div>
                <EmailAdder
                  value={emails}
                  onChange={setEmails}
                  label="teammate@company.com"
                  hint={`Type a name to pick a registered teammate, or type an email and press Enter (or tap +) to add anyone else — you need at least ${MIN_TEAM_SIZE} teammates to open voting for this team.`}
                  directory={directory}
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <Button variant="glass" onClick={() => setCreating(false)}>Cancel</Button>
                <Button loading={busy} disabled={emails.length < MIN_TEAM_SIZE || !name.trim()} onClick={createTeam}>
                  Create team
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {teams.length === 0 && !creating ? (
        <EmptyState
          icon={<Users className="h-7 w-7" />}
          title="No teams yet"
          message="Add a team and its members to open a voting round."
          action={<Button leftIcon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>New team</Button>}
        />
      ) : (
        <motion.div variants={listContainer} initial="hidden" animate="show" className="flex flex-col gap-4">
          {teams.map((t) => {
            const isEditing = editing === t.id;
            return (
              <motion.div key={t.id} variants={listItem}>
                <GlassCard tilt={false} className="p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg">
                        {t.name}{" "}
                        <span className="text-[14px] font-normal text-white/40">
                          ({t.members.length})
                        </span>
                      </h3>
                    </div>
                    <div className="flex gap-1.5">
                      {onOpenRounds ? (
                        <button
                          onClick={() => onOpenRounds(t.id)}
                          className="ring-focus grid h-9 w-9 place-items-center rounded-xl text-white/50 transition hover:bg-white/[0.06] hover:text-white"
                          aria-label="Rounds & results"
                        >
                          <Radio className="h-[16px] w-[16px]" />
                        </button>
                      ) : null}
                      <button
                        onClick={() => {
                          setEditing(isEditing ? null : t.id);
                          setAddEmail("");
                          setAddOpen(false);
                          setAddHighlight(-1);
                        }}
                        className={`ring-focus grid h-9 w-9 place-items-center rounded-xl transition ${
                          isEditing ? "bg-cyan-glow/20 text-cyan-glow" : "text-white/50 hover:bg-white/[0.06] hover:text-white"
                        }`}
                        aria-label="Edit members"
                      >
                        {isEditing ? <Check className="h-[17px] w-[17px]" /> : <Pencil className="h-[16px] w-[16px]" />}
                      </button>
                      <button
                        onClick={() => delTeam(t)}
                        className="ring-focus grid h-9 w-9 place-items-center rounded-xl text-white/50 transition hover:bg-rose-500/15 hover:text-rose-400"
                        aria-label="Delete team"
                      >
                        <Trash2 className="h-[16px] w-[16px]" />
                      </button>
                    </div>
                  </div>

                  {/* members */}
                  {isEditing ? (
                    <div className="mt-4 flex flex-col gap-2">
                      {t.members.map((m) => (
                        <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
                          <Avatar name={m.display_name || m.email} size={32} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium text-white/85">{m.display_name}</p>
                            <p className="truncate font-mono text-[11.5px] text-white/40">{m.email}</p>
                          </div>
                          <button
                            onClick={() => removeMember(t, m.id, m.email)}
                            className="ring-focus rounded-lg p-1.5 text-white/40 transition hover:bg-rose-500/15 hover:text-rose-400"
                            aria-label="Remove"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <div className="mt-1 flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            label="Add teammate email"
                            value={addEmail}
                            onChange={(e) => {
                              setAddEmail(e.target.value);
                              setAddHighlight(-1);
                              setAddOpen(true);
                            }}
                            onFocus={() => setAddOpen(true)}
                            onBlur={() => setAddOpen(false)}
                            onKeyDown={(e) => {
                              const existing = t.members.map((m) => m.email);
                              const matches = filterDirectory(directory, addEmail, existing);
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setAddOpen(true);
                                setAddHighlight((h) =>
                                  Math.min(h + 1, Math.min(matches.length, MAX_SUGGESTIONS) - 1),
                                );
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setAddHighlight((h) => Math.max(h - 1, -1));
                              } else if (e.key === "Escape") {
                                setAddOpen(false);
                                setAddHighlight(-1);
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                if (addOpen && addHighlight >= 0 && matches[addHighlight]) {
                                  addMember(t, matches[addHighlight].email);
                                } else {
                                  addMember(t);
                                }
                              }
                            }}
                            hint="Type a name to pick a registered teammate, or press Enter / tap + to add any email."
                          />
                          <AnimatePresence>
                            {addOpen ? (
                              <DirectorySuggestions
                                matches={filterDirectory(
                                  directory,
                                  addEmail,
                                  t.members.map((m) => m.email),
                                )}
                                highlighted={addHighlight}
                                onPick={(u) => addMember(t, u.email)}
                              />
                            ) : null}
                          </AnimatePresence>
                        </div>
                        <button
                          onClick={() => addMember(t)}
                          className="ring-focus grid h-12 w-12 shrink-0 place-items-center self-start rounded-xl2 bg-white/[0.06] text-cyan-glow transition hover:bg-white/[0.1]"
                          aria-label="Add teammate"
                        >
                          <UserPlus className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {t.members.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] py-1 pl-1 pr-3"
                          title={m.email}
                        >
                          <Avatar name={m.display_name || m.email} size={24} />
                          <span className="text-[12.5px] text-white/70">{m.display_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
