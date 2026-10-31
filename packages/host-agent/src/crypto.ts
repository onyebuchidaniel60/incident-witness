import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { bytesToBase64Url, canonicalJsonBytes } from "@incident-witness/protocol";
import { exportPublicKeyBase64Url } from "@incident-witness/protocol/node";

export const PRESENCE_SIGNATURE_DOMAIN = Buffer.from("incident-witness-host-presence-v1\n", "utf8");

export type AgentKeyPair = {
  privateKey: KeyObject;
  privateKeyPem: string;
  publicKeyBase64Url: string;
};

export type PresenceBody = {
  hostId: string;
  observedAt: string;
  heartbeatSequence: number;
  agentVersion: string;
};

export type SignedPresence = PresenceBody & {
  signature: string;
};

export function generateAgentKeyPair(): AgentKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

  return {
    privateKey,
    privateKeyPem,
    publicKeyBase64Url: exportPublicKeyBase64Url(publicKey),
  };
}

export function loadAgentPrivateKey(privateKeyPem: string): KeyObject {
  const key = createPrivateKey(privateKeyPem);

  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("The stored agent private key is not an Ed25519 key");
  }

  return key;
}

export function publicKeyForPrivateKey(privateKey: KeyObject): string {
  return exportPublicKeyBase64Url(createPublicKey(privateKey));
}

export function signPresence(body: PresenceBody, privateKey: KeyObject): SignedPresence {
  if (!Number.isSafeInteger(body.heartbeatSequence) || body.heartbeatSequence <= 0) {
    throw new Error("The presence sequence must be a positive safe integer");
  }

  const canonical = canonicalJsonBytes(body);
  const message = Buffer.concat([PRESENCE_SIGNATURE_DOMAIN, Buffer.from(canonical)]);
  const signature = sign(null, message, privateKey);

  return { ...body, signature: bytesToBase64Url(signature) };
}
