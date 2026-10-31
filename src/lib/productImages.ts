const MAX_OPTIMIZED_IMAGE_BYTES = 650 * 1024;
const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const MIN_IMAGE_DIMENSION = 480;

export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_PRODUCT_IMAGES = 10;

export function getProductGalleryUrls(product: unknown): string[] {
  if (!product || typeof product !== 'object') return [];
  const record = product as Record<string, unknown>;
  for (const candidate of [record.images, record.imageUrls, record.productImages]) {
    if (!Array.isArray(candidate)) continue;
    const urls = candidate.flatMap((image) => {
      const url = typeof image === 'string' ? image : image?.url || image?.secure_url || image?.path || image?.image || image?.src;
      return typeof url === 'string' && url.trim() ? [url.trim()] : [];
    });
    if (urls.length || candidate.length) return urls;
  }
  const legacy = [record.image, record.imageUrl, record.thumbnail, record.thumbnailUrl]
    .find((url) => typeof url === 'string' && url.trim());
  return typeof legacy === 'string' ? [legacy.trim()] : [];
}

export function validateProductGalleryFiles(files: File[]): string | null {
  if (files.length > MAX_PRODUCT_IMAGES) return `Select up to ${MAX_PRODUCT_IMAGES} product images. The previous selection has been kept.`;
  for (const file of files) {
    if (!PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number])) return `${file.name} must be a JPG, PNG, or WebP image.`;
    if (file.size === 0) return `${file.name} is empty. Choose a different image.`;
  }
  return null;
}

export function planProductGallery(existingUrls: string[], newFiles: File[]) {
  const retainedUrls = newFiles.length
    ? existingUrls.slice(0, Math.max(0, Math.min(existingUrls.length, MAX_PRODUCT_IMAGES) - newFiles.length))
    : [...existingUrls];
  return {
    retainedUrls,
    newFiles,
    totalCount: retainedUrls.length + newFiles.length,
  };
}

// The existing PATCH contract accepts files, not a documented retained-URL list.
// Build the complete intended gallery. The server must replace its saved array
// with these files; an append-only implementation cannot remove old images.
export async function prepareProductGalleryUpload(existingUrls: string[], newFiles: File[]): Promise<File[]> {
  if (newFiles.length === 0) return [];
  const error = validateProductGalleryFiles(newFiles);
  if (error) throw new Error(error);
  const plan = planProductGallery(existingUrls, newFiles);
  const retainedFiles: File[] = [];
  for (const [index, url] of plan.retainedUrls.entries()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) throw new Error('Image download failed');
      const blob = await response.blob();
      const mimeType = blob.type.split(';')[0].toLowerCase();
      if (!blob.size || !PRODUCT_IMAGE_TYPES.includes(mimeType as (typeof PRODUCT_IMAGE_TYPES)[number])) throw new Error('Unsupported saved image');
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
      retainedFiles.push(new File([blob], `retained-product-image-${index + 1}.${extension}`, { type: mimeType }));
    } catch {
      throw new Error(`Could not load current image ${index + 1}. No product changes were submitted. Retry when the existing image is available, or select ${Math.min(existingUrls.length, MAX_PRODUCT_IMAGES)} new images to replace the full gallery.`);
    } finally {
      clearTimeout(timer);
    }
  }
  return optimizeProductImages([...retainedFiles, ...newFiles]);
}

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error('The browser could not optimize this image.'));
      },
      type,
      quality
    );
  });

const getOptimizedFileName = (fileName: string, mimeType: string) => {
  const baseName = fileName.replace(/\.[^.]+$/, '') || 'product-image';
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'webp';
  return `${baseName}.${extension}`;
};

const loadImage = async (file: File) => {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap as CanvasImageSource,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      image.src = objectUrl;
    });

    return {
      source: image as CanvasImageSource,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

const optimizeProductImage = async (file: File, targetBytes: number): Promise<File> => {
  if (file.size <= targetBytes) {
    return file;
  }

  const image = await loadImage(file);

  try {
    const initialScale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.width, image.height));
    let width = Math.max(1, Math.round(image.width * initialScale));
    let height = Math.max(1, Math.round(image.height * initialScale));
    let quality = 0.86;
    let smallestBlob: Blob | null = null;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      throw new Error('Image optimization is not supported by this browser.');
    }

    for (let attempt = 0; attempt < 18; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image.source, 0, 0, width, height);

      const blob = await canvasToBlob(canvas, 'image/webp', quality);
      if (!smallestBlob || blob.size < smallestBlob.size) {
        smallestBlob = blob;
      }
      if (blob.size <= targetBytes) {
        break;
      }

      if (quality > 0.54) {
        quality = Math.max(0.5, quality - 0.08);
      } else if (Math.max(width, height) > MIN_IMAGE_DIMENSION) {
        width = Math.max(1, Math.round(width * 0.82));
        height = Math.max(1, Math.round(height * 0.82));
        quality = 0.78;
      }
    }

    if (!smallestBlob) {
      throw new Error(`Could not optimize ${file.name}.`);
    }

    return new File(
      [smallestBlob],
      getOptimizedFileName(file.name, smallestBlob.type || 'image/webp'),
      {
        type: smallestBlob.type || 'image/webp',
        lastModified: file.lastModified,
      }
    );
  } finally {
    image.cleanup();
  }
};

export const optimizeProductImages = async (files: File[]): Promise<File[]> => {
  // Ten gallery files and optional mockups must share the existing request
  // budget; increasing the count must not double the multipart payload size.
  const targetBytes = Math.min(MAX_OPTIMIZED_IMAGE_BYTES, Math.floor(MAX_PRODUCT_IMAGE_UPLOAD_BYTES / Math.max(1, files.length)));
  // Process sequentially so several large camera images are not decoded into memory together.
  const optimizedFiles = await files.reduce<Promise<File[]>>(
    (optimizationChain, file) =>
      optimizationChain.then((currentFiles) =>
        optimizeProductImage(file, targetBytes).then((optimizedFile) => {
          currentFiles.push(optimizedFile);
          return currentFiles;
        })
      ),
    Promise.resolve([])
  );

  const totalBytes = optimizedFiles.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_PRODUCT_IMAGE_UPLOAD_BYTES) {
    throw new Error(
      'The selected images are still too large to upload. Please remove one image or choose smaller files.'
    );
  }

  return optimizedFiles;
};

export const formatProductImageBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
