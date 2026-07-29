// API client — talks to the FastAPI backend on the SAME origin at /api.
// Behaviour mirrors the original SPA's api() helper exactly:
//  - Bearer token attached when present
//  - a 401 on a NON-auth request while a token is set == session expired
//    (clear + redirect); on /auth/* a 401 is just bad credentials.
import { session } from "./session";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export interface ApiOpts {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

/** True for the specific "signed in on another device" 409 the backend
 * returns from /login, /verify, /google, /reset when a different session is
 * already active for that email (see app/auth.py::start_or_replace_session).
 * The caller should offer to retry the same request with `force: true`. */
export function isDeviceConflictError(err: unknown): err is ApiError {
  return err instanceof ApiError && err.status === 409 && /another device/i.test(err.message);
}

// A validation loc like ["body", "emails", 2] names the 3rd entry of a list
// field — useful for the API, meaningless to a user. Drop "body" and any
// trailing list index so they see "emails", not "2".
function humanizeLoc(loc: unknown[]): string {
  const parts = loc.filter((p) => p !== "body");
  if (parts.length && typeof parts[parts.length - 1] === "number") parts.pop();
  return parts.join(".");
}

function extractError(data: any, status: number): string {
  if (data && typeof data.detail === "string") return data.detail;
  if (data && Array.isArray(data.detail)) {
    const messages = data.detail.map((d: any) => {
      const field = Array.isArray(d.loc) ? humanizeLoc(d.loc) : "";
      const msg = (d.msg || "Invalid value")
        .replace(/^Value error,\s*/i, "")
        .replace(/^value is\s*/i, "");
      return field ? `${field}: ${msg}` : msg;
    });
    // De-dupe: several invalid list entries (e.g. 3 bad emails) otherwise
    // repeat the exact same sentence once per entry.
    return Array.from(new Set(messages)).join(" ");
  }
  return `Something went wrong. Please try again. (${status})`;
}

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = session.getToken();
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const isAuthEndpoint = path.indexOf("/auth/") === 0;
  if (res.status === 401 && token && !isAuthEndpoint) {
    // Read the real reason (e.g. "signed out — signed in on another
    // device") instead of discarding it, so the user learns why —  not just
    // a generic "session expired".
    let detail = "Your session has ended. Please sign in again to continue.";
    try {
      const body = await res.clone().json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON body — keep the generic message */
    }
    session.clear();
    window.dispatchEvent(new CustomEvent("pr:session-expired", { detail }));
    throw new ApiError("unauthorized", 401);
  }

  if (res.status === 204) return null as T;

  const isJson = (res.headers.get("content-type") || "").indexOf("json") !== -1;
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(extractError(data, res.status), res.status);
  return data as T;
}
