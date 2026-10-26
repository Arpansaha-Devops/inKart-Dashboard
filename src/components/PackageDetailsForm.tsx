import { useId } from 'react';
import { packageKeys, type PackageDraft } from '../lib/productConfiguration';

export default function PackageDetailsForm({ value, onChange, error, disabled = false, required = false, title = 'Default Package Details' }: {
  value: PackageDraft; onChange?: (value: PackageDraft) => void; error?: string;
  disabled?: boolean; required?: boolean; title?: string;
}) {
  const id = useId();
  return <fieldset className="product-extension-section" disabled={disabled}>
    <legend>{title}</legend>
    <p className="product-extension-help">{required ? 'Enter the actual packed parcel measurements.' : 'Optional. Enter all four actual packed measurements to save product defaults.'}</p>
    <div className="product-extension-grid">
      {packageKeys.map((key) => <div key={key}>
        <label className="form-label" htmlFor={`${id}-${key}`}>{key[0].toUpperCase() + key.slice(1)} ({key === 'weight' ? 'kg' : 'cm'}){required ? ' *' : ''}</label>
        <input id={`${id}-${key}`} className="input-field" type="number" step="any" min="0" required={required} value={value[key]}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => onChange?.({ ...value, [key]: event.target.value })} />
      </div>)}
    </div>
    {error && <p id={`${id}-error`} className="product-extension-error" role="alert">{error}</p>}
  </fieldset>;
}
