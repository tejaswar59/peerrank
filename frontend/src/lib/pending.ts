// Ephemeral cross-page state for the signup→verify and forgot→reset handoffs
// (mirrors the original SPA's pendingSignup / pendingReset module vars).
export const pending: { signupEmail: string | null; resetEmail: string | null } = {
  signupEmail: null,
  resetEmail: null,
};
