export const repositoryUrl = "https://github.com/onyebuchidaniel60/incident-witness";

export const siteName = "Incident Witness";

export const siteDescription =
  "Incident Witness is a portable incident-evidence protocol for decentralized compute. Collect source-attributed observations, seal a signed evidence bundle and verify it locally.";

function resolveSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProductionHost) {
    return `https://${vercelProductionHost.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  return "https://incident-witness.vercel.app";
}

export const siteUrl = resolveSiteUrl();
