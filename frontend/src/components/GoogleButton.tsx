import { useEffect, useRef, useState } from "react";
import { api, isDeviceConflictError } from "@/lib/api";
import type { AuthConfig, LoginOut } from "@/lib/types";
import { Spinner } from "./ui/Bits";
import { confirmDialog } from "./ui/Modal";

declare global {
  interface Window {
    google?: any;
  }
}

// Module-level cache so we only hit /auth/config and load the GIS script once.
let cachedClientId: string | null = null;

function loadGis(): Promise<void> {
  return new Promise((resolve) => {
    if (window.google?.accounts?.id) return resolve();
    let s = document.getElementById("gis-script") as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement("script");
      s.id = "gis-script";
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", () => resolve());
    if (window.google?.accounts?.id) resolve();
  });
}

// Renders Google's official button (only when the backend has a client id).
// `getRole` supplies the signup-toggle role for NEW accounts.
export default function GoogleButton({
  getRole,
  onSuccess,
  onError,
}: {
  getRole?: () => string | null;
  onSuccess: (r: LoginOut) => void;
  onError?: (msg: string) => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "disabled">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let clientId = cachedClientId;
        if (clientId === null) {
          const cfg = await api<AuthConfig>("/auth/config");
          clientId = cfg.google_client_id || "";
          cachedClientId = clientId;
        }
        if (!clientId) {
          if (!cancelled) setState("disabled");
          return;
        }
        await loadGis();
        if (cancelled || !holder.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp: { credential: string }) => {
            const role = getRole?.() ?? null;
            const attempt = (force: boolean) =>
              api<LoginOut>("/auth/google", {
                method: "POST",
                body: { credential: resp.credential, role, force },
              });
            try {
              onSuccess(await attempt(false));
            } catch (e: any) {
              if (isDeviceConflictError(e)) {
                const ok = await confirmDialog({
                  title: "Already signed in elsewhere",
                  message: `${e.message} Sign in here and sign out there?`,
                  confirmText: "Sign in here",
                  cancelText: "Cancel",
                  danger: true,
                });
                if (ok) {
                  try {
                    onSuccess(await attempt(true));
                  } catch (e2: any) {
                    onError?.(e2?.message || "Google sign-in failed");
                  }
                }
                return;
              }
              onError?.(e?.message || "Google sign-in failed");
            }
          },
        });
        holder.current.innerHTML = "";
        window.google.accounts.id.renderButton(holder.current, {
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: 320,
          logo_alignment: "center",
        });
        setState("ready");
      } catch {
        if (!cancelled) setState("disabled");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "disabled") return null;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex w-full items-center gap-3 text-[12px] uppercase tracking-wider text-white/30">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="relative grid min-h-[44px] place-items-center">
        {state === "loading" ? <Spinner /> : null}
        {/* Google injects its iframe button here; rounded to match the theme. */}
        <div ref={holder} className="overflow-hidden rounded-full [color-scheme:light]" />
      </div>
    </div>
  );
}
