const demoDomain = "brieflock-demo.example.com";

export function demoAccountEmail(username: string) {
  const normalized = username.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{2,29}$/.test(normalized)
    ? `${normalized}@${demoDomain}`
    : null;
}

export function isDemoAccountEmail(email: string) {
  return email.toLowerCase().endsWith(`@${demoDomain}`);
}

export function demoSignupEnabled() {
  return process.env.BRIEFLOCK_DEMO_SIGNUP === "true";
}
