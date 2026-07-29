import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Radio, Layers } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { OrbLoader, Reveal } from "@/components/ui/Bits";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { Team, Round } from "@/lib/types";
import { toast } from "@/components/Toast";
import { RoundsPanel } from "./RoundsPanel";

export default function TeamDetail() {
  const { id } = useParams();
  const teamId = Number(id);
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        api<Team>(`/teams/${teamId}`),
        api<Round[]>(`/teams/${teamId}/rounds`),
      ]);
      setTeam(t);
      setRounds(r);
      setFailed(false);
    } catch (e: any) {
      toast(e?.message || "Could not load team", "err");
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

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
        <ArrowLeft className="h-4 w-4" /> Teams
      </button>

      {loading ? (
        <OrbLoader label="Loading team…" />
      ) : failed || !team ? (
        <EmptyState
          icon={<Layers className="h-7 w-7" />}
          title="Team unavailable"
          message="We couldn't load this team. It may have been deleted."
          action={<Button variant="glass" onClick={() => navigate("/admin")}>Back to dashboard</Button>}
        />
      ) : (
        <>
          <Reveal>
            <h1 className="text-[clamp(1.9rem,4.5vw,2.8rem)] leading-tight">{team.name}</h1>
            <div className="mt-2 flex items-center gap-5 text-[14px] text-white/50">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-white/35" /> {team.members.length} members</span>
              <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-white/35" /> {rounds.length} rounds</span>
              {openRounds > 0 ? (
                <span className="flex items-center gap-1.5 text-emerald-300"><Radio className="h-4 w-4" /> {openRounds} open</span>
              ) : null}
            </div>
          </Reveal>

          <div className="mt-8">
            <RoundsPanel team={team} rounds={rounds} reload={load} />
          </div>
        </>
      )}
    </AppShell>
  );
}
