import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { Mail, Lock, ArrowRight } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import GoogleButton from "@/components/GoogleButton";
import { api, isDeviceConflictError } from "@/lib/api";
import type { LoginOut } from "@/lib/types";
import { useAuthRedirect } from "@/routes/guards";
import { toast } from "@/components/Toast";
import { confirmDialog } from "@/components/ui/Modal";

const schema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type Form = z.infer<typeof schema>;

export default function Login() {
  const redirect = useAuthRedirect();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function attempt(data: Form, force: boolean) {
    // Backend login takes `username` — the SPA maps the email field to it.
    const r = await api<LoginOut>("/auth/login", {
      method: "POST",
      body: { username: data.email, password: data.password, force },
    });
    redirect(r);
  }

  async function onSubmit(data: Form) {
    try {
      await attempt(data, false);
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
            await attempt(data, true);
          } catch (e2: any) {
            toast(e2?.message || "Sign in failed", "err");
          }
        }
        return; // cancelled -> no error toast, they just chose not to switch
      }
      toast(e?.message || "Sign in failed", "err");
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your Peer Rank workspace.">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          icon={<Mail className="h-[18px] w-[18px]" />}
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          icon={<Lock className="h-[18px] w-[18px]" />}
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="-mt-1 flex justify-end">
          <Link
            to="/forgot"
            className="ring-focus rounded text-[13px] font-medium text-cyan-glow/90 hover:text-cyan-glow"
          >
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          size="lg"
          block
          loading={isSubmitting}
          rightIcon={<ArrowRight className="h-[18px] w-[18px]" />}
        >
          Sign in
        </Button>
      </form>

      <div className="mt-6">
        <GoogleButton onSuccess={redirect} onError={(m) => toast(m, "err")} />
      </div>

      <p className="mt-7 text-center text-[13.5px] text-white/50">
        New to Peer Rank?{" "}
        <Link to="/signup" className="ring-focus rounded font-semibold text-white hover:text-cyan-glow">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
