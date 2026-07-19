// Session store — same localStorage keys the original SPA used (pr_token /
// pr_role / pr_email), so an already-signed-in user stays signed in after the
// redesign ships. Exposes a tiny external store for React (useSyncExternalStore).
import type { Role } from "./types";

const K_TOKEN = "pr_token";
const K_ROLE = "pr_role";
const K_EMAIL = "pr_email";

export interface SessionState {
  token: string | null;
  role: Role | null;
  email: string | null;
}

let listeners = new Set<() => void>();

function read(): SessionState {
  return {
    token: localStorage.getItem(K_TOKEN),
    role: (localStorage.getItem(K_ROLE) as Role | null) || null,
    email: localStorage.getItem(K_EMAIL),
  };
}

let snapshot: SessionState = read();

function emit() {
  snapshot = read();
  listeners.forEach((l) => l());
}

export const session = {
  get(): SessionState {
    return snapshot;
  },
  getToken(): string | null {
    return localStorage.getItem(K_TOKEN);
  },
  set(token: string, role: string, email: string) {
    localStorage.setItem(K_TOKEN, token);
    localStorage.setItem(K_ROLE, role);
    localStorage.setItem(K_EMAIL, email);
    emit();
  },
  clear() {
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_ROLE);
    localStorage.removeItem(K_EMAIL);
    emit();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot(): SessionState {
    return snapshot;
  },
  isAuthed(): boolean {
    return !!snapshot.token;
  },
};

// Cross-tab sync.
window.addEventListener("storage", (e) => {
  if (e.key === K_TOKEN || e.key === K_ROLE || e.key === K_EMAIL) emit();
});
