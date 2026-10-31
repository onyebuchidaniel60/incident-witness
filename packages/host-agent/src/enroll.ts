import { randomUUID } from "node:crypto";

import { sourceKeyCertificateSchema } from "@incident-witness/protocol";

import { HttpAgentApi, type AgentTransport } from "./api.js";
import {
  ensureAgentConfigDirectory,
  hasAgentConfig,
  UPS_DEVICE_PATTERN,
  validateApiBaseUrl,
  writeEnrollmentFiles,
  type AgentConfig,
} from "./config.js";
import { generateAgentKeyPair } from "./crypto.js";
import { AGENT_VERSION, PROTOCOL_VERSION } from "./log.js";

export class EnrollmentError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = "EnrollmentError";
    this.code = code;
    this.status = status;
  }
}

export type EnrollmentSummary = {
  hostId: string;
  sourceKeyId: string;
  configDir: string;
  apiBaseUrl: string;
};

export async function enrollAgent(options: {
  configDir: string;
  apiBaseUrl: string;
  enrollmentCode: string;
  upsDevice?: string;
  agentVersion?: string;
  transport?: AgentTransport;
  now?: () => Date;
}): Promise<EnrollmentSummary> {
  const enrollmentCode = options.enrollmentCode.trim();

  if (enrollmentCode.length < 1 || enrollmentCode.length > 200) {
    throw new EnrollmentError("The enrollment code is empty or too long");
  }
  if (options.upsDevice !== undefined && !UPS_DEVICE_PATTERN.test(options.upsDevice)) {
    throw new EnrollmentError("The UPS device alias contains unsupported characters");
  }
  if (hasAgentConfig(options.configDir)) {
    throw new EnrollmentError(
      "This configuration directory already contains an enrolled agent; refusing to overwrite it",
    );
  }

  let apiBaseUrl: string;
  try {
    apiBaseUrl = validateApiBaseUrl(options.apiBaseUrl);
  } catch {
    throw new EnrollmentError("The API base URL is invalid");
  }

  ensureAgentConfigDirectory(options.configDir);

  const keyPair = generateAgentKeyPair();
  const transport =
    options.transport ?? new HttpAgentApi({ baseUrl: apiBaseUrl, fetchImpl: fetch });

  let response;
  try {
    response = await transport.enroll({
      enrollmentCode,
      publicKey: keyPair.publicKeyBase64Url,
      agentVersion: options.agentVersion ?? AGENT_VERSION,
      requestId: randomUUID(),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      const code = (error as { code?: unknown }).code;
      const status = (error as { status?: unknown }).status;
      throw new EnrollmentError(
        "The API rejected the enrollment request",
        typeof code === "string" ? code : null,
        typeof status === "number" ? status : null,
      );
    }
    throw new EnrollmentError("The enrollment request did not complete");
  }

  if (response.protocolVersion !== PROTOCOL_VERSION) {
    throw new EnrollmentError("The API returned an unsupported protocol version");
  }

  const certificate = sourceKeyCertificateSchema.safeParse(response.certificate);
  if (!certificate.success) {
    throw new EnrollmentError("The API returned an invalid source certificate");
  }
  if (certificate.data.source_type !== "host_agent") {
    throw new EnrollmentError("The API returned a certificate for the wrong source type");
  }
  if (certificate.data.source_key_id !== response.sourceKeyId) {
    throw new EnrollmentError("The API returned a certificate for a different source key");
  }
  if (certificate.data.public_key !== keyPair.publicKeyBase64Url) {
    throw new EnrollmentError("The API returned a certificate for a different public key");
  }

  let enrolledApiBaseUrl: string;
  try {
    enrolledApiBaseUrl = validateApiBaseUrl(response.apiBaseUrl);
  } catch {
    throw new EnrollmentError("The API returned an invalid API base URL");
  }

  const config: AgentConfig = {
    config_version: 1,
    api_base_url: enrolledApiBaseUrl,
    host_id: certificate.data.host_id,
    source_key_id: response.sourceKeyId,
    enrolled_at: (options.now?.() ?? new Date()).toISOString(),
    ...(options.upsDevice === undefined ? {} : { ups_device: options.upsDevice }),
  };

  try {
    writeEnrollmentFiles(options.configDir, {
      config,
      privateKeyPem: keyPair.privateKeyPem,
      deviceCredential: response.deviceCredential,
    });
  } catch {
    throw new EnrollmentError(
      "The enrollment succeeded but local key material could not be written; revoke this host key and issue a new enrollment code",
    );
  }

  return {
    hostId: config.host_id,
    sourceKeyId: config.source_key_id,
    configDir: options.configDir,
    apiBaseUrl: config.api_base_url,
  };
}
