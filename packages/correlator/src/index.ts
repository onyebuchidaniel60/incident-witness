export {
  CORRELATION_WINDOW_MS,
  POWER_CHAIN_WINDOW_MS,
  PROBE_HOST_ADJACENCY_MS,
  RULE_VERSION,
  SOURCE_TYPES,
  UnsupportedRuleVersionError,
  type CorrelatorEvent,
  type CorrelatorGap,
  type CorrelationResult,
} from "./types.js";
export { correlate } from "./rules.js";
