// Same rules enforced by the backend (validationMiddleware.passwordRules)
export const PASSWORD_CHECKS = [
  { id: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "A number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "A special character (@$!%*?&)", test: (p) => /[@$!%*?&]/.test(p) },
];

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];

/** score 0-4 = satisfied required rules; a 12+ character password counts as extra strength. */
export function scorePassword(password = "") {
  const checks = PASSWORD_CHECKS.map((c) => ({ ...c, passed: c.test(password) }));
  const passedCount = checks.filter((c) => c.passed).length;
  const valid = passedCount === PASSWORD_CHECKS.length;
  const score = valid ? (password.length >= 12 ? 4 : 3) : Math.min(passedCount, 2);
  return { score: password ? score : 0, label: password ? LABELS[score] : "", valid, checks };
}
