import { useSyncExternalStore } from "react";
import { session, type SessionState } from "./session";

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
}
