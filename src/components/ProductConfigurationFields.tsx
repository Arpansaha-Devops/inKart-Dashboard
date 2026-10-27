import { useId, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ProductConfiguration, ProductConfigurationField } from '../types';
import { validateConfiguration } from '../lib/productConfiguration';

export default function ProductConfigurationFields({ value, onChange, title = 'Product Configuration', disabled = false, error, savedKeys = [] }: {
  value: ProductConfiguration; onChange: (value: ProductConfiguration) => void;
  title?: string; disabled?: boolean; error?: string; savedKeys?: string[];
}) {
  const id = useId();
  // UI identities are independent of editable API keys/values, preserving input focus.
  const [fieldIds, setFieldIds] = useState(() => Array.isArray(value?.fields) ? value.fields.map(() => crypto.randomUUID()) : []);
  const [savedFieldIds] = useState(() => new Set(fieldIds.filter((_, index) => savedKeys.includes(value.fields[index]?.key))));
  const [optionIds, setOptionIds] = useState(() => Array.isArray(value?.fields)
    ? value.fields.map((field) => Array.isArray(field?.options) ? field.options.map(() => crypto.randomUUID()) : [])
    : []);
  const [savedOptionIds] = useState(() => new Set(optionIds.flatMap((ids, index) => savedFieldIds.has(fieldIds[index]) ? ids : [])));
  const malformed = validateConfiguration(value);
  const safeShape = typeof value?.enabled === 'boolean' && Array.isArray(value?.fields) && value.fields.every((field) =>
    field && field.type === 'select' && typeof field.label === 'string' && typeof field.key === 'string' &&
    typeof field.required === 'boolean' && typeof field.isActive === 'boolean' && Array.isArray(field.options) &&
    field.options.every((option) => option && typeof option.label === 'string' && typeof option.value === 'string' && typeof option.priceModifier === 'number' && typeof option.isActive === 'boolean'));
  const changeField = (index: number, patch: Partial<ProductConfigurationField>) =>
    onChange({ ...value, fields: value.fields.map((field, i) => i === index ? { ...field, ...patch } : field) });
  if (!safeShape) return <div className="product-extension-section"><strong>{title}</strong><p role="alert" className="product-extension-error">Saved configuration has an unsupported structure. It will be preserved during unrelated edits. {malformed}</p></div>;
  return <fieldset className="product-extension-section" disabled={disabled}>
    <legend>{title}</legend>
    <label className="product-extension-check"><input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} /> Enable product configuration</label>
    <p className="product-extension-help">Configure this product’s choices and unit price modifiers. The backend applies modifiers to the cart unit price; quantity pricing is configured separately. Saved keys and option values are locked to preserve customer selections. Mark saved options inactive instead of removing them. Add a new option when its identifier must change.</p>
    {value.fields.map((field, index) => <div className="product-configuration-field" key={fieldIds[index] ?? index}>
      <div className="product-extension-toolbar"><strong>Field {index + 1}</strong><button type="button" className="btn-ghost" aria-label={`Remove field ${index + 1}`} onClick={() => {
        if (savedFieldIds.has(fieldIds[index]) && !window.confirm('Remove this saved field? Existing customer selections may reference its key.')) return;
        setFieldIds((ids) => ids.filter((_, i) => i !== index));
        setOptionIds((ids) => ids.filter((_, i) => i !== index));
        onChange({ ...value, fields: value.fields.filter((_, i) => i !== index) });
      }}><Trash2 size={14} /> Remove field</button></div>
      <div className="product-extension-grid">
        <label className="form-label">Field label<input className="input-field" value={field.label} onChange={(event) => changeField(index, { label: event.target.value })} /></label>
        <label className="form-label">Stable key<input className="input-field" value={field.key} readOnly={savedFieldIds.has(fieldIds[index])} title={savedFieldIds.has(fieldIds[index]) ? 'Saved keys are locked to preserve customer references.' : undefined} onChange={(event) => changeField(index, { key: event.target.value })} /></label>
      </div>
      <div className="product-extension-toolbar">
        <label className="product-extension-check"><input type="checkbox" checked={field.required} onChange={(event) => changeField(index, { required: event.target.checked })} /> Required</label>
        <label className="product-extension-check"><input type="checkbox" checked={field.isActive} onChange={(event) => changeField(index, { isActive: event.target.checked })} /> Active field</label>
        <span className="product-extension-help">Select field</span>
      </div>
      {field.options.map((option, optionIndex) => <div key={optionIds[index]?.[optionIndex] ?? optionIndex} className="product-configuration-option">
        <label className="form-label" htmlFor={`${id}-${index}-${optionIndex}-label`}>Option label<input id={`${id}-${index}-${optionIndex}-label`} className="input-field" value={option.label} onChange={(event) => changeField(index, { options: field.options.map((entry, i) => i === optionIndex ? { ...entry, label: event.target.value } : entry) })} /></label>
        <label className="form-label">Stable value<input className="input-field" value={option.value}
          readOnly={savedOptionIds.has(optionIds[index]?.[optionIndex])}
          title={savedOptionIds.has(optionIds[index]?.[optionIndex]) ? 'Saved option values are locked. Add a new option to use a different identifier.' : undefined}
          onChange={(event) => {
            if (savedOptionIds.has(optionIds[index]?.[optionIndex])) return;
            changeField(index, { options: field.options.map((entry, i) => i === optionIndex ? { ...entry, value: event.target.value } : entry) });
          }} /></label>
        <label className="form-label">Unit price modifier (₹)<input className="input-field" type="number" step="any" value={Number.isFinite(option.priceModifier) ? option.priceModifier : ''} onChange={(event) => changeField(index, { options: field.options.map((entry, i) => i === optionIndex ? { ...entry, priceModifier: event.target.value === '' ? NaN : Number(event.target.value) } : entry) })} /></label>
        <label className="product-extension-check"><input type="checkbox" checked={option.isActive} onChange={(event) => changeField(index, { options: field.options.map((entry, i) => i === optionIndex ? { ...entry, isActive: event.target.checked } : entry) })} /> Active</label>
        <button type="button" className="btn-ghost" aria-label={`Remove option ${optionIndex + 1} from field ${index + 1}`}
          disabled={savedOptionIds.has(optionIds[index]?.[optionIndex])}
          title={savedOptionIds.has(optionIds[index]?.[optionIndex]) ? 'Saved options cannot be removed. Mark this option inactive instead.' : undefined}
          onClick={() => {
          if (savedOptionIds.has(optionIds[index]?.[optionIndex])) return;
          setOptionIds((ids) => ids.map((entries, i) => i === index ? entries.filter((_, j) => j !== optionIndex) : entries));
          changeField(index, { options: field.options.filter((_, i) => i !== optionIndex) });
        }}><Trash2 size={14} /></button>
      </div>)}
      <button type="button" className="btn-ghost" onClick={() => {
        setOptionIds((ids) => ids.map((entries, i) => i === index ? [...entries, crypto.randomUUID()] : entries));
        changeField(index, { options: [...field.options, { label: '', value: '', priceModifier: 0, isActive: true }] });
      }}><Plus size={14} /> Add option</button>
    </div>)}
    <button type="button" className="btn-ghost" onClick={() => {
      setFieldIds((ids) => [...ids, crypto.randomUUID()]);
      setOptionIds((ids) => [...ids, []]);
      onChange({ ...value, fields: [...value.fields, { key: '', label: '', type: 'select', required: true, isActive: true, options: [] }] });
    }}><Plus size={14} /> Add field</button>
    {error && <p role="alert" className="product-extension-error">{error}</p>}
  </fieldset>;
}
