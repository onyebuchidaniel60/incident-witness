import { createPrivateKey, generateKeyPairSync, type KeyObject } from "node:crypto";

import { exportPublicKeyBase64Url } from "@incident-witness/protocol/node";

export type RenterKeyPair = {
  privateKey: KeyObject;
  privateKeyPem: string;
  publicKeyBase64Url: string;
};

export function generateRenterKeyPair(): RenterKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  return {
    privateKey,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyBase64Url: exportPublicKeyBase64Url(publicKey),
  };
}

export function loadRenterPrivateKey(privateKeyPem: string): KeyObject {
  const key = createPrivateKey(privateKeyPem);

  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("The saved renter private key is not an Ed25519 key");
  }

  return key;
}
