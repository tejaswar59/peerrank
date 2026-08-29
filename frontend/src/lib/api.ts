// API client — talks to the FastAPI backend on the SAME origin at /api.
// No accounts, no tokens: every request is anonymous. The only thing that
// stands in for identity is the poll's vote_token (in the URL) and, once a
// name is picked, that candidate's id (in the request body).
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
  /**
   * Extra request headers. Used for X-Admin-Token: the creator's secret travels
   * in a header rather than the URL so it never lands in an access log.
   */
  headers?: Record<string, string>;
}

// A validation loc like ["body", "member_names", 2] names the 3rd entry of a
// list field — useful for the API, meaningless to a user. Drop "body" and any
// trailing list index so they see "member_names", not "2".
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
    // De-dupe: several invalid list entries otherwise repeat the exact same
    // sentence once per entry.
    return Array.from(new Set(messages)).join(" ");
  }
  return `Something went wrong. Please try again. (${status})`;
}

export async function api<T = any>(path: string, opts: ApiOpts = {}): Promise<T> {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return null as T;

  const isJson = (res.headers.get("content-type") || "").indexOf("json") !== -1;
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(extractError(data, res.status), res.status);
  return data as T;
}
