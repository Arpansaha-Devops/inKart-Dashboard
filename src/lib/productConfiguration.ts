import type { PackageDetails, ProductConfiguration } from '../types';

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function validateConfiguration(value: unknown): string | null {
  if (!record(value) || typeof value.enabled !== 'boolean' || !Array.isArray(value.fields)) {
    return 'Configuration must contain an enabled state and a list of fields.';
  }
  const keys = new Set<string>();
  for (const [index, field] of value.fields.entries()) {
    const label = `Field ${index + 1}`;
    if (!record(field) || typeof field.label !== 'string' || !field.label.trim()) return `${label}: label is required.`;
    if (typeof field.key !== 'string' || !field.key.trim() || field.key !== field.key.trim()) return `${label}: enter a stable key without surrounding spaces.`;
    if (keys.has(field.key)) return `${label}: duplicate field key "${field.key}".`;
    keys.add(field.key);
    if (field.type !== 'select' || typeof field.required !== 'boolean' || typeof field.isActive !== 'boolean' || !Array.isArray(field.options)) return `${label}: invalid field structure; only select fields are supported.`;
    const values = new Set<string>();
    for (const option of field.options) {
      if (!record(option) || typeof option.label !== 'string' || !option.label.trim()) return `${label}: every option needs a label.`;
      if (typeof option.value !== 'string' || !option.value.trim() || option.value !== option.value.trim()) return `${label}: every option needs a stable value without surrounding spaces.`;
      if (values.has(option.value)) return `${label}: duplicate option value "${option.value}".`;
      values.add(option.value);
      if (typeof option.priceModifier !== 'number' || !Number.isFinite(option.priceModifier)) return `${label}: price modifiers must be finite numbers.`;
      if (typeof option.isActive !== 'boolean') return `${label}: every option needs an active state.`;
    }
    if (value.enabled && field.isActive && field.required && !field.options.some((option) => option.isActive)) return `${label}: a required active field needs at least one active option.`;
  }
  return null;
}

// Only contract fields are serialized; server metadata such as nested _id is ignored.
export function configurationPayload(value: ProductConfiguration): ProductConfiguration {
  return {
    enabled: value.enabled,
    fields: value.fields.map((field) => ({
      key: field.key, label: field.label.trim(), type: field.type,
      required: field.required, isActive: field.isActive,
      options: field.options.map((option) => ({
        label: option.label.trim(), value: option.value,
        priceModifier: option.priceModifier, isActive: option.isActive,
      })),
    })),
  };
}

export const packageKeys = ['weight', 'length', 'breadth', 'height'] as const;
export type PackageDraft = Record<(typeof packageKeys)[number], string>;
export const emptyPackageDraft = (): PackageDraft => ({ weight: '', length: '', breadth: '', height: '' });
export const packageDraft = (value?: PackageDetails): PackageDraft =>
  Object.fromEntries(packageKeys.map((key) => [key, value?.[key] == null ? '' : String(value[key])])) as PackageDraft;

export function validatePackage(value: PackageDraft, required = false): string | null {
  if (!required && packageKeys.every((key) => !value[key].trim())) return null;
  for (const key of packageKeys) {
    if (!value[key].trim() || !Number.isFinite(Number(value[key])) || Number(value[key]) <= 0) return `${key[0].toUpperCase()}${key.slice(1)} must be a positive, finite number.`;
  }
  return null;
}

export function appendProductExtensions(data: FormData, configuration?: ProductConfiguration, parcel?: PackageDraft) {
  if (configuration !== undefined) {
    const error = validateConfiguration(configuration);
    if (error) throw new Error(error);
    data.set('configuration', JSON.stringify(configurationPayload(configuration)));
  }
  if (parcel !== undefined) {
    const error = validatePackage(parcel, true);
    if (error) throw new Error(error);
    data.set('packageDetails', JSON.stringify(Object.fromEntries(packageKeys.map((key) => [key, Number(parcel[key])]))));
  }
}

export function findProductRecord(payload: unknown, id?: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null;
  if (record(payload) && typeof (payload._id ?? payload.id) === 'string' && typeof payload.name === 'string' && (!id || (payload._id ?? payload.id) === id)) return payload;
  for (const value of Object.values(payload)) {
    const found = findProductRecord(value, id);
    if (found) return found;
  }
  return null;
}

export function extensionPersistenceError(product: Record<string, unknown>, data: FormData): string | null {
  for (const key of ['configuration', 'packageDetails']) {
    const sent = data.get(key);
    if (typeof sent !== 'string') continue;
    const actual = product[key];
    const expected = JSON.parse(sent);
    if (key === 'configuration') {
      if (validateConfiguration(actual) || JSON.stringify(configurationPayload(actual as ProductConfiguration)) !== JSON.stringify(expected)) return 'configuration';
    } else if (!record(actual) || packageKeys.some((name) => actual[name] !== expected[name])) return 'packageDetails';
  }
  return null;
}
