import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wordmark } from "@/components/Brand";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Bits";
import { PollForm } from "@/components/PollForm";
import { PollLiveView } from "@/components/PollLiveView";
import { PollCard } from "@/pages/Dashboard";
import { api, ApiError } from "@/lib/api";
import type { Poll, PollSummary } from "@/lib/types";
import { toast } from "@/components/Toast";
import { useAuth } from "@/contexts/AuthContext";

const POST_LOGIN_REDIRECT_KEY = "postLoginRedirect";

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  const first = name?.split(" ")[0] ?? name;
  return `Good ${part}, ${first}.`;
}

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b border-[#D2D2D7] bg-white px-4">
      <button
        onClick={() => navigate("/")}
        className="ring-focus rounded-lg"
        aria-label="Peerrank home"
      >
        <Wordmark />
      </button>
      <div className="ml-auto flex items-center gap-3">
        {user && (
          <>
            {user.is_admin && (
              <button
                onClick={() => navigate("/dashboard")}
                className="ring-focus hidden rounded-md text-[14px] text-[#6E6E73] hover:text-[#1D1D1F] transition-colors sm:block"
              >
                Dashboard
              </button>
            )}
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F5F5F7] border border-[#D2D2D7] text-[12px] font-semibold text-[#1D1D1F]"
              title={user.name}
            >
              {user.name
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((p) => p[0])
                .join("")
                .toUpperCase()}
            </span>
            <button
              onClick={() => logout().then(() => navigate("/login"))}
              className="ring-focus rounded-md text-[14px] text-[#6E6E73] hover:text-[#1D1D1F] transition-colors"
              aria-label="Sign out"
            >
              <span className="hidden sm:inline">Sign out</span>
              <span className="sm:hidden">↩</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function CodeEntry() {
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const navigate = useNavigate();

  function go() {
    const trimmed = code.trim().toLowerCase();
    if (trimmed.length === 6) {
      navigate(`/r/${trimmed}`);
    } else {
      setCodeError("Please enter a valid 6-character code.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.trim().toUpperCase());
            setCodeError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          maxLength={6}
          placeholder="XXXXXX"
          className="ring-focus w-full rounded-lg border border-[#D2D2D7] bg-[#F5F5F7] px-4 py-3 font-mono text-[22px] font-bold tracking-[0.25em] text-[#1D1D1F] outline-none transition focus:border-2 focus:border-[#0071E3] focus:bg-white placeholder:text-[#AEAEB2] uppercase"
        />
        {codeError && (
          <p className="mt-1 text-[14px] text-[#FF3B30]">{codeError}</p>
        )}
      </div>
      <Button
        disabled={code.trim().length !== 6}
        onClick={go}
        block
      >
        Go →
      </Button>
      <p className="text-center text-[12px] text-[#AEAEB2]">or paste a link</p>
    </div>
  );
}

function MyPolls({ onDuplicated }: { onDuplicated: (p: Poll) => void }) {
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  function fetchPolls() {
    setLoadError(false);
    api<PollSummary[]>("/polls/mine")
      .then((data) => { setPolls(data); setLoadError(false); })
      .catch((e) => {
        toast(e instanceof ApiError ? e.message : "Could not load your polls", "err");
        setLoadError(true);
      });
  }

  useEffect(() => { fetchPolls(); }, []);

  if (loadError) {
    return (
      <div className="mt-10">
        <h2 className="mb-3 text-[22px] font-semibold text-[#1D1D1F]">Your polls</h2>
        <p className="text-[14px] text-[#6E6E73]">
          Couldn't load your polls.{" "}
          <button onClick={fetchPolls} className="underline hover:text-[#1D1D1F]">Retry</button>
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (polls === null) {
    return (
      <div className="mt-10">
        <Skeleton className="mb-4 h-7 w-32" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (polls.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-4 text-[22px] font-semibold text-[#1D1D1F]">Your polls</h2>
      <div className="flex flex-col gap-4">
        {polls.map((p) => (
          <PollCard key={p.id} poll={p} onDuplicated={onDuplicated} />
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [poll, setPoll] = useState<Poll | null>(null);

  // A visitor who hit a direct poll link while logged out gets bounced to
  // /login (ProtectedRoute stashes the intended path first); once they're
  // back here authenticated, send them on to where they actually meant to go
  // instead of leaving them stuck on the generic code-entry screen.
  useEffect(() => {
    if (!user) return;
    const saved = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    if (saved && saved !== "/") navigate(saved, { replace: true });
  }, [user, navigate]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-10">
        {user && (
          <h1 className="mb-8 text-[34px] font-bold text-[#1D1D1F]">
            {greeting(user.name)}
          </h1>
        )}

        {poll ? (
          <PollLiveView poll={poll} onReset={() => setPoll(null)} />
        ) : (
          <div className={`grid gap-4 ${user?.is_admin ? "sm:grid-cols-2" : "max-w-[480px]"}`}>
            {/* Card 1: Enter a code */}
            <div className="rounded-2xl border border-[#D2D2D7] bg-white p-6 shadow-card">
              <h2 className="mb-1 text-[19px] font-semibold text-[#1D1D1F]">Enter a code</h2>
              <p className="mb-4 text-[14px] text-[#6E6E73]">
                Join an existing ranking with a 6-character code.
              </p>
              <CodeEntry />
            </div>

            {/* Card 2: Create a ranking (admin only) */}
            {user?.is_admin && (
              <div className="rounded-2xl border border-[#D2D2D7] bg-white p-6 shadow-card">
                <h2 className="mb-1 text-[19px] font-semibold text-[#1D1D1F]">Create a ranking</h2>
                <p className="mb-4 text-[14px] text-[#6E6E73]">
                  Set up a new poll for your team.
                </p>
                <PollForm endpoint="/polls" onCreated={setPoll} />
              </div>
            )}
          </div>
        )}

        {!poll && user?.is_admin && (
          <MyPolls onDuplicated={setPoll} />
        )}

        <p className="mt-8 text-center text-[12px] text-[#AEAEB2]">
          Rankings are never stored with a name attached — only who voted, never what they voted, is ever recorded.
        </p>
      </main>
    </div>
  );
}
