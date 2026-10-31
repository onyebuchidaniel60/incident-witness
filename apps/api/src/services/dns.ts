import { lookup, resolveTxt } from "node:dns/promises";

import type { ResolvedAddress } from "../domain/ip.js";

export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  lookup(name: string): Promise<ResolvedAddress[]>;
}

export class NodeDnsResolver implements DnsResolver {
  async resolveTxt(name: string): Promise<string[][]> {
    return resolveTxt(name);
  }

  async lookup(name: string): Promise<ResolvedAddress[]> {
    const addresses = await lookup(name, { all: true, verbatim: true });
    return addresses.map((entry) => ({ address: entry.address, family: entry.family }));
  }
}
