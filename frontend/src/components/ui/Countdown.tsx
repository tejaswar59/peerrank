import { useEffect, useState } from "react";
import { cdPhrase, countdownText } from "@/lib/format";

// Live "closes in …" phrase that re-renders every second.
export function Countdown({ end, phrase = true }: { end?: string | null; phrase?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const text = phrase ? cdPhrase(end) : countdownText(end);
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
