import type { Pool } from "pg";

import type { AppConfig } from "../config.js";
import type { DnsResolver } from "../services/dns.js";
import type { EndpointChecker } from "../services/endpoint.js";

export type RouteContext = {
  config: AppConfig;
  apiPool: Pool;
  dnsResolver: DnsResolver;
  endpointChecker: EndpointChecker;
};
