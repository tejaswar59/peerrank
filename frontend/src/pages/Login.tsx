import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Wordmark } from "@/components/Brand";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_denied: "Sign-in was cancelled or denied.",
  domain_not_allowed: "Only @arcitech.ai accounts are allowed.",
  unverified_email: "Your Google email is not verified.",
  oauth_not_configured: "Google OAuth is not configured. Add GOOGLE_CLIENT_SECRET to .env",
};

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const errorKey = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("error") ?? "";
  const errorMsg = ERROR_MESSAGES[errorKey] ?? "";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-[#D2D2D7] bg-white p-10 shadow-card">
        <div className="mb-6">
          <Wordmark />
        </div>

        <h1 className="text-[34px] font-bold leading-[1.15] text-[#1D1D1F]">
          Rank your team.
          <br />
          Honestly.
        </h1>

        <div className="my-6 h-px bg-[#D2D2D7]" />

        <p className="mb-6 text-[14px] text-[#6E6E73]">
          Sign in with your @arcitech.ai Google account to continue.
        </p>

        {errorMsg && (
          <p className="mb-4 text-[14px] text-[#FF3B30]">{errorMsg}</p>
        )}

        <button
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#D2D2D7] bg-white px-5 py-3 text-[15px] font-medium text-[#1D1D1F] transition-colors hover:bg-[#F5F5F7]"
          onClick={() => {
            window.location.href = "/auth/google";
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.616z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>
      </div>

      <p className="mt-6 text-center text-[12px] text-[#AEAEB2]">
        If you don't have an @arcitech.ai account, contact your administrator.
      </p>
    </div>
  );
}
