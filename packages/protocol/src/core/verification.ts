export type BundleVerificationResult = {
  schemaValid: boolean;
  manifestDigestValid: boolean;
  platformSignatureValid: boolean;
  trustedKeyIdValid: boolean;
  valid: boolean;
};
