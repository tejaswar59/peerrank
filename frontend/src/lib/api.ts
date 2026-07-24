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

function extractError(data: any, status: number): string {
  if (data && typeof data.detail === "string") return data.detail;
  if (data && Array.isArray(data.detail)) {
    return data.detail
      .map((d: any) => {
        const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : "";
        const msg = (d.msg || "invalid value").replace(/^value is /, "");
        return field ? `${field}: ${msg}` : msg;
      })
      .join("; ");
  }
  return `Request failed (${status})`;
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
