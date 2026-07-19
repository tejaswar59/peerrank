import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus,
  FolderKanban,
  Users,
  Radio,
  Trash2,
  ArrowUpRight,
  Layers,
  Activity,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, Skeleton, Reveal } from "@/components/ui/Bits";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal, confirmDialog } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import type { Project, Team, Round } from "@/lib/types";
import { fmtDate } from "@/lib/format";
import { toast } from "@/components/Toast";
import { listContainer, listItem } from "@/components/PageTransition";

interface Enriched extends Project {
  teams: number;
  rounds: number;
  open: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Enriched[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const projects = await api<Project[]>("/projects");
      const enriched = await Promise.all(
        projects.map(async (p) => {
          const [teams, rounds] = await Promise.all([
            api<Team[]>(`/projects/${p.id}/teams`).catch(() => [] as Team[]),
            api<Round[]>(`/projects/${p.id}/rounds`).catch(() => [] as Round[]),
          ]);
          return {
            ...p,
            teams: teams.length,
            rounds: rounds.length,
            open: rounds.filter((r) => r.status === "open").length,
          };
        }),
      );
      setItems(enriched);
    } catch (e: any) {
      toast(e?.message || "Could not load projects", "err");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createProject() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api("/projects", { method: "POST", body: { name: name.trim() } });
      toast("Project created", "ok");
      setCreating(false);
      setName("");
      setItems(null);
      load();
    } catch (e: any) {
      toast(e?.message || "Could not create", "err");
    } finally {
      setBusy(false);
    }
  }

  async function del(p: Enriched, e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: `Delete "${p.name}"?`,
      message: "Its teams and rounds will be archived. This can't be undone from here.",
      confirmText: "Delete project",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/projects/${p.id}`, { method: "DELETE" });
      toast("Project deleted", "ok");
      setItems((cur) => cur?.filter((x) => x.id !== p.id) ?? null);
    } catch (err: any) {
      toast(err?.message || "Could not delete", "err");
    }
  }

  const totals = {
    projects: items?.length ?? 0,
    teams: items?.reduce((a, p) => a + p.teams, 0) ?? 0,
    rounds: items?.reduce((a, p) => a + p.rounds, 0) ?? 0,
    open: items?.reduce((a, p) => a + p.open, 0) ?? 0,
  };

  const kpis = [
    { label: "Projects", value: totals.projects, icon: <FolderKanban className="h-5 w-5" />, tone: "text-cyan-glow" },
    { label: "Teams", value: totals.teams, icon: <Users className="h-5 w-5" />, tone: "text-emerald-300" },
    { label: "Rounds", value: totals.rounds, icon: <Layers className="h-5 w-5" />, tone: "text-violet-200" },
    { label: "Open now", value: totals.open, icon: <Radio className="h-5 w-5" />, tone: "text-[#f5d580]" },
  ];

  return (
    <AppShell>
      <Reveal className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium text-cyan-glow/80">Admin workspace</p>
          <h1 className="mt-1 text-[clamp(2rem,5vw,3rem)] leading-tight">Dashboard</h1>
        </div>
        <Button leftIcon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>
          New project
        </Button>
      </Reveal>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <Reveal key={k.label} delay={i * 0.06}>
            <GlassCard className="p-5">
              <div className="flex items-center justify-between">
                <span className={`grid h-10 w-10 place-items-center rounded-xl bg-white/[0.05] ring-1 ring-white/10 ${k.tone}`}>
                  {k.icon}
                </span>
                <Activity className="h-4 w-4 text-white/20" />
              </div>
              <div className="mt-4 text-4xl font-semibold tabnums">
                {items === null ? <Skeleton className="h-9 w-16" /> : k.value}
              </div>
              <div className="mt-1 text-[13px] text-white/45">{k.label}</div>
            </GlassCard>
          </Reveal>
        ))}
      </div>

      {/* projects */}
      <div className="mt-10">
        <h2 className="mb-5 text-lg text-white/80">Projects</h2>
        {items === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-7 w-7" />}
            title="No projects yet"
            message="Create your first project to add teams and open a voting round."
            action={
              <Button leftIcon={<Plus className="h-[18px] w-[18px]" />} onClick={() => setCreating(true)}>
                New project
              </Button>
            }
          />
        ) : (
          <motion.div variants={listContainer} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2">
            {items.map((p) => (
              <motion.div key={p.id} variants={listItem}>
                <GlassCard className="p-6" onClick={() => navigate(`/admin/project/${p.id}`)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-xl">{p.name}</h3>
                        {p.open > 0 ? <Badge tone="open" dot>{p.open} live</Badge> : null}
                      </div>
                      <p className="mt-1 text-[13px] text-white/40">Created {fmtDate(p.created_at)}</p>
                    </div>
                    <button
                      onClick={(e) => del(p, e)}
                      className="ring-focus grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/40 transition hover:bg-rose-500/15 hover:text-rose-400"
                      aria-label="Delete project"
                    >
                      <Trash2 className="h-[17px] w-[17px]" />
                    </button>
                  </div>
                  <div className="mt-5 flex items-center gap-5 text-[13px] text-white/55">
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-white/35" /> {p.teams} teams</span>
                    <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-white/35" /> {p.rounds} rounds</span>
                    <span className="ml-auto flex items-center gap-1 font-medium text-cyan-glow/80">
                      Open <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* create modal */}
      <Modal open={creating} onClose={() => setCreating(false)}>
        <h3 className="text-xl">New project</h3>
        <p className="mt-1 text-[14px] text-white/50">Name it after the cycle, team, or award.</p>
        <div className="mt-5">
          <Input
            label="Project name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createProject()}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="glass" block onClick={() => setCreating(false)}>Cancel</Button>
          <Button block loading={busy} onClick={createProject}>Create</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
