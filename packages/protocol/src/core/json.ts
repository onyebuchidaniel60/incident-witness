import canonicalize from "canonicalize";

import { utf8DecodeStrict, utf8Encode } from "./base64.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export class JsonFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsonFormatError";
  }
}

export class DuplicateKeyError extends JsonFormatError {
  constructor(key: string) {
    super(`Duplicate JSON property: ${key}`);
    this.name = "DuplicateKeyError";
  }
}

function isWellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        return false;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }

  return true;
}

export function assertIJson(value: unknown): asserts value is JsonValue {
  if (value === null || typeof value === "boolean") return;

  if (typeof value === "string") {
    if (!isWellFormedString(value)) {
      throw new JsonFormatError("String contains invalid Unicode");
    }
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new JsonFormatError("Number is not finite");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new JsonFormatError("Integer is outside the safe range");
    }
    return;
  }

  if (Array.isArray(value)) {
    const ownKeys = Object.keys(value);
    if (ownKeys.length !== value.length) {
      throw new JsonFormatError("Array contains holes or non-index properties");
    }
    for (let index = 0; index < value.length; index += 1) {
      assertIJson(value[index]);
    }
    return;
  }

  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new JsonFormatError("Value is not a plain JSON object");
    }

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !isWellFormedString(key)) {
        throw new JsonFormatError("Object contains an invalid property name");
      }
      assertIJson((value as Record<string, unknown>)[key]);
    }
    return;
  }

  throw new JsonFormatError(`Unsupported JSON value type: ${typeof value}`);
}

export function canonicalJsonString(value: unknown): string {
  assertIJson(value);
  const canonical = canonicalize(value);

  if (typeof canonical !== "string") {
    throw new JsonFormatError("Value could not be canonicalized");
  }

  return canonical;
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return utf8Encode(canonicalJsonString(value));
}

export function assertNoDuplicateKeys(raw: string): void {
  let index = 0;

  function skipWhitespace(): void {
    while (index < raw.length && /[\t\n\r ]/.test(raw[index] ?? "")) {
      index += 1;
    }
  }

  function parseString(): string {
    if (raw[index] !== '"') {
      throw new JsonFormatError("Expected a JSON string");
    }

    const start = index;
    index += 1;

    while (index < raw.length) {
      const character = raw[index];

      if (character === "\\") {
        index += 2;
        continue;
      }

      if (character === '"') {
        index += 1;
        const token = raw.slice(start, index);
        let decoded: unknown;

        try {
          decoded = JSON.parse(token);
        } catch {
          throw new JsonFormatError("Invalid JSON string");
        }

        if (typeof decoded !== "string") {
          throw new JsonFormatError("Invalid JSON string");
        }

        return decoded;
      }

      if (character !== undefined && character.charCodeAt(0) < 0x20) {
        throw new JsonFormatError("Unescaped control character in JSON string");
      }

      index += 1;
    }

    throw new JsonFormatError("Unterminated JSON string");
  }

  function parseNumber(): void {
    const match = raw.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) {
      throw new JsonFormatError("Invalid JSON number");
    }

    index += match[0].length;

    const next = raw[index];
    if (next !== undefined && !/[\s,\]}]/.test(next)) {
      throw new JsonFormatError("Invalid character after JSON number");
    }
  }

  function parseValue(): void {
    skipWhitespace();
    const character = raw[index];

    if (character === "{") {
      parseObject();
      return;
    }

    if (character === "[") {
      parseArray();
      return;
    }

    if (character === '"') {
      parseString();
      return;
    }

    if (character === "-" || (character !== undefined && /[0-9]/.test(character))) {
      parseNumber();
      return;
    }

    if (raw.startsWith("true", index)) {
      index += 4;
      return;
    }

    if (raw.startsWith("false", index)) {
      index += 5;
      return;
    }

    if (raw.startsWith("null", index)) {
      index += 4;
      return;
    }

    throw new JsonFormatError("Invalid JSON value");
  }

  function parseObject(): void {
    index += 1;
    skipWhitespace();

    if (raw[index] === "}") {
      index += 1;
      return;
    }

    const keys = new Set<string>();

    while (index < raw.length) {
      const key = parseString();
      if (keys.has(key)) {
        throw new DuplicateKeyError(key);
      }
      keys.add(key);

      skipWhitespace();
      if (raw[index] !== ":") {
        throw new JsonFormatError("Expected ':' after property name");
      }
      index += 1;
      parseValue();
      skipWhitespace();

      if (raw[index] === ",") {
        index += 1;
        skipWhitespace();
        continue;
      }

      if (raw[index] === "}") {
        index += 1;
        return;
      }

      throw new JsonFormatError("Expected ',' or '}' in object");
    }

    throw new JsonFormatError("Unterminated JSON object");
  }

  function parseArray(): void {
    index += 1;
    skipWhitespace();

    if (raw[index] === "]") {
      index += 1;
      return;
    }

    while (index < raw.length) {
      parseValue();
      skipWhitespace();

      if (raw[index] === ",") {
        index += 1;
        skipWhitespace();
        continue;
      }

      if (raw[index] === "]") {
        index += 1;
        return;
      }

      throw new JsonFormatError("Expected ',' or ']' in array");
    }

    throw new JsonFormatError("Unterminated JSON array");
  }

  parseValue();
  skipWhitespace();

  if (index !== raw.length) {
    throw new JsonFormatError("Trailing content after JSON value");
  }
}

export function parseCanonicalJson(raw: string): unknown {
  assertNoDuplicateKeys(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JsonFormatError("Malformed JSON");
  }

  assertIJson(parsed);

  if (canonicalJsonString(parsed) !== raw) {
    throw new JsonFormatError("JSON bytes are not the exact RFC 8785 canonical form");
  }

  return parsed;
}

export function parseCanonicalJsonBytes(raw: Uint8Array): unknown {
  return parseCanonicalJson(utf8DecodeStrict(raw));
}
