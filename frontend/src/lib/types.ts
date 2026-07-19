// Types mirror the FastAPI Pydantic schemas EXACTLY (app/schemas.py).
// Do not change field names — the backend contract is fixed.

export type Role = "admin" | "member";

export interface LoginOut {
  token: string;
  email: string;
  role: Role;
}
export interface MeOut {
  email: string;
  role: Role;
}
export interface MessageOut {
  message: string;
}
export interface AuthConfig {
  google_client_id: string;
}

export interface Project {
  id: number;
  name: string;
  created_at: string;
}

export interface Member {
  id: number;
  email: string;
  display_name: string;
}
export interface Team {
  id: number;
  name: string;
  members: Member[];
}

export interface Round {
  id: number;
  project_id: number;
  team_id: number;
  name: string;
  vote_token: string;
  start_at: string;
  end_at: string;
  status: string; // "open" | "closed"
}

export interface ParticipationRow {
  email: string;
  voted: boolean;
}
export interface Participation {
  round_id: number;
  total: number;
  submitted: number;
  pending: number;
  completion_pct: number;
  rows: ParticipationRow[];
}

export interface Candidate {
  id: number;
  display_name: string;
  email: string;
}
export interface VotePage {
  round_id: number;
  round_name: string;
  team_name: string;
  signed_in_as: string;
  end_at: string;
  status: string;
  already_voted: boolean;
  candidates: Candidate[];
}

export interface ResultRow {
  member_id: number;
  display_name: string;
  points: number;
  rank: number;
}
export interface ResultOut {
  round_id: number;
  computed_at: string;
  ranking: ResultRow[];
}
