import { useId } from 'react';
import { packageKeys, type PackageDraft } from '../lib/productConfiguration';

export default function PackageDetailsForm({ value, onChange, onBlur, error, disabled = false, required = false, title = 'Packed Parcel Measurements' }: {
  value: PackageDraft; onChange?: (value: PackageDraft) => void; error?: string;
  onBlur?: () => void;
  disabled?: boolean; required?: boolean; title?: string;
}) {
  const id = useId();
  return <fieldset className="product-extension-section" disabled={disabled}>
    <legend>{title}</legend>
    <p className="product-extension-help">Enter the actual weight including packaging and the outside dimensions of this order’s packed parcel.</p>
    <div className="product-extension-grid">
      {packageKeys.map((key) => <div key={key}>
        <label className="form-label" htmlFor={`${id}-${key}`}>{key[0].toUpperCase() + key.slice(1)} ({key === 'weight' ? 'kg' : 'cm'}){required ? ' *' : ''}</label>
        <input id={`${id}-${key}`} className="input-field" type="number" step="any" min="0" required={required} value={value[key]}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          onBlur={onBlur}
          onChange={(event) => onChange?.({ ...value, [key]: event.target.value })} />
      </div>)}
    </div>
    {error && <p id={`${id}-error`} className="product-extension-error" role="alert">{error}</p>}
  </fieldset>;
}
