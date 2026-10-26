import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Package, Truck } from 'lucide-react';
import PackageDetailsForm from './PackageDetailsForm';
import { packageDraft, validatePackage, type PackageDraft } from '../lib/productConfiguration';
import {
  canPrepareOrderShipment,
  courierApprovalSelection,
  parcelFromDraft,
  saveParcelAndLoadQuotes,
  type OrderCourierQuotes,
  type OrderFulfillmentAdapter,
} from '../lib/orderFulfillment';
import type { PackageDetails } from '../types';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export function CourierQuoteOptions({ quotes, selectedId, onSelect, disabled = false }: {
  quotes: OrderCourierQuotes; selectedId: string; onSelect: (id: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return <fieldset className="order-courier-options" disabled={disabled}>
    <legend className="sr-only">Available courier services</legend>
    {quotes.couriers.map((courier) => <label className={`order-courier-option${selectedId === courier.id ? ' is-selected' : ''}`} key={courier.id}>
      <input type="radio" name={`${id}-courier`} value={courier.id} checked={selectedId === courier.id} onChange={() => onSelect(courier.id)} />
      <span className="order-courier-service"><strong>{courier.courierName}</strong><span>{courier.serviceName}</span><small>{courier.estimatedDelivery || 'Delivery estimate not provided'}</small></span>
      <span className="order-courier-charge"><small>Delivery charge</small><strong>{currency.format(courier.deliveryCharge)}</strong></span>
    </label>)}
  </fieldset>;
}

function errorMessage(error: unknown, fallback: string) {
  const issue = error as { response?: { data?: { message?: unknown } }; message?: unknown };
  const message = issue?.response?.data?.message ?? issue?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export default function OrderParcelDetails({ orderId, value, paymentStatus, orderStatus, disabled = false, adapter, onApproved, onBusyChange }: {
  orderId: string;
  value?: PackageDetails;
  paymentStatus: string;
  orderStatus: string;
  disabled?: boolean;
  // Supply only after the backend contract is documented and connected.
  adapter?: OrderFulfillmentAdapter;
  onApproved?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => packageDraft(value));
  const [touched, setTouched] = useState(false);
  const [savedParcel, setSavedParcel] = useState<PackageDetails | null>(null);
  const [quotes, setQuotes] = useState<OrderCourierQuotes | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState<'preparing' | 'approving' | null>(null);
  const [error, setError] = useState('');
  const [approved, setApproved] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const requestRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const eligible = canPrepareOrderShipment(paymentStatus, orderStatus) && !approved;
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;
  const validationError = touched ? validatePackage(draft, true) : null;
  const quoteExpired = !!quotes && Date.parse(quotes.expiresAt) <= clock;
  const selectedCourier = quotes?.couriers.find((courier) => courier.id === selectedId);
  const controlsDisabled = disabled || !eligible || !!busy;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current += 1; };
  }, []);

  useEffect(() => { onBusyChange?.(busy !== null); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);

  useEffect(() => {
    if (!quotes) return;
    const remaining = Date.parse(quotes.expiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(Math.max(remaining + 1, 0), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [quotes, clock]);

  const updateDraft = (next: PackageDraft) => {
    requestRef.current += 1;
    setDraft(next);
    setSavedParcel(null);
    setQuotes(null);
    setSelectedId('');
    setError('');
  };

  const prepareShipment = async () => {
    if (!adapter || inFlightRef.current || disabled || !eligibleRef.current) return;
    setTouched(true);
    const validation = validatePackage(draft, true);
    if (validation) return;
    const requestId = ++requestRef.current;
    const current = () => mountedRef.current && requestId === requestRef.current && eligibleRef.current;
    inFlightRef.current = true;
    setBusy('preparing');
    setError('');
    setQuotes(null);
    setSelectedId('');
    try {
      const nextQuotes = await saveParcelAndLoadQuotes(adapter, orderId, parcelFromDraft(draft), (saved) => {
        if (current()) setSavedParcel(saved);
      });
      if (!current()) return;
      setClock(Date.now());
      setQuotes(nextQuotes);
    } catch (issue) {
      if (current()) setError(errorMessage(issue, 'Could not save the parcel and load courier services. Please try again.'));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const approveSelection = async () => {
    if (!adapter || !quotes || !savedParcel || inFlightRef.current || disabled || !eligibleRef.current) return;
    setError('');
    try {
      const selection = courierApprovalSelection(quotes, selectedId, draft, Date.now(), orderId);
      const requestId = ++requestRef.current;
      inFlightRef.current = true;
      setBusy('approving');
      await adapter.approveWithCourier(orderId, selection);
      if (!mountedRef.current || requestId !== requestRef.current || !eligibleRef.current) return;
      setApproved(true);
      onApproved?.();
    } catch (issue) {
      if (mountedRef.current) setError(errorMessage(issue, 'Could not approve this order with the selected courier.'));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  return <section className="order-parcel-workflow" aria-labelledby={`${id}-title`} aria-label="Order parcel details">
    <header className="order-parcel-heading">
      <div><p className="orders-eyebrow">Before order approval</p><h3 id={`${id}-title`}>Parcel & courier selection</h3><p>Prepare this order’s packed parcel, review courier charges, then confirm the service.</p></div>
      <span className={adapter ? 'badge-active' : 'badge-inactive'}>{adapter ? 'Order shipping' : 'Backend integration pending'}</span>
    </header>
    <ol className="order-parcel-steps" aria-label="Shipping approval steps">
      <li><span>1</span> Packed parcel</li><li><span>2</span> Courier quotes</li><li><span>3</span> Confirm & approve</li>
    </ol>
    {!adapter && <p className="order-parcel-notice" role="status">You can enter and check the measurements here. Saving them, getting Shiprocket rates and approving with a selected courier will be available after backend integration. Entries remain unsaved and are cleared when this dialog closes.</p>}
    {!eligible && !approved && <p className="order-parcel-notice">{orderStatus === 'placed' ? 'Payment must be completed before preparing the shipment.' : 'This order is already approved or closed. Parcel and courier approval controls are read-only.'}</p>}
    <div className="order-parcel-columns">
      <div className="order-parcel-measurements">
        <PackageDetailsForm title="1. Packed parcel measurements" value={draft} required disabled={controlsDisabled}
          onChange={updateDraft} onBlur={() => setTouched(true)} error={validationError ?? undefined} />
        <p className="product-extension-help" aria-live="polite">{savedParcel ? 'Parcel measurements saved and verified for this order.' : value && !touched ? 'Measurements returned with this order. Confirm the actual packed parcel before requesting rates.' : 'Measurements have not been saved.'}</p>
        <button type="button" className="btn-primary" disabled={controlsDisabled || !adapter} onClick={() => void prepareShipment()}>
          {busy === 'preparing' ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
          {busy === 'preparing' ? 'Saving parcel & loading couriers…' : 'Save parcel & get courier quotes'}
        </button>
      </div>
      <section className="order-parcel-couriers" aria-labelledby={`${id}-couriers`}>
        <h4 id={`${id}-couriers`}>2. Available courier services</h4>
        <p className="product-extension-help">Compare the returned delivery charges and services for this packed parcel.</p>
        {busy === 'preparing' ? <p role="status" className="order-parcel-empty"><Loader2 size={22} className="animate-spin" />Loading courier quotes…</p>
          : quotes?.couriers.length ? <CourierQuoteOptions quotes={quotes} selectedId={selectedId} onSelect={setSelectedId} disabled={controlsDisabled || quoteExpired} />
          : <div className="order-parcel-empty"><Truck size={28} /><strong>{quotes ? 'No courier services available' : 'Courier quotes will appear here'}</strong><p>{quotes ? 'No services were returned for this parcel. Review the measurements and destination, then request rates again.' : 'Save the parcel and request rates to see courier providers, service names, delivery charges and estimates.'}</p></div>}
        {quoteExpired && <p className="product-extension-error" role="alert">Courier quotes have expired. Request fresh quotes before approving.</p>}
      </section>
    </div>
    {error && <p className="product-extension-error" role="alert">{error}</p>}
    <footer className="order-parcel-approval">
      <div><h4>3. Confirm courier & approve</h4><p>{selectedCourier ? `${selectedCourier.courierName} · ${selectedCourier.serviceName} · ${currency.format(selectedCourier.deliveryCharge)}` : 'Choose a returned courier service after the parcel has been saved.'}</p><small>Carrier charges are separate from the delivery fee already paid by the customer. AWB, pickup and tracking follow approval.</small></div>
      <button type="button" className="btn-primary" disabled={controlsDisabled || !adapter || !savedParcel || !selectedCourier || quoteExpired} onClick={() => void approveSelection()}>
        {busy === 'approving' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {approved ? 'Approved with selected courier' : busy === 'approving' ? 'Approving…' : 'Confirm courier & approve order'}
      </button>
    </footer>
  </section>;
}
