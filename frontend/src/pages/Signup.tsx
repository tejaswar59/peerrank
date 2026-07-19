import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Lock, ShieldCheck, Users, ArrowRight, Check } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import GoogleButton from "@/components/GoogleButton";
import { api } from "@/lib/api";
import type { MessageOut } from "@/lib/types";
import { toast } from "@/components/Toast";
import { pending } from "@/lib/pending";
import { useAuthRedirect } from "@/routes/guards";

const schema = z
  .object({
    name: z.string().trim().max(200).optional().or(z.literal("")),
    email: z.string().min(1, "Email is required").email("Enter a valid email"),
    password: z.string().min(8, "At least 8 characters"),
    confirm: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });
type Form = z.infer<typeof schema>;

// live password strength (visual only)
function strength(pw: string): { pct: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map = [
    { pct: 10, label: "", color: "#f43f5e" },
    { pct: 30, label: "Weak", color: "#f43f5e" },
    { pct: 55, label: "Fair", color: "#f59e0b" },
    { pct: 80, label: "Good", color: "#22d3ee" },
    { pct: 100, label: "Strong", color: "#10b981" },
  ];
  return map[score];
}

export default function Signup() {
  const navigate = useNavigate();
  const redirect = useAuthRedirect();
  const [role, setRole] = useState<"member" | "admin">("member");
  const roleRef = useRef(role);
  roleRef.current = role;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema), mode: "onTouched" });

  const pw = watch("password") || "";
  const st = strength(pw);

  async function onSubmit(data: Form) {
    try {
      const r = await api<MessageOut>("/auth/signup", {
        method: "POST",
        body: {
          email: data.email,
          password: data.password,
          display_name: data.name || null,
          role,
        },
      });
      pending.signupEmail = data.email;
      toast(r.message, "ok");
      navigate("/verify", { state: { email: data.email } });
    } catch (e: any) {
      toast(e?.message || "Sign up failed", "err");
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Join your team on Peer Rank.">
      <div className="mb-5">
        <p className="mb-2 text-[13px] text-white/50">I'm signing up as</p>
        <Segmented
          id="role"
          value={role}
          onChange={(v) => setRole(v)}
          options={[
            { value: "member", label: "Team member", icon: <Users className="h-4 w-4" /> },
            { value: "admin", label: "Admin", icon: <ShieldCheck className="h-4 w-4" /> },
          ]}
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input label="Full name" icon={<User className="h-[18px] w-[18px]" />} error={errors.name?.message} {...register("name")} />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          icon={<Mail className="h-[18px] w-[18px]" />}
          error={errors.email?.message}
          {...register("email")}
        />
        <div>
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            icon={<Lock className="h-[18px] w-[18px]" />}
            error={errors.password?.message}
            {...register("password")}
          />
          {pw ? (
            <div className="mt-2 flex items-center gap-2 px-1">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${st.pct}%`, background: st.color }}
                />
              </div>
              <span className="w-12 text-right text-[11px] font-medium" style={{ color: st.color }}>
                {st.label}
              </span>
            </div>
          ) : null}
        </div>
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          icon={<Check className="h-[18px] w-[18px]" />}
          error={errors.confirm?.message}
          {...register("confirm")}
        />
        <Button type="submit" size="lg" block loading={isSubmitting} rightIcon={<ArrowRight className="h-[18px] w-[18px]" />}>
          Create account
        </Button>
      </form>

      <div className="mt-6">
        {/* getRole feeds the signup toggle into the Google new-account role */}
        <GoogleButton getRole={() => roleRef.current} onSuccess={redirect} onError={(m) => toast(m, "err")} />
      </div>

      <p className="mt-7 text-center text-[13.5px] text-white/50">
        Already have an account?{" "}
        <Link to="/login" className="ring-focus rounded font-semibold text-white hover:text-cyan-glow">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
