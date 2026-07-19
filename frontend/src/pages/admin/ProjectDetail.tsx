import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Users, Radio, Layers } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Segmented } from "@/components/ui/Segmented";
import { OrbLoader, Reveal } from "@/components/ui/Bits";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Project, Team, Round } from "@/lib/types";
import { toast } from "@/components/Toast";
import { TeamsPanel } from "./TeamsPanel";
import { RoundsPanel } from "./RoundsPanel";

export default function ProjectDetail() {
  const { id } = useParams();
  const projectId = Number(id);
  const navigate = useNavigate();
  const [tab, setTab] = useState<"teams" | "rounds">("teams");
  const [project, setProject] = useState<Project | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, t, r] = await Promise.all([
        api<Project>(`/projects/${projectId}`),
        api<Team[]>(`/projects/${projectId}/teams`),
        api<Round[]>(`/projects/${projectId}/rounds`),
      ]);
      setProject(p);
      setTeams(t);
      setRounds(r);
      setFailed(false);
    } catch (e: any) {
      toast(e?.message || "Could not load project", "err");
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const openRounds = rounds.filter((r) => r.status === "open").length;

  return (
    <AppShell>
      <button
        onClick={() => navigate("/admin")}
        className="ring-focus mb-5 flex items-center gap-1.5 rounded-lg text-[13.5px] text-white/50 transition hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </button>

      {loading ? (
        <OrbLoader label="Loading project…" />
      ) : failed || !project ? (
        <EmptyState
          icon={<Layers className="h-7 w-7" />}
          title="Project unavailable"
          message="We couldn't load this project. It may have been deleted."
          action={<Button variant="glass" onClick={() => navigate("/admin")}>Back to dashboard</Button>}
        />
      ) : (
        <>
          <Reveal>
            <h1 className="text-[clamp(1.9rem,4.5vw,2.8rem)] leading-tight">{project.name}</h1>
            <div className="mt-2 flex items-center gap-5 text-[14px] text-white/50">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-white/35" /> {teams.length} teams</span>
              <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-white/35" /> {rounds.length} rounds</span>
              {openRounds > 0 ? (
                <span className="flex items-center gap-1.5 text-emerald-300"><Radio className="h-4 w-4" /> {openRounds} open</span>
              ) : null}
            </div>
          </Reveal>

          <div className="mx-auto mt-7 max-w-md">
            <Segmented
              id="ptab"
              value={tab}
              onChange={setTab}
              options={[
                { value: "teams", label: "Teams", icon: <Users className="h-4 w-4" /> },
                { value: "rounds", label: "Rounds & results", icon: <Radio className="h-4 w-4" /> },
              ]}
            />
          </div>

          <div className="mt-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                {tab === "teams" ? (
                  <TeamsPanel projectId={projectId} teams={teams} reload={load} />
                ) : (
                  <RoundsPanel projectId={projectId} teams={teams} rounds={rounds} reload={load} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </>
      )}
    </AppShell>
  );
}
