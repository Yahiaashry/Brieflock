import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  IP_HASH_SALT: z.string().min(16),
  CRON_SECRET: z.string().min(16),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(60).default(60),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    IP_HASH_SALT: process.env.IP_HASH_SALT,
    CRON_SECRET: process.env.CRON_SECRET,
    SIGNED_URL_TTL_SECONDS: process.env.SIGNED_URL_TTL_SECONDS,
  });

  if (!parsed.success) {
    const names = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(`Invalid server environment: ${names}`);
  }

  cached = parsed.data;
  return cached;
}

export function resetEnvCacheForTests() {
  cached = null;
}
