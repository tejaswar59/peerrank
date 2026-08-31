import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { Navbar } from "@/pages/Landing";
import { Button } from "@/components/ui/Button";
import { PollForm } from "@/components/PollForm";
import { PollLiveView } from "@/components/PollLiveView";
import { Leaderboard } from "@/components/Leaderboard";
import { api, ApiError } from "@/lib/api";
import { Badge, Skeleton } from "@/components/ui/Bits";
import type { Poll, PollDetail, PollSummary, ResultOut } from "@/lib/types";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";

function StatusBadge({ status }: { status: string }) {
  const closed = status === "closed";
  return (
    <Badge tone={closed ? "closed" : "open"} dot={!closed}>
      {closed ? "Closed" : "Live"}
    </Badge>
  );
}

function ResultsPanel({ pollId }: { pollId: number }) {
  const [results, setResults] = useState<ResultOut | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<ResultOut>(`/admin/polls/${pollId}/results`)
      .then(setResults)
      .catch(() => toast("Could not load results", "err"))
      .finally(() => setLoading(false));
  }, [pollId]);

  if (loading) return <p className="py-6 text-center text-[13px] text-[#6E6E73]">Loading…</p>;
  if (!results) return null;
  return <Leaderboard data={results} />;
}

function DuplicatePanel({
  poll,
  onCreated,
  onCancel,
}: {
  poll: PollSummary;
  onCreated: (p: Poll) => void;
  onCancel: () => void;
}) {
  const [detail, setDetail] = useState<PollDetail | null>(null);

  useEffect(() => {
    api<PollDetail>(`/admin/polls/${poll.id}`)
      .then(setDetail)
      .catch((e) => toast(e instanceof ApiError ? e.message : "Could not load poll", "err"));
  }, [poll.id]);

  if (!detail) return <p className="py-6 text-center text-[13px] text-[#6E6E73]">Loading roster…</p>;

  return (
    <div>
      <PollForm
        endpoint={`/admin/polls/${poll.id}/duplicate`}
        initialName={`${detail.name} (copy)`}
        initialMembers={detail.members}
        readonlyRoster
        submitLabel="Duplicate & go live"
        onCreated={onCreated}
      />
      <Button variant="ghost" block className="mt-3" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

export function PollCard({ poll, onDuplicated }: { poll: PollSummary; onDuplicated: (p: Poll) => void }) {
  const [expanded, setExpanded] = useState<"results" | "duplicate" | null>(null);

  return (
    <div className="rounded-2xl border border-[#D2D2D7] bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge status={poll.status} />
            <span className="text-[12px] text-[#AEAEB2]">{fmtDateTime(poll.created_at)}</span>
          </div>
          <h3 className="text-[17px] font-semibold text-[#1D1D1F]">{poll.name}</h3>
          <p className="mt-0.5 text-[13px] text-[#6E6E73]">
            {poll.voted_count} / {poll.total_members} responded
            {poll.created_by_email ? ` · by ${poll.created_by_email}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {poll.has_results && (
            <Button
              size="sm"
              variant="glass"
              leftIcon={<Trophy className="h-3.5 w-3.5" />}
              rightIcon={expanded === "results" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              onClick={() => setExpanded(expanded === "results" ? null : "results")}
            >
              Results
            </Button>
          )}
          <Button
            size="sm"
            variant="glass"
            leftIcon={<Copy className="h-3.5 w-3.5" />}
            rightIcon={expanded === "duplicate" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            onClick={() => setExpanded(expanded === "duplicate" ? null : "duplicate")}
          >
            Duplicate
          </Button>
        </div>
      </div>

      {expanded === "results" && (
        <div className="mt-5 border-t border-[#D2D2D7] pt-5">
          <ResultsPanel pollId={poll.id} />
        </div>
      )}
      {expanded === "duplicate" && (
        <div className="mt-5 border-t border-[#D2D2D7] pt-5">
          <DuplicatePanel poll={poll} onCreated={onDuplicated} onCancel={() => setExpanded(null)} />
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [justCreated, setJustCreated] = useState<Poll | null>(null);

  useEffect(() => {
    if (!authLoading && user && !user.is_admin) navigate("/", { replace: true });
  }, [authLoading, user, navigate]);

  function refresh() {
    api<PollSummary[]>("/admin/polls")
      .then(setPolls)
      .catch((e) => toast(e instanceof ApiError ? e.message : "Could not load polls", "err"));
  }

  useEffect(() => {
    if (user?.is_admin) refresh();
  }, [user?.is_admin]);

  if (!user?.is_admin) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-10">
        <h1 className="mb-8 text-[34px] font-bold text-[#1D1D1F]">Your polls</h1>

        {justCreated ? (
          <PollLiveView
            poll={justCreated}
            onReset={() => {
              setJustCreated(null);
              refresh();
            }}
          />
        ) : polls === null ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : polls.length === 0 ? (
          <p className="text-center text-[13px] text-[#6E6E73]">No polls yet — create one from the home page.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {polls.map((p) => (
              <PollCard key={p.id} poll={p} onDuplicated={setJustCreated} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
