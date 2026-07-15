export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000;

export const normalizeProductDescription = (description: string) => description.trim();

export const getProductDescriptionError = (description: string): string | null => {
  const normalizedDescription = normalizeProductDescription(description);

  if (!normalizedDescription) {
    return 'Description is required';
  }

  if (normalizedDescription.length > PRODUCT_DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${PRODUCT_DESCRIPTION_MAX_LENGTH.toLocaleString()} characters or fewer`;
  }

  return null;
};
