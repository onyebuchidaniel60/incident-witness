import type { PoolClient } from "pg";

export type AuditActorType =
  | "provider"
  | "host_agent"
  | "renter_client"
  | "platform_worker"
  | "system";

export type AuditResult = "success" | "denied" | "failure";

export type AuditInput = {
  actorType: AuditActorType;
  actorId?: string | null;
  ownerUserId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  result?: AuditResult;
  requestId: string;
  metadata?: Record<string, unknown>;
};

export async function appendAudit(client: PoolClient, input: AuditInput): Promise<void> {
  await client.query(
    `insert into audit_events
       (actor_type, actor_id, owner_user_id, resource_type, resource_id, action, result, request_id, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      input.actorType,
      input.actorId ?? null,
      input.ownerUserId ?? null,
      input.resourceType,
      input.resourceId ?? null,
      input.action,
      input.result ?? "success",
      input.requestId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );
}
