const MAX_OPTIMIZED_IMAGE_BYTES = 650 * 1024;
const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 1600;
const MIN_IMAGE_DIMENSION = 480;

export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

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

const optimizeProductImage = async (file: File): Promise<File> => {
  if (file.size <= MAX_OPTIMIZED_IMAGE_BYTES) {
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
      if (blob.size <= MAX_OPTIMIZED_IMAGE_BYTES) {
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
  // Process sequentially so several large camera images are not decoded into memory together.
  const optimizedFiles = await files.reduce<Promise<File[]>>(
    (optimizationChain, file) =>
      optimizationChain.then((currentFiles) =>
        optimizeProductImage(file).then((optimizedFile) => {
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
