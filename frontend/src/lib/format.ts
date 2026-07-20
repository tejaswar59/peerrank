// Date / countdown helpers. The backend sends naive-UTC ISO strings (no tz),
// so we append "Z" before parsing — matching the original SPA.

export function parseUTC(s?: string | null): Date | null {
  if (!s) return null;
  let v = s;
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(v)) v = v + "Z";
  return new Date(v);
}

export function fmtDateTime(s?: string | null): string {
  const d = parseUTC(s);
  return d
    ? d.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}

export function fmtDate(s?: string | null): string {
  const d = parseUTC(s);
  return d ? d.toLocaleString([], { month: "short", day: "numeric", year: "numeric" }) : "";
}

export function countdownText(endStr?: string | null): string {
  const end = parseUTC(endStr);
  if (!end) return "";
  const s = Math.floor((end.getTime() - Date.now()) / 1000);
  if (s <= 0) return "closed";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function cdPhrase(endStr?: string | null): string {
  const t = countdownText(endStr);
  return t === "closed" ? "closing…" : "closes in " + t;
}

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th" …
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function voteLink(token: string): string {
  return location.origin + "/app/#/vote/" + token;
}

export function initials(nameOrEmail: string): string {
  const base = (nameOrEmail || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deterministic gradient per identity, for avatars.
export function avatarGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 60 + (h % 120)) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 65% 45%))`;
}
