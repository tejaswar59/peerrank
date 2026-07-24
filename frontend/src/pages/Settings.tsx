import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Palette, Zap, UserCircle, LogOut, Moon, Sun, Sparkles } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import GlassCard from "@/components/ui/GlassCard";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { Badge, Divider, Reveal } from "@/components/ui/Bits";
import { confirmDialog } from "@/components/ui/Modal";
import { useSession } from "@/lib/useSession";
import { session } from "@/lib/session";
import { api } from "@/lib/api";
import { getReduceMotion, setReduceMotion } from "@/lib/prefs";
import { toast } from "@/components/Toast";

function Row({
  icon,
  title,
  desc,
  control,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-cyan-glow ring-1 ring-white/10">
          {icon}
        </span>
        <div>
          <p className="text-[14.5px] font-medium text-white/90">{title}</p>
          <p className="mt-0.5 text-[13px] text-white/45">{desc}</p>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export default function Settings() {
  const s = useSession();
  const navigate = useNavigate();
  const [reduce, setReduce] = useState(getReduceMotion());

  async function signOut() {
    const ok = await confirmDialog({
      title: "Sign out?",
      message: "You'll need to sign in again to access your workspace.",
      confirmText: "Sign out",
      danger: true,
    });
    if (!ok) return;
    // Release the single-device session lock server-side (best-effort — local
    // sign-out proceeds either way).
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* ignore — token may already be invalid/expired */
    }
    session.clear();
    navigate("/login", { replace: true });
  }

  return (
    <AppShell>
      <Reveal>
        <h1 className="text-[clamp(2rem,5vw,3rem)] leading-tight">Settings</h1>
        <p className="mt-2 text-[15px] text-white/50">Tune the experience to your taste.</p>
      </Reveal>

      <div className="mt-8 flex flex-col gap-5">
        <Reveal delay={0.05}>
          <GlassCard tilt={false} className="p-6 sm:p-7">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-medium uppercase tracking-wider text-white/40">
              <Palette className="h-4 w-4" /> Appearance
            </div>
            <Divider className="my-3" />
            <Row
              icon={<Moon className="h-[18px] w-[18px]" />}
              title="Theme"
              desc="Peer Rank is crafted for the dark. A light theme is on the way."
              control={
                <div className="flex items-center gap-2">
                  <Badge tone="cyan"><Moon className="h-3.5 w-3.5" /> Dark</Badge>
                  <span className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-0.5 text-[12px] text-white/30">
                    <Sun className="h-3.5 w-3.5" /> Soon
                  </span>
                </div>
              }
            />
          </GlassCard>
        </Reveal>

        <Reveal delay={0.1}>
          <GlassCard tilt={false} className="p-6 sm:p-7">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-medium uppercase tracking-wider text-white/40">
              <Zap className="h-4 w-4" /> Motion
            </div>
            <Divider className="my-3" />
            <Row
              icon={<Sparkles className="h-[18px] w-[18px]" />}
              title="Reduce motion"
              desc="Minimise animations and the 3D background for a calmer, faster UI."
              control={
                <Toggle
                  checked={reduce}
                  label="Reduce motion"
                  onChange={(v) => {
                    setReduce(v);
                    setReduceMotion(v);
                    toast(v ? "Motion reduced" : "Motion restored", "ok");
                  }}
                />
              }
            />
          </GlassCard>
        </Reveal>

        <Reveal delay={0.15}>
          <GlassCard tilt={false} className="p-6 sm:p-7">
            <div className="mb-1 flex items-center gap-2 text-[13px] font-medium uppercase tracking-wider text-white/40">
              <UserCircle className="h-4 w-4" /> Account
            </div>
            <Divider className="my-3" />
            <div className="flex flex-col gap-1 py-2">
              <div className="flex items-center justify-between py-2">
                <span className="text-[14px] text-white/55">Email</span>
                <span className="font-mono text-[13.5px] text-white/85">{s.email}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-[14px] text-white/55">Role</span>
                <Badge tone={s.role === "admin" ? "violet" : "cyan"}>{s.role}</Badge>
              </div>
            </div>
            <Divider className="my-3" />
            <div className="flex justify-end pt-1">
              <Button variant="danger" leftIcon={<LogOut className="h-[18px] w-[18px]" />} onClick={signOut}>
                Sign out
              </Button>
            </div>
          </GlassCard>
        </Reveal>
      </div>
    </AppShell>
  );
}
