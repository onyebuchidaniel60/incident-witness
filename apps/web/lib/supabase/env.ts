export type IncidentWitnessCookieOptions = {
  path: string;
  sameSite: "lax";
  secure: boolean;
};

export function getSupabasePublicEnvironment(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Supabase public authentication configuration is missing.");
  }

  return { url, publishableKey };
}

export function getSupabaseCookieOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): IncidentWitnessCookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: nodeEnv === "production",
  };
}
