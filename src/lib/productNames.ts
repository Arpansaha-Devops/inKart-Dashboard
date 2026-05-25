const PRODUCT_NAME_UNIQUE_MARKER = String.fromCharCode(0x2063);

export const getVisibleProductName = (value?: string | null) => {
  if (!value) return '';
  return value.split(PRODUCT_NAME_UNIQUE_MARKER)[0];
};

export const createDuplicateFriendlyProductName = (value: string) => {
  const visibleName = getVisibleProductName(value).trim();
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${visibleName}${PRODUCT_NAME_UNIQUE_MARKER}${Date.now().toString(36)}${randomPart}`;
};
