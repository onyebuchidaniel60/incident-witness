import { createPublicKey, verify } from "node:crypto";
import { join } from "node:path";

import { base64UrlToBytes, canonicalJsonBytes } from "@incident-witness/protocol";
import { afterEach, describe, expect, it } from "vitest";

import type { PresenceResult, PresenceTransport } from "../src/api.js";
import {
  generateAgentKeyPair,
  PRESENCE_SIGNATURE_DOMAIN,
  type SignedPresence,
} from "../src/crypto.js";
import { PresenceReporter } from "../src/presence.js";
import { EventSpool } from "../src/spool.js";
import { captureLogger, makeTempDir, removeTempDir } from "./helpers.js";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function verifyPresence(presence: SignedPresence, publicKeyBase64Url: string): boolean {
  const { signature, ...body } = presence;
  const publicKey = createPublicKey({
    key: Buffer.concat([SPKI_PREFIX, Buffer.from(base64UrlToBytes(publicKeyBase64Url))]),
    format: "der",
    type: "spki",
  });
  const message = Buffer.concat([PRESENCE_SIGNATURE_DOMAIN, Buffer.from(canonicalJsonBytes(body))]);

  return verify(null, message, publicKey, Buffer.from(base64UrlToBytes(signature)));
}

describe("PresenceReporter", () => {
  const directories: string[] = [];
  const spools: EventSpool[] = [];
  const keyPair = generateAgentKeyPair();

  afterEach(() => {
    for (const spool of spools.splice(0)) {
      try {
        spool.close();
      } catch {
        // already closed
      }
    }
    for (const directory of directories.splice(0)) {
      removeTempDir(directory);
    }
  });

  function newSpool(): EventSpool {
    const directory = makeTempDir();
    directories.push(directory);
    const spool = new EventSpool(join(directory, "spool.sqlite"));
    spools.push(spool);
    return spool;
  }

  function reporter(
    spool: EventSpool,
    transport: PresenceTransport,
    now = () => new Date("2026-10-31T12:00:00.000Z"),
  ): PresenceReporter {
    return new PresenceReporter({
      spool,
      privateKey: keyPair.privateKey,
      transport,
      hostId: HOST_ID,
      agentVersion: "0.1.0",
      logger: captureLogger().logger,
      now,
    });
  }

  it("signs the domain-separated presence message with a strictly increasing sequence", async () => {
    const spool = newSpool();
    const sent: SignedPresence[] = [];
    const transport: PresenceTransport = {
      sendPresence: async (presence) => {
        sent.push(presence);
        return { kind: "accepted", status: 200 };
      },
    };
    const presence = reporter(spool, transport);

    expect((await presence.tick()).sequence).toBe(1);
    expect((await presence.tick()).sequence).toBe(2);

    expect(sent).toHaveLength(2);
    expect(sent[0]?.heartbeatSequence).toBe(1);
    expect(sent[1]?.heartbeatSequence).toBe(2);
    expect(verifyPresence(sent[0] as SignedPresence, keyPair.publicKeyBase64Url)).toBe(true);
    expect(verifyPresence(sent[1] as SignedPresence, keyPair.publicKeyBase64Url)).toBe(true);
    expect(sent[0]?.signature).not.toBe(sent[1]?.signature);
  });

  it("continues the presence sequence after a restart and never reuses it", async () => {
    const directory = makeTempDir();
    directories.push(directory);
    const path = join(directory, "spool.sqlite");
    const keyPairLocal = keyPair;
    const sent: number[] = [];

    const firstSpool = new EventSpool(path);
    const first = new PresenceReporter({
      spool: firstSpool,
      privateKey: keyPairLocal.privateKey,
      transport: {
        sendPresence: async (presence) => {
          sent.push(presence.heartbeatSequence);
          return { kind: "accepted", status: 200 };
        },
      },
      hostId: HOST_ID,
      agentVersion: "0.1.0",
      logger: captureLogger().logger,
    });
    await first.tick();
    firstSpool.close();

    const secondSpool = new EventSpool(path);
    spools.push(secondSpool);
    const second = new PresenceReporter({
      spool: secondSpool,
      privateKey: keyPairLocal.privateKey,
      transport: {
        sendPresence: async (presence) => {
          sent.push(presence.heartbeatSequence);
          return { kind: "accepted", status: 200 };
        },
      },
      hostId: HOST_ID,
      agentVersion: "0.1.0",
      logger: captureLogger().logger,
    });
    await second.tick();

    expect(sent).toEqual([1, 2]);
  });

  it("consumes a sequence when the network fails and does not replay it", async () => {
    const spool = newSpool();
    const sent: number[] = [];
    let attempt = 0;
    const transport: PresenceTransport = {
      sendPresence: async (presence) => {
        sent.push(presence.heartbeatSequence);
        attempt += 1;
        return attempt === 1
          ? ({ kind: "retryable", status: null, code: "NETWORK_ERROR" } satisfies PresenceResult)
          : ({ kind: "accepted", status: 200 } satisfies PresenceResult);
      },
    };
    const presence = reporter(spool, transport);

    expect((await presence.tick()).kind).toBe("retryable");
    expect((await presence.tick()).kind).toBe("sent");
    expect(sent).toEqual([1, 2]);
    expect(spool.peekNextPresenceSequence()).toBe(3);
  });

  it("stops after a non-retryable credential rejection", async () => {
    const spool = newSpool();
    let calls = 0;
    const transport: PresenceTransport = {
      sendPresence: async () => {
        calls += 1;
        return { kind: "halted", status: 401, code: "AUTH_INVALID" };
      },
    };
    const presence = reporter(spool, transport);

    expect(await presence.tick()).toMatchObject({ kind: "halted", code: "AUTH_INVALID" });
    expect(await presence.tick()).toMatchObject({ kind: "halted", code: "AUTH_INVALID" });
    expect(calls).toBe(1);
    expect(presence.isHalted()).toBe(true);
  });
});
