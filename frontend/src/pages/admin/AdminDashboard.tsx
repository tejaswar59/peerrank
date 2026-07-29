import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Radio, Layers, Activity } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import { Skeleton, Reveal } from "@/components/ui/Bits";
import { api } from "@/lib/api";
import type { Team, Round } from "@/lib/types";
import { toast } from "@/components/Toast";
import { TeamsPanel } from "./TeamsPanel";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<Team[] | null>(null);
  // team_id -> open round count. null while that team's rounds are still
  // loading in the background — kept separate from `teams` so the team list
  // (and its create/edit UI) renders instantly without waiting on N round
  // fetches.
  const [openCounts, setOpenCounts] = useState<Record<number, number | null>>({});
  const [roundTotal, setRoundTotal] = useState<Record<number, number | null>>({});

  const load = useCallback(async () => {
    try {
      const list = await api<Team[]>("/teams");
      setTeams(list);
      setOpenCounts(Object.fromEntries(list.map((t) => [t.id, null])));
      setRoundTotal(Object.fromEntries(list.map((t) => [t.id, null])));

      list.forEach((t) => {
        api<Round[]>(`/teams/${t.id}/rounds`)
          .catch(() => [] as Round[])
          .then((rounds) => {
            setOpenCounts((cur) => ({ ...cur, [t.id]: rounds.filter((r) => r.status === "open").length }));
            setRoundTotal((cur) => ({ ...cur, [t.id]: rounds.length }));
          });
      });
    } catch (e: any) {
      toast(e?.message || "Could not load teams", "err");
      setTeams([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadingCounts = teams === null || Object.values(roundTotal).some((v) => v === null);
  const totals = {
    teams: teams?.length ?? 0,
    rounds: Object.values(roundTotal).reduce((a: number, v) => a + (v ?? 0), 0),
    open: Object.values(openCounts).reduce((a: number, v) => a + (v ?? 0), 0),
  };

  const kpis = [
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
      </Reveal>

      {/* KPIs */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                {loadingCounts && k.label !== "Teams" ? <Skeleton className="h-9 w-16" /> : k.value}
              </div>
              <div className="mt-1 text-[13px] text-white/45">{k.label}</div>
            </GlassCard>
          </Reveal>
        ))}
      </div>

      <div className="mt-10">
        {teams === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <TeamsPanel
            teams={teams}
            reload={load}
            onOpenRounds={(teamId) => navigate(`/admin/team/${teamId}`)}
          />
        )}
      </div>
    </AppShell>
  );
}
