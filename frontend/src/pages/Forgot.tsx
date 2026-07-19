import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Mail, Lock, KeyRound, ArrowLeft, ArrowRight, Check } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/ui/OtpInput";
import { api } from "@/lib/api";
import type { LoginOut, MessageOut } from "@/lib/types";
import { toast } from "@/components/Toast";
import { pending } from "@/lib/pending";
import { isEmail } from "@/lib/format";
import { useAuthRedirect } from "@/routes/guards";

type Step = "email" | "code" | "password";
const slide = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

export default function Forgot() {
  const redirect = useAuthRedirect();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(pending.resetEmail || "");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [codeErr, setCodeErr] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    if (!isEmail(email)) return toast("Enter a valid email", "err");
    setBusy(true);
    try {
      const r = await api<MessageOut>("/auth/forgot", { method: "POST", body: { email } });
      pending.resetEmail = email;
      toast(r.message, "ok");
      setStep("code");
      setCooldown(30);
    } catch (e: any) {
      // Backend reveals unknown emails (404) with a friendly "please sign up".
      toast(e?.message || "Could not send code", "err");
    } finally {
      setBusy(false);
    }
  }

  async function checkCode(value: string) {
    if (busy) return;
    setBusy(true);
    setCodeErr(false);
    try {
      await api("/auth/reset/check", { method: "POST", body: { email, code: value } });
      setStep("password"); // code good -> ask for the new password
    } catch (e: any) {
      setCodeErr(true);
      setCode("");
      toast(e?.message || "Invalid or expired code", "err");
    } finally {
      setBusy(false);
    }
  }

  async function setPassword() {
    if (pw.length < 8) return toast("Password must be at least 8 characters", "err");
    if (pw !== pw2) return toast("Passwords don't match", "err");
    setBusy(true);
    try {
      const r = await api<LoginOut>("/auth/reset", {
        method: "POST",
        body: { email, code, new_password: pw },
      });
      pending.resetEmail = null;
      toast("Password updated", "ok");
      redirect(r);
    } catch (e: any) {
      toast(e?.message || "Could not reset password", "err");
      if (e?.status === 400) {
        setStep("code"); // code expired between steps -> restart at code
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Step, { t: string; s: string }> = {
    email: { t: "Reset password", s: "Enter your email and we'll send a reset code." },
    code: { t: "Enter the code", s: `We sent a 6-digit code to ${email}.` },
    password: { t: "Set a new password", s: "Choose a strong password you'll remember." },
  };

  return (
    <AuthLayout title={titles[step].t} subtitle={titles[step].s}>
      {/* step indicator */}
      <div className="mb-6 flex items-center gap-2">
        {(["email", "code", "password"] as Step[]).map((s, i) => {
          const idx = ["email", "code", "password"].indexOf(step);
          const done = i < idx;
          const active = i === idx;
          return (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div
                className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-semibold transition-all ${
                  active
                    ? "bg-cyan-glow text-ink-950"
                    : done
                      ? "bg-emerald-glow/30 text-emerald-200"
                      : "bg-white/8 text-white/40"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              {i < 2 ? (
                <div className={`h-px flex-1 ${i < idx ? "bg-emerald-glow/40" : "bg-white/10"}`} />
              ) : null}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {step === "email" ? (
          <motion.div key="email" {...slide} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              icon={<Mail className="h-[18px] w-[18px]" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
            />
            <Button size="lg" block loading={busy} onClick={sendCode} rightIcon={<ArrowRight className="h-[18px] w-[18px]" />}>
              Send reset code
            </Button>
          </motion.div>
        ) : step === "code" ? (
          <motion.div key="code" {...slide} className="flex flex-col items-center gap-6">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-glow/15 text-cyan-glow">
              <KeyRound className="h-7 w-7" />
            </div>
            <OtpInput value={code} onChange={setCode} onComplete={checkCode} error={codeErr} />
            <Button size="lg" block loading={busy} disabled={code.length !== 6} onClick={() => checkCode(code)}>
              Verify code
            </Button>
            <button
              onClick={() => cooldown === 0 && sendCode()}
              disabled={cooldown > 0}
              className="ring-focus rounded text-[13px] font-medium text-white/50 hover:text-cyan-glow disabled:text-white/30"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </motion.div>
        ) : (
          <motion.div key="password" {...slide} className="flex flex-col gap-4">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              icon={<Lock className="h-[18px] w-[18px]" />}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              icon={<Check className="h-[18px] w-[18px]" />}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setPassword()}
            />
            <Button size="lg" block loading={busy} onClick={setPassword}>
              Update password & sign in
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <Link
        to="/login"
        className="ring-focus mt-7 flex items-center justify-center gap-1.5 rounded text-[13px] font-medium text-white/50 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
    </AuthLayout>
  );
}
