import { useEffect, useState } from 'react';
import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { MAX_PRODUCT_IMAGES, planProductGallery, PRODUCT_IMAGE_TYPES, validateProductGalleryFiles } from '../lib/productImages';

export default function ProductGalleryEditor({ existingUrls, files, onChange, disabled = false, error }: {
  existingUrls: string[]; files: File[]; onChange: (files: File[]) => void; disabled?: boolean; error?: string;
}) {
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [selectionError, setSelectionError] = useState('');
  const plan = planProductGallery(existingUrls, files);
  const issue = selectionError || error;
  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files]);

  const selectFiles = (selected: File[]) => {
    if (disabled || selected.length === 0) return;
    const next = [...files, ...selected];
    const validation = validateProductGalleryFiles(next);
    if (validation) { setSelectionError(validation); return; }
    setSelectionError('');
    onChange(next);
  };

  return <section className="product-gallery-editor" aria-label="Product image gallery">
    <div className="product-extension-toolbar">
      <label className="form-label" htmlFor="edit-product-image">Product images · {files.length}/{MAX_PRODUCT_IMAGES} new</label>
      {files.length > 0 && <button type="button" className="btn-ghost" disabled={disabled}
        onClick={() => { setSelectionError(''); onChange([]); }}>Use current images</button>}
    </div>
    <p id="edit-product-image-help" className="product-extension-help">Choose up to {MAX_PRODUCT_IMAGES} JPG, PNG, or WebP images together. New images replace the last gallery slots; the first current images stay. Choose at least {Math.min(existingUrls.length, MAX_PRODUCT_IMAGES) || 1} new images to replace the full current gallery.</p>
    <label className={`product-gallery-picker${disabled ? ' is-disabled' : ''}`} htmlFor="edit-product-image"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); selectFiles(Array.from(event.dataTransfer.files)); }}>
      <Upload size={24} aria-hidden="true" />
      <strong>{files.length ? 'Add replacement images' : 'Choose replacement images'}</strong>
      <span>Select several files at once or drop them here</span>
      <input id="edit-product-image" type="file" multiple accept={PRODUCT_IMAGE_TYPES.join(',')} disabled={disabled}
        aria-label="Upload replacement product images" aria-invalid={!!issue}
        aria-describedby={`edit-product-image-help${issue ? ' edit-product-image-error' : ''}`}
        onChange={(event) => { selectFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    </label>
    {issue && <p id="edit-product-image-error" className="product-extension-error" role="alert">{issue}</p>}
    <p className="product-extension-help" aria-live="polite">{files.length
      ? `Gallery after saving: ${plan.retainedUrls.length} current + ${files.length} new = ${plan.totalCount} images.`
      : `${existingUrls.length} current images. Leave the selection empty to keep them.`}</p>
    <div className="product-gallery-preview" aria-label="Gallery preview">
      {plan.retainedUrls.map((url, index) => <figure key={`current-${index}`} data-gallery-kind="current">
        <img src={url} alt={`Current gallery image ${index + 1}`} />
        <figcaption>{index + 1} · Keep current</figcaption>
      </figure>)}
      {files.map((file, index) => {
        const preview = previews.find((entry) => entry.file === file)?.url;
        return <figure key={`new-${index}`} data-gallery-kind="new">
          {preview ? <img src={preview} alt={`New gallery image ${plan.retainedUrls.length + index + 1}`} /> : <span className="product-gallery-loading"><ImageIcon size={24} /></span>}
          <figcaption><strong>{plan.retainedUrls.length + index + 1} · New</strong><span title={file.name}>{file.name}</span></figcaption>
          <button type="button" className="product-gallery-remove" disabled={disabled} aria-label={`Remove selected image ${index + 1}`}
            onClick={() => { setSelectionError(''); onChange(files.filter((_, itemIndex) => itemIndex !== index)); }}><Trash2 size={14} /></button>
        </figure>;
      })}
    </div>
  </section>;
}
