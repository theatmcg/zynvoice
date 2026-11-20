import { loadConfig, resolveClient, saveConfig, ZynError, type ResolvedClient } from "../lib/store.ts";
import type { Config } from "../lib/schema.ts";

export interface Ctx extends ResolvedClient {
  config: Config;
}

export function getCtx(clientKey?: string): Ctx {
  const config = loadConfig();
  return { config, ...resolveClient(config, clientKey) };
}

/** Adds an area to the client's list so it shows up in future pickers. */
export function rememberArea(ctx: Ctx, area: string): void {
  if (ctx.client.areas.includes(area)) return;
  ctx.client.areas.push(area);
  saveConfig(ctx.config);
}

/** Finds an area by case-insensitive substring, e.g. "backend" -> "spark-lms (Backend / Mobile Backend)". */
export function matchArea(areas: string[], query: string): string {
  const q = query.toLowerCase();
  const exact = areas.find((a) => a.toLowerCase() === q);
  if (exact) return exact;
  const hits = areas.filter((a) => a.toLowerCase().includes(q));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) throw new ZynError(`"${query}" matches several areas: ${hits.join("; ")}`);
  return query;
}
