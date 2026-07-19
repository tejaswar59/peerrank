import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { Mail, Lock, ArrowRight } from "lucide-react";
import AuthLayout from "@/components/layout/AuthLayout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import GoogleButton from "@/components/GoogleButton";
import { api } from "@/lib/api";
import type { LoginOut } from "@/lib/types";
import { useAuthRedirect } from "@/routes/guards";
import { toast } from "@/components/Toast";

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

  async function onSubmit(data: Form) {
    try {
      // Backend login takes `username` — the SPA maps the email field to it.
      const r = await api<LoginOut>("/auth/login", {
        method: "POST",
        body: { username: data.email, password: data.password },
      });
      redirect(r);
    } catch (e: any) {
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
