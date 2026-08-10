// Types mirror the FastAPI Pydantic schemas EXACTLY (app/schemas.py).
// Do not change field names — the backend contract is fixed.
//
// No accounts anywhere in this app: a Poll is created once (name + a fixed
// roster + a timer), and anyone with the link identifies themselves only by
// picking their own name off the roster.

export interface Member {
  id: number;
  display_name: string;
}

export interface Poll {
  id: number;
  name: string;
  vote_token: string;
  // Private — the creator's own secret. Shown once, on creation, and never
  // again by any other endpoint. Only this can fetch results; the shared
  // vote_token structurally cannot.
  admin_token: string;
  status: string; // "open" | "closed"
  duration_minutes: number;
  closes_at: string;
  created_at: string;
  members: Member[];
}

// GET /api/polls/{token}/status — powers both the creator's live count and
// the voter's "select your name" screen.
export interface RosterMemberStatus {
  id: number;
  display_name: string;
  voted: boolean;
}
export interface PollStatus {
  name: string;
  status: string;
  closes_at: string;
  seconds_remaining: number;
  total_members: number;
  voted_count: number;
  members: RosterMemberStatus[];
}

export interface Candidate {
  id: number;
  display_name: string;
}

// GET /api/polls/{token}/candidates/{member_id} — the ranking screen for one
// picked name: everyone else on the roster, self excluded.
export interface BallotPage {
  poll_name: string;
  member_id: number;
  member_name: string;
  status: string;
  closes_at: string;
  candidates: Candidate[];
}

export interface ResultRow {
  member_id: number;
  display_name: string;
  points: number;
  rank: number;
}
export interface ResultOut {
  poll_name: string;
  computed_at: string;
  ranking: ResultRow[];
}
