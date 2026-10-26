export type CategoryOption = { _id: string; name: string; slug?: string; isActive?: boolean; parent?: unknown; parentCategory?: unknown; aliases?: string[] };

export const categoryOptionLabel = (category: CategoryOption) =>
  `${category.name} — ${category.slug ? `${category.slug} · ` : ''}${category._id}`;

export function resolveCategoryOption(input: string, categories: CategoryOption[]): string | null {
  const value = input.trim();
  const exact = categories.find((category) => category._id === value || categoryOptionLabel(category) === value);
  if (exact) return exact._id;
  const matches = categories.filter((category) => category.name.trim().toLowerCase() === value.toLowerCase());
  return matches.length === 1 ? matches[0]._id : null;
}

export function configurationTitle(category: unknown, categories: CategoryOption[] = [], visited = new Set<string>()): string {
  if (typeof category === 'string') {
    const found = categories.find((item) => item._id === category);
    if (found && !visited.has(found._id)) { visited.add(found._id); return configurationTitle(found, categories, visited); }
  }
  const item = category && typeof category === 'object' ? category as CategoryOption : null;
  const metadata = [typeof category === 'string' ? category : '', item?.slug, item?.name, ...(item?.aliases ?? [])].join(' ').toLowerCase().replace(/[-_]/g, ' ');
  if (/standee|roll up|rollup/.test(metadata)) return 'Standee Configuration';
  if (/menu/.test(metadata)) return 'Menu Card Configuration';
  if (/visiting|business card/.test(metadata)) return 'Visiting Card Configuration';
  const parent = item?.parentCategory ?? item?.parent;
  return parent ? configurationTitle(parent, categories, visited) : 'Product Configuration';
}

export function categoryErrorMessage(error: unknown, fallback: string): string {
  const issue = error as { response?: { data?: { message?: string; error?: unknown }; status?: number }; message?: string };
  const message = issue.response?.data?.message || (typeof issue.response?.data?.error === 'string' ? issue.response.data.error : '') || issue.message || fallback;
  return /E11000|duplicate key|name_1|slug_1/i.test(message)
    ? `The backend rejected a duplicate category name or slug. Duplicate display names are allowed; the backend must generate unique slugs and remove any old unique index on name. Server: ${message}`
    : message;
}
