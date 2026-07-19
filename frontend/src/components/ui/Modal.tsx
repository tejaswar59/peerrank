import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, HelpCircle, X } from "lucide-react";
import { Button } from "./Button";

// ---------- generic modal ----------
export function Modal({
  open,
  onClose,
  children,
  className = "",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[150] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={`glass-strong relative z-[1] w-full max-w-md rounded-xl3 p-6 ${className}`}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ---------- global confirm() ----------
interface ConfirmOpts {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}
type Pending = ConfirmOpts & { resolve: (v: boolean) => void };
let pending: Pending | null = null;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { ...opts, resolve };
    emit();
  });
}

const store = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snap: () => pending,
};

export function ConfirmHost() {
  const p = useSyncExternalStore(store.subscribe, store.snap, store.snap);
  function close(v: boolean) {
    p?.resolve(v);
    pending = null;
    emit();
  }
  return (
    <Modal open={!!p} onClose={() => close(false)}>
      {p ? (
        <div className="text-center">
          <div
            className={`mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl ${
              p.danger ? "bg-rose-500/15 text-rose-400" : "bg-cyan-glow/15 text-cyan-glow"
            }`}
          >
            {p.danger ? <AlertTriangle className="h-6 w-6" /> : <HelpCircle className="h-6 w-6" />}
          </div>
          <h3 className="text-xl">{p.title || "Are you sure?"}</h3>
          {p.message ? (
            <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-white/55">
              {p.message}
            </p>
          ) : null}
          <div className="mt-6 flex gap-3">
            <Button variant="glass" block onClick={() => close(false)}>
              {p.cancelText || "Cancel"}
            </Button>
            <Button
              variant={p.danger ? "danger" : "primary"}
              block
              onClick={() => close(true)}
            >
              {p.confirmText || "Confirm"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export { X as CloseIcon };
