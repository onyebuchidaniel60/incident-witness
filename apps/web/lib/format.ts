import type { HostStatus, IncidentStatus } from "@/lib/api/types";

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unrecognised timestamp";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTimestampShort(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unrecognised timestamp";
  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

export function hostStatusLabel(status: HostStatus): string {
  switch (status) {
    case "pending_endpoint":
      return "Endpoint not verified";
    case "pending_enrollment":
      return "Ready for agent enrollment";
    case "active":
      return "Active";
    case "archived":
      return "Archived";
  }
}

export function hostStatusTone(status: HostStatus): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "active":
      return "success";
    case "pending_enrollment":
      return "warning";
    case "archived":
      return "danger";
    default:
      return "neutral";
  }
}

export function incidentStatusLabel(status: IncidentStatus): string {
  switch (status) {
    case "collecting":
      return "Collecting";
    case "awaiting_finalize":
      return "Awaiting finalization";
    case "sealed":
      return "Sealed";
    case "cancelled":
      return "Cancelled";
  }
}

export function incidentStatusTone(
  status: IncidentStatus,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "collecting":
      return "success";
    case "awaiting_finalize":
      return "warning";
    case "sealed":
      return "neutral";
    case "cancelled":
      return "danger";
  }
}

export function assessmentText(code: string | null): string {
  switch (code) {
    case "POWER_RELATED":
      return "Evidence pattern consistent with a power-related interruption.";
    case "EXTERNAL_REACHABILITY_LOSS":
      return "External reachability loss observed; evidence does not identify the precise upstream network cause.";
    case "HOST_OR_WORKLOAD_EXIT":
      return "Host/workload exit signal observed; intent is not inferred.";
    case "UNKNOWN":
      return "Available evidence is insufficient to classify this interruption.";
    default:
      return "No assessment is available.";
  }
}

export function sourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case "host_agent":
      return "Host agent";
    case "renter_client":
      return "Renter client";
    case "platform_probe":
      return "Platform-operated probe";
    default:
      return sourceType;
  }
}
