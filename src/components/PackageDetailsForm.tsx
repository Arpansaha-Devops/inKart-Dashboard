import { useId } from 'react';
import { packageKeys, type PackageDraft } from '../lib/productConfiguration';

export default function PackageDetailsForm({ value, onChange, onBlur, error, fieldErrors, disabled = false, required = false, title = 'Packed Parcel Measurements' }: {
  value: PackageDraft; onChange?: (value: PackageDraft) => void; error?: string;
  fieldErrors?: Partial<Record<keyof PackageDraft, string>>;
  onBlur?: (key: keyof PackageDraft) => void;
  disabled?: boolean; required?: boolean; title?: string;
}) {
  const id = useId();
  return <fieldset className="product-extension-section" disabled={disabled}>
    <legend>{title}</legend>
    <p className="product-extension-help">Enter the actual weight including packaging and the outside dimensions of this order’s packed parcel.</p>
    <div className="product-extension-grid">
      {packageKeys.map((key) => <div key={key}>
        <label className="form-label" htmlFor={`${id}-${key}`}>{key[0].toUpperCase() + key.slice(1)} ({key === 'weight' ? 'kg' : 'cm'}){required ? ' *' : ''}</label>
        <input id={`${id}-${key}`} className="input-field" type="number" step={key === 'weight' ? '0.01' : 'any'} min={key === 'weight' ? '0.1' : '0'} max={key === 'weight' ? '999.99' : undefined} required={required} value={value[key]}
          placeholder={key === 'weight' ? 'e.g. 1.5' : 'e.g. 20'}
          aria-invalid={!!(fieldErrors?.[key] || error)} aria-describedby={fieldErrors?.[key] ? `${id}-${key}-error` : error ? `${id}-error` : undefined}
          onBlur={() => onBlur?.(key)}
          onChange={(event) => onChange?.({ ...value, [key]: event.target.value })} />
        {fieldErrors?.[key] && <p id={`${id}-${key}-error`} className="product-extension-error" role="alert">{fieldErrors[key]}</p>}
      </div>)}
    </div>
    {error && <p id={`${id}-error`} className="product-extension-error" role="alert">{error}</p>}
  </fieldset>;
}
