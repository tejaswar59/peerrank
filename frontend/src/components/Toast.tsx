import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

export type ToastKind = "ok" | "err" | "info";
export interface ToastItem {
  id: number;
  msg: string;
  kind: ToastKind;
}

let items: ToastItem[] = [];
let seq = 1;
const listeners = new Set<() => void>();
function emit() {
  items = items.slice();
  listeners.forEach((l) => l());
}

export function toast(msg: string, kind: ToastKind = "info", ttl = 3600) {
  const id = seq++;
  items = [...items, { id, msg, kind }];
  emit();
  window.setTimeout(() => dismiss(id), ttl);
  return id;
}
export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const store = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snap: () => items,
};

const ICONS = {
  ok: <CheckCircle2 className="h-5 w-5 text-[#34C759]" />,
  err: <XCircle className="h-5 w-5 text-[#FF3B30]" />,
  info: <Info className="h-5 w-5 text-[#0071E3]" />,
};

export function ToastViewport() {
  const list = useSyncExternalStore(store.subscribe, store.snap, store.snap);
  return (
    <div className="pointer-events-none fixed right-4 top-[72px] z-[200] flex w-[min(92vw,400px)] flex-col gap-3">
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-[#D2D2D7] bg-white px-4 py-3.5 shadow-lift"
            role="status"
            data-kind={t.kind}
          >
            <div className="mt-0.5 shrink-0">{ICONS[t.kind]}</div>
            <p className="flex-1 text-[14px] font-medium leading-snug text-[#1D1D1F]">{t.msg}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="ring-focus -mr-1 mt-0.5 shrink-0 rounded-md p-0.5 text-[#AEAEB2] transition hover:text-[#6E6E73]"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
