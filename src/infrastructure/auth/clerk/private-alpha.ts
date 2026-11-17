type PrivateAlphaPolicy = { origin: string; host: string; allowedUsers: ReadonlySet<string> };
export class PrivateAlphaConfigurationError extends Error {}

export function privateAlphaPolicy(env: NodeJS.ProcessEnv = process.env): PrivateAlphaPolicy | null {
  const production = env.NODE_ENV === "production";
  if (!production && !env.PRIVATE_ALPHA_ORIGIN?.trim() && !env.PRIVATE_ALPHA_USER_IDS?.trim()) return null;
  if (production && env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    throw new PrivateAlphaConfigurationError("Private Alpha is unavailable on preview deployments.");
  }

  if (production && (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_live_") || !env.CLERK_SECRET_KEY?.startsWith("sk_live_"))) {
    throw new PrivateAlphaConfigurationError("Configure production Clerk credentials.");
  }

  const configuredOrigin = env.PRIVATE_ALPHA_ORIGIN?.trim();
  let url: URL;
  try {
    url = new URL(configuredOrigin ?? "");
  } catch {
    throw new PrivateAlphaConfigurationError("Configure the canonical Private Alpha origin.");
  }
  if (url.origin !== configuredOrigin || (production ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol))) {
    throw new PrivateAlphaConfigurationError("Configure the canonical Private Alpha origin.");
  }

  const ids = env.PRIVATE_ALPHA_USER_IDS?.split(",").map(id => id.trim()) ?? [];
  if (!ids.length || ids.some(id => !/^user_[a-zA-Z0-9]+$/.test(id))) {
    throw new PrivateAlphaConfigurationError("Configure the Private Alpha tester IDs.");
  }
  return { origin: url.origin, host: url.host, allowedUsers: new Set(ids) };
}

export function canAccessAlpha(policy: PrivateAlphaPolicy | null, userId: string) {
  return !policy || policy.allowedUsers.has(userId);
}
