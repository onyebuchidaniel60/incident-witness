import { describe, expect, it } from "vitest";

import {
  DuplicateKeyError,
  JsonFormatError,
  assertIJson,
  assertNoDuplicateKeys,
  canonicalJsonString,
  parseCanonicalJson,
} from "../src/core/json.js";

describe("RFC 8785 canonicalization", () => {
  it("sorts object keys and emits the expected canonical bytes", () => {
    expect(canonicalJsonString({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJsonString({ a: 1.0, b: 1e2 })).toBe('{"a":1,"b":100}');
    expect(canonicalJsonString({ s: "€$\u000f" })).toBe('{"s":"€$\\u000f"}');
  });

  it("accepts only exact canonical JSON bytes", () => {
    expect(parseCanonicalJson('{"a":1,"b":2}')).toEqual({ a: 1, b: 2 });
    expect(() => parseCanonicalJson('{"a": 1}')).toThrow(JsonFormatError);
    expect(() => parseCanonicalJson('{"b":2,"a":1}')).toThrow(JsonFormatError);
  });

  it("rejects duplicate keys at any depth", () => {
    expect(() => assertNoDuplicateKeys('{"a":1,"a":2}')).toThrow(DuplicateKeyError);
    expect(() => assertNoDuplicateKeys('{"outer":{"a":1,"a":2}}')).toThrow(DuplicateKeyError);
    expect(() => assertNoDuplicateKeys('[{"a":1,"a":2}]')).toThrow(DuplicateKeyError);
  });

  it("rejects non-I-JSON values", () => {
    expect(() => assertIJson({ value: Number.NaN })).toThrow(JsonFormatError);
    expect(() => assertIJson({ value: Number.POSITIVE_INFINITY })).toThrow(JsonFormatError);
    expect(() => assertIJson({ value: Number.MAX_SAFE_INTEGER + 1 })).toThrow(JsonFormatError);
    expect(() => assertIJson({ value: "\ud800" })).toThrow(JsonFormatError);
    expect(() => assertIJson({ value: undefined })).toThrow(JsonFormatError);
    expect(() => assertIJson({ value: new Date() })).toThrow(JsonFormatError);
    expect(() => assertIJson([, 1])).toThrow(JsonFormatError);
  });
});
