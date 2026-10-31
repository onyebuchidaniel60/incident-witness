"use client";

import { e2eClientAuthEnabled, e2eClientToken } from "@/lib/e2e-auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(message: string, status: number, code: string, requestId: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type ApiErrorEnvelope = {
  error?: {
    code?: unknown;
    message?: unknown;
    request_id?: unknown;
  };
};

function apiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    throw new ApiError(
      "The API address is not configured for this deployment.",
      0,
      "CONFIGURATION_ERROR",
    );
  }
  return value.replace(/\/$/, "");
}

async function accessToken(refresh = false): Promise<string> {
  if (e2eClientAuthEnabled()) {
    return e2eClientToken();
  }

  const supabase = createSupabaseBrowserClient();
  if (refresh) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      redirectToLogin();
      throw new ApiError("Your session has expired.", 401, "AUTH_REQUIRED");
    }
    return data.session.access_token;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    redirectToLogin();
    throw new ApiError("Authentication is required.", 401, "AUTH_REQUIRED");
  }

  // A stale access token must be refreshed before it is sent. Otherwise the
  // API returns a raw invalid-token error that can flash before the redirect.
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      redirectToLogin();
      throw new ApiError("Your session has expired.", 401, "AUTH_REQUIRED");
    }
    return data.session.access_token;
  }

  return session.access_token;
}

let redirectingToLogin = false;

function redirectToLogin(): void {
  if (typeof window === "undefined" || redirectingToLogin) return;
  redirectingToLogin = true;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
}

export function isAuthRedirectError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && error.code === "AUTH_REQUIRED";
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorEnvelope | null = null;
  try {
    body = (await response.json()) as ApiErrorEnvelope;
  } catch {
    body = null;
  }

  const code = typeof body?.error?.code === "string" ? body.error.code : `HTTP_${response.status}`;
  const message =
    typeof body?.error?.message === "string"
      ? body.error.message
      : response.status === 404
        ? "The requested resource was not found."
        : "The request could not be completed.";
  const requestId = typeof body?.error?.request_id === "string" ? body.error.request_id : null;

  return new ApiError(message, response.status, code, requestId);
}

async function authorizedFetch(
  path: string,
  init: RequestInit = {},
  allowRefresh = true,
): Promise<Response> {
  const headers = new Headers(init.headers);
  let token: string;
  try {
    token = await accessToken(false);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirectToLogin();
    throw error;
  }
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new ApiError(
      "The Witness API could not be reached. Check the connection and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  if ((response.status === 401 || response.status === 403) && allowRefresh) {
    try {
      token = await accessToken(true);
    } catch {
      redirectToLogin();
      throw new ApiError("Your session has expired.", 401, "AUTH_REQUIRED");
    }
    headers.set("authorization", `Bearer ${token}`);
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 401 || response.status === 403) {
      redirectToLogin();
      throw new ApiError("Your session has expired.", 401, "AUTH_REQUIRED");
    }
  }

  return response;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "PATCH";
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

  const response = await authorizedFetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) throw await parseError(response);

  const body = (await response.json()) as { data?: T };
  return body.data as T;
}

export type DownloadedBundle = {
  blob: Blob;
  filename: string;
};

export async function downloadIncidentBundle(incidentId: string): Promise<DownloadedBundle> {
  const response = await authorizedFetch(`/v1/incidents/${incidentId}/bundle`);
  if (!response.ok) throw await parseError(response);

  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(contentDisposition);
  return {
    blob: await response.blob(),
    filename: match?.[1] ?? `incident-witness-${incidentId}.json`,
  };
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
