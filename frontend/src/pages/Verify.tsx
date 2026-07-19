import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { MailCheck, RotateCw } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { OtpInput } from "@/components/ui/OtpInput";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import type { LoginOut, MessageOut } from "@/lib/types";
import { toast } from "@/components/Toast";
import { pending } from "@/lib/pending";
import { useAuthRedirect } from "@/routes/guards";

export default function Verify() {
  const location = useLocation();
  const redirect = useAuthRedirect();
  const email = (location.state as any)?.email || pending.signupEmail;

  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(30);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!email) return <Navigate to="/signup" replace />;

  async function verify(value: string) {
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const r = await api<LoginOut>("/auth/verify", {
        method: "POST",
        body: { email, code: value },
      });
      pending.signupEmail = null;
      redirect(r);
    } catch (e: any) {
      setError(true);
      setCode("");
      toast(e?.message || "Invalid code", "err");
      setSubmitting(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    try {
      const r = await api<MessageOut>("/auth/resend", { method: "POST", body: { email } });
      toast(r.message, "ok");
      setCooldown(30);
    } catch (e: any) {
      toast(e?.message || "Could not resend", "err");
    }
  }

  return (
    <AuthLayout title="Verify your email" subtitle={`We sent a 6-digit code to ${email}.`}>
      <div className="flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="mb-7 grid h-16 w-16 place-items-center rounded-2xl bg-cyan-glow/15 text-cyan-glow"
        >
          <MailCheck className="h-8 w-8" />
        </motion.div>

        <OtpInput value={code} onChange={setCode} onComplete={verify} error={error} />

        <Button
          className="mt-7"
          size="lg"
          block
          loading={submitting}
          disabled={code.length !== 6}
          onClick={() => verify(code)}
        >
          Verify & continue
        </Button>

        <button
          onClick={resend}
          disabled={cooldown > 0}
          className="ring-focus mt-5 flex items-center gap-2 rounded-lg px-2 py-1 text-[13.5px] font-medium text-white/55 transition hover:text-cyan-glow disabled:cursor-not-allowed disabled:text-white/30"
        >
          <RotateCw className="h-4 w-4" />
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </AuthLayout>
  );
}
