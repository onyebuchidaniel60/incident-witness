export type TrustedPlatformKey = {
  platformKeyId: string;
  publicKey: string;
  fingerprint: string;
  status: "active" | "retired" | "revoked";
};

/**
 * Public keys only. The browser verifier trusts a platform key only when its
 * ID and public key appear in this pinned local set. A bundle's embedded
 * certificates cannot establish platform trust by themselves.
 */
export const TRUSTED_PLATFORM_KEYS: TrustedPlatformKey[] = [
  {
    platformKeyId: "iw-platform-staging-1",
    publicKey: "U0lXLgkEbyAWigI-_WWJjxAfYnYQQpfTcPtRZEqe4TI",
    fingerprint: "5xL-KJE2WSs1tQkh1zt7QYVWG3HtrZFwHeErOPqzP4A",
    status: "active",
  },
];
