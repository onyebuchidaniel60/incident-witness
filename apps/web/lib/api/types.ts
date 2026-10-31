export type HostStatus = "pending_endpoint" | "pending_enrollment" | "active" | "archived";

export type HostSummary = {
  id: string;
  alias: string;
  hostname: string;
  status: HostStatus;
  endpointVerifiedAt: string | null;
  agentVersion: string | null;
  lastAgentSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HostEndpoint = {
  hostname: string;
  path: string;
  verifiedAt: string | null;
  dnsFingerprint: string | null;
};

export type HostSourceKey = {
  id: string;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
};

export type HostEndpointChallenge = {
  id: string;
  dnsRecordName: string;
  expiresAt: string;
  verifiedAt: string | null;
  attemptCount: number;
};

export type HostDetail = HostSummary & {
  endpoint: HostEndpoint;
  sourceKey: HostSourceKey | null;
  endpointChallenge: HostEndpointChallenge | null;
  installInstructions: string;
};

export type IncidentStatus = "collecting" | "awaiting_finalize" | "sealed" | "cancelled";

export type IncidentAssessment = {
  code: string | null;
  evidenceGrade: string | null;
  ruleVersion: string | null;
};

export type IncidentSummary = {
  id: string;
  hostId: string;
  title: string;
  workloadRef: string | null;
  status: IncidentStatus;
  captureStartedAt: string;
  captureEndsAt: string;
  ingestionDeadline: string;
  endedAt: string | null;
  sealedAt: string | null;
  demoMode: boolean;
  cancelReason: string | null;
  simulationPresent: boolean;
  acceptedEventCount: number;
  acceptedEventBytes: number;
  createdAt: string;
  updatedAt: string;
  assessment: IncidentAssessment | null;
};

export type IncidentSource = {
  id: string;
  sourceType: string;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
  acceptedEventCount: number;
  lastObservedAt: string | null;
};

export type TimelineEvent = {
  eventId: string;
  sourceKeyId: string;
  sourceType: string;
  eventType: string;
  sequence: number;
  observedAt: string;
  receivedAt: string;
};

export type IncidentDetail = IncidentSummary & {
  sources: IncidentSource[];
  timeline: TimelineEvent[];
};

export type ListResponse<T> = {
  data: T[];
  page: { nextCursor: string | null };
};

export type ChallengeResponse = {
  challengeId: string;
  dnsRecordName: string;
  dnsRecordValue: string;
  expiresAt: string;
};

export type EnrollmentCodeResponse = {
  enrollmentCode: string;
  expiresAt: string;
  installInstructions: string;
};

export type RenterInvitationResponse = {
  invitationToken: string;
  expiresAt: string;
  joinUrl: string;
  oneTime: boolean;
};
