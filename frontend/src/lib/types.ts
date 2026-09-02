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
  my_member_id: number | null;
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
  vote_count: number;
  ranking: ResultRow[];
}

export interface CurrentUser {
  authenticated: true;
  email: string;
  name: string;
  is_admin: boolean;
}

export interface RankedMember {
  rank: number;
  member_id: number;
  name: string;
}

export interface AdminVoteRecord {
  voter_email: string;
  display_name: string;
  ranked_members: RankedMember[];
}

export interface MemberInput {
  name: string;
  email: string;
}

// GET /api/polls/default-roster — the standing team roster the create-poll
// form pre-ticks. Admin-only; a failure just means an empty starting roster.
export interface DefaultRosterOut {
  members: MemberInput[];
}

// A roster row in the create-poll form: present (rendered) vs. selected
// (actually submitted). Unticking keeps the row so it can be re-ticked.
export interface RosterSelection extends MemberInput {
  selected: boolean;
}

export interface DuplicateIn {
  name: string;
  members: MemberInput[];
  duration_minutes: number;
}

// GET /api/admin/polls — the admin dashboard's poll list.
export interface PollSummary {
  id: number;
  name: string;
  status: string;
  created_at: string;
  closes_at: string;
  duration_minutes: number;
  created_by_email: string | null;
  total_members: number;
  voted_count: number;
  has_results: boolean;
}

// GET /api/admin/polls/{id} — enough to pre-fill the duplicate-poll form.
export interface PollDetail {
  id: number;
  name: string;
  status: string;
  members: MemberInput[];
}
