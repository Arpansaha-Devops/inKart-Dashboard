const PRODUCT_NAME_UNIQUE_MARKER = String.fromCharCode(0x2063);

export const getVisibleProductName = (value?: string | null) => {
  if (!value) return '';
  return value.split(PRODUCT_NAME_UNIQUE_MARKER)[0];
};
