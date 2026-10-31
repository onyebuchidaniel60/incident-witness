"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";

export function JudgeDemoButton() {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function enterDemo() {
    if (state === "loading") return;

    setState("loading");
    setError(null);

    try {
      const response = await fetch("/api/demo-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        setState("error");
        setError(body?.error?.message ?? "Judge demo sign-in is unavailable.");
        return;
      }

      // A full navigation ensures the new Supabase session cookies are applied
      // to the protected server render and clears any stale client cache.
      window.location.replace("/dashboard");
    } catch {
      setState("error");
      setError("Judge demo sign-in could not be reached. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void enterDemo()}
        disabled={state === "loading"}
        aria-busy={state === "loading"}
        aria-describedby="judge-demo-note"
        className="iw-btn iw-btn-primary iw-btn-lg"
      >
        <Icon name="shield" size="sm" />
        {state === "loading" ? "Preparing judge demo…" : "Enter as Judge / Try Demo"}
      </button>
      <p id="judge-demo-note" className="max-w-56 text-[9px] leading-4 text-iw-faint">
        Seeded demo account · no email required
      </p>
      {state === "error" && error ? (
        <p role="alert" className="max-w-72 text-[10px] leading-5 text-iw-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}
