// Remembers the polls THIS browser created, so a refresh does not lose them.
//
// admin_token is returned exactly once, by POST /api/polls, and it is the only
// thing that can ever reach a poll's results. Keeping it solely in React state
// meant one refresh — or a browser tab restore — made that poll's leaderboard
// permanently unreachable by anybody, even though it was computed and frozen in
// the database. This module is the fix.
//
// Scope of the secret: localStorage is per-origin and per-browser, i.e. exactly
// the creator's own device, which is the same trust boundary as the page that
// received the token in the first place. `forget()` exists so a shared computer
// can be cleared deliberately.
import type { Poll } from "./types";

const KEY = "pr_my_polls";
const MAX_REMEMBERED = 20;

export interface RememberedPoll {
  poll: Poll;
  savedAt: number;
}

function read(): RememberedPoll[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerate anything malformed rather than throwing on every page load.
    return parsed.filter(
      (r: any) => r && r.poll && r.poll.vote_token && r.poll.admin_token,
    );
  } catch {
    return [];
  }
}

function write(rows: RememberedPoll[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(0, MAX_REMEMBERED)));
  } catch {
    /* private mode or quota exceeded — the app must still work */
  }
}

export function remember(poll: Poll) {
  const rows = read().filter((r) => r.poll.vote_token !== poll.vote_token);
  rows.unshift({ poll, savedAt: Date.now() });
  write(rows);
}

/** Most recently created first. */
export function list(): RememberedPoll[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function mostRecent(): Poll | null {
  const rows = list();
  return rows.length ? rows[0].poll : null;
}

export function forget(voteToken: string) {
  write(read().filter((r) => r.poll.vote_token !== voteToken));
}

export function forgetAll() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
