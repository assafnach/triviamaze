import type { AddressForm } from '@/types';

/**
 * Hebrew addresses the player in gendered second person. Content strings are either neutral
 * (a plain string) or authored in both forms; the player's chosen form of address picks one.
 */
export type G = string | { m: string; f: string };

export const g = (value: G, address: AddressForm): string => (typeof value === 'string' ? value : value[address]);

/** Simple `{name}` interpolation. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}
