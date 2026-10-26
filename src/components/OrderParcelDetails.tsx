import PackageDetailsForm from './PackageDetailsForm';
import { packageDraft } from '../lib/productConfiguration';
import type { PackageDetails } from '../types';

export default function OrderParcelDetails({ value }: { value?: PackageDetails }) {
  return <section aria-label="Order parcel details">
    <PackageDetailsForm title="Parcel Details — Weight & Dimensions" value={packageDraft(value)} disabled required />
    <p className="product-extension-help" role="status">
      {value ? 'These measurements were returned on this order. Their use by Shiprocket has not been verified. ' : ''}
      Saving order-specific parcel measurements is unavailable because the backend has no documented save contract.
      Product package defaults are separate from the final order parcel. The existing approval and shipment workflow remains available.
    </p>
    <button type="button" className="btn-ghost" disabled title="Requires a documented backend API for saving this order’s parcel measurements">Save Parcel Details — unavailable</button>
  </section>;
}
