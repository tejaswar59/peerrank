import { useEffect, useState } from "react";
import { cdPhrase, countdownText } from "@/lib/format";

// Live "closes in …" phrase that re-renders every second.
export function Countdown({
  end,
  phrase = true,
  onEnd,
}: {
  end?: string | null;
  phrase?: boolean;
  onEnd?: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const text = phrase ? cdPhrase(end) : countdownText(end);
  // Fire onEnd once when the countdown reaches zero.
  useEffect(() => {
    if (!onEnd || !end) return;
    const remaining = new Date(end).getTime() - Date.now();
    if (remaining > 0) {
      const t = setTimeout(onEnd, remaining + 500); // +500ms buffer for clock skew
      return () => clearTimeout(t);
    }
  }, [end, onEnd]);
  return <span className="tabnums">{text}</span>;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
