import type { PackageDetails } from '../types';
import { packageKeys } from './productConfiguration';

export function reportedPackage(value: unknown): PackageDetails | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (!packageKeys.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]) && Number(record[key]) > 0)) return undefined;
  return Object.fromEntries(packageKeys.map((key) => [key, record[key]])) as unknown as PackageDetails;
}

export function reportedShippingCharge(value: unknown): number | undefined {
  if (typeof value === 'string' && !value.trim()) return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined;
}

export function normalizeSelectedOptions(value: unknown): Record<string, string> | undefined {
  const entries = Array.isArray(value)
    ? value.flatMap((entry) => entry && typeof entry === 'object' && typeof entry.key === 'string' ? [[entry.key, entry.value]] : [])
    : value && typeof value === 'object' ? Object.entries(value) : [];
  const options = Object.fromEntries(entries.flatMap(([key, option]) => {
    if (typeof key !== 'string' || !key.trim()) return [];
    if (typeof option === 'string' && option.trim()) return [[key, option.trim()]];
    if (typeof option === 'number' && Number.isFinite(option)) return [[key, String(option)]];
    if (typeof option === 'boolean') return [[key, option ? 'Yes' : 'No']];
    return [];
  }));
  return Object.keys(options).length ? options : undefined;
}
