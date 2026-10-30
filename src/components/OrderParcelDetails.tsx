import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, ChevronRight, Info, Loader2, Package, Truck } from 'lucide-react';
import { toast } from 'sonner';
import PackageDetailsForm from './PackageDetailsForm';
import { packageDraft, type PackageDraft } from '../lib/productConfiguration';
import { canPrepareOrderShipment, confirmCourierAndApprove, courierDeliveryEstimate, parcelErrors, parcelFromDraft, sameParcel } from '../lib/orderFulfillment';
import { getCourierQuotes } from '../services/orderService';
import type { CourierOption, PackageDetails } from '../types';

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export function CourierQuoteOptions({ couriers, selectedCourier, onSelect, disabled = false }: {
  couriers: CourierOption[]; selectedCourier: CourierOption | null; onSelect: (courier: CourierOption) => void; disabled?: boolean;
}) {
  return <div className="order-courier-options" role="group" aria-label="Available courier services">
    {couriers.map((courier) => <button type="button" disabled={disabled}
      className={`card card-hover order-courier-option${selectedCourier?.courierId === courier.courierId ? ' is-selected' : ''}`}
      key={`${typeof courier.courierId}:${courier.courierId}`} aria-pressed={selectedCourier?.courierId === courier.courierId}
      onClick={() => onSelect(courier)}>
      <Truck size={20} aria-hidden="true" />
      <span className="order-courier-service"><strong>{courier.courierName}</strong><span>{courier.serviceType || 'Service type not provided'}</span><small>{courierDeliveryEstimate(courier)}</small></span>
      <span className="order-courier-charge"><small>Delivery charge</small><strong>{currency.format(courier.rate)}</strong></span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>)}
  </div>;
}

function requestError(error: unknown, fallback: string, quoteRequest = false) {
  const issue = error as { response?: { status?: number; data?: { message?: unknown } }; message?: unknown };
  if (quoteRequest && (issue?.response?.status ?? 0) >= 500) return 'Server error. Please try again.';
  const message = issue?.response?.data?.message ?? issue?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function CourierConfirmation({ courier, busy, error, onCancel, onConfirm }: {
  courier: CourierOption; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={dialogRef} className="modal-backdrop orders-delete-modal-backdrop"
    aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (!busy) onCancel();
      }
    }}>
    <div className="modal-box">
      <h3 id={`${id}-title`} className="section-title">Confirm Courier Selection</h3>
      <p id={`${id}-description`} className="product-extension-help">You’re about to assign this shipment to a courier partner. Shiprocket will charge your connected wallet when the backend books the shipment. The quote below is the returned delivery charge; final billing follows Shiprocket’s terms.</p>
      <dl className="order-courier-summary">
        <div><dt>Courier</dt><dd>{courier.courierName}</dd></div>
        <div><dt>Service</dt><dd>{courier.serviceType || 'Not provided'} · {courierDeliveryEstimate(courier)}</dd></div>
        <div><dt>Charge</dt><dd className="order-courier-price">{currency.format(courier.rate)}</dd></div>
      </dl>
      <p className="product-extension-help" style={{ color: 'var(--warning)' }}>Confirming creates a shipment and can incur wallet charges. Cancel here to keep reviewing services.</p>
      {error && <p className="product-extension-error" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 20 }}>
        <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel} autoFocus>Cancel</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
          {busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Processing...' : 'Yes, confirm & ship'}
        </button>
      </div>
    </div>
  </dialog>;
}

type BookingResult = Awaited<ReturnType<typeof confirmCourierAndApprove>>;

export default function OrderParcelDetails({ orderId, value, paymentStatus, orderStatus, hasShipment = false, disabled = false, onApproved, onBusyChange }: {
  orderId: string; value?: PackageDetails; paymentStatus: string; orderStatus: string;
  hasShipment?: boolean; disabled?: boolean;
  onApproved?: (result: BookingResult) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => packageDraft(value));
  const [touched, setTouched] = useState<Partial<Record<keyof PackageDraft, boolean>>>({});
  const [savedParcel, setSavedParcel] = useState<PackageDetails | null>(value ?? null);
  const [quoteParcel, setQuoteParcel] = useState<PackageDetails | null>(null);
  const [couriers, setCouriers] = useState<CourierOption[]>([]);
  const [quotesState, setQuotesState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [quotesError, setQuotesError] = useState('');
  const [selectedCourier, setSelectedCourier] = useState<CourierOption | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [briefSuccess, setBriefSuccess] = useState(false);
  const [completed, setCompleted] = useState(false);
  const requestRef = useRef(0);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const eligible = canPrepareOrderShipment(paymentStatus, orderStatus, hasShipment) && !completed;
  const eligibleRef = useRef(eligible);
  eligibleRef.current = eligible;
  const validation = parcelErrors(draft);
  const invalid = Object.keys(validation).length > 0;
  const visibleErrors = Object.fromEntries(Object.entries(validation).filter(([key]) => touched[key as keyof PackageDraft]));
  const busy = quotesState === 'loading' || confirmLoading;
  const controlsDisabled = disabled || !eligible || busy;
  const readyToConfirm = !invalid && !!savedParcel && !!quoteParcel && !!selectedCourier &&
    sameParcel(quoteParcel, parcelFromDraft(draft)) && couriers.includes(selectedCourier);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current += 1; };
  }, []);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => {
    if (!briefSuccess) return;
    const timer = window.setTimeout(() => setBriefSuccess(false), 2000);
    return () => window.clearTimeout(timer);
  }, [briefSuccess]);
  useEffect(() => {
    if (!eligible && !confirmLoading) setShowConfirmModal(false);
  }, [eligible, confirmLoading]);

  const updateDraft = (next: PackageDraft) => {
    if (controlsDisabled || inFlightRef.current) return;
    requestRef.current += 1;
    setDraft(next);
    setSavedParcel(null);
    setQuoteParcel(null);
    setCouriers([]);
    setQuotesState('idle');
    setSelectedCourier(null);
    setShowConfirmModal(false);
    setQuotesError('');
    setConfirmError('');
    setBriefSuccess(false);
  };

  const prepareShipment = async () => {
    if (inFlightRef.current || disabled || !eligibleRef.current) return;
    setTouched({ weight: true, length: true, breadth: true, height: true });
    if (invalid) return;
    const parcel = parcelFromDraft(draft);
    const requestId = ++requestRef.current;
    const current = () => mountedRef.current && requestId === requestRef.current && eligibleRef.current;
    inFlightRef.current = true;
    setQuotesState('loading');
    setQuotesError('');
    setCouriers([]);
    setQuoteParcel(null);
    setSelectedCourier(null);
    setBriefSuccess(false);
    try {
      const options = await getCourierQuotes(orderId, parcel);
      if (!current()) return;
      setSavedParcel(parcel);
      setQuoteParcel(parcel);
      setCouriers(options);
      setQuotesState('success');
      setBriefSuccess(true);
    } catch (issue) {
      if (current()) {
        const message = requestError(issue, 'Could not load courier services. Please try again.', true);
        setQuotesError(message);
        setQuotesState('error');
        toast.error(message);
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current && requestId === requestRef.current) setQuotesState((state) => state === 'loading' ? 'idle' : state);
    }
  };

  const selectCourier = (courier: CourierOption) => {
    if (controlsDisabled || !quoteParcel || !couriers.includes(courier)) return;
    setSelectedCourier(courier);
    setConfirmError('');
    setShowConfirmModal(true);
  };

  const approveSelection = async () => {
    if (inFlightRef.current || disabled || !eligibleRef.current || !readyToConfirm || !showConfirmModal) return;
    inFlightRef.current = true;
    setConfirmLoading(true);
    setConfirmError('');
    try {
      const result = await confirmCourierAndApprove(orderId, selectedCourier.courierId, orderStatus === 'placed');
      if (!mountedRef.current) return;
      setCompleted(true);
      setShowConfirmModal(false);
      const summary = `${result.shipment.courierName || selectedCourier.courierName} assigned. AWB: ${result.shipment.awb || 'Pending'}`;
      if (result.approvalFailed) toast.warning(`Shipment booked (${summary}), but order approval failed. Please approve manually.`);
      else toast.success(`Order confirmed — ${summary}`);
      onApproved?.(result);
    } catch (issue) {
      if (mountedRef.current) {
        const message = `Failed to confirm courier: ${requestError(issue, 'Please try again.')}`;
        setConfirmError(message);
        toast.error(message);
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setConfirmLoading(false);
    }
  };

  return <section className="order-parcel-workflow" aria-labelledby={`${id}-title`} aria-label="Order parcel details">
    <header className="order-parcel-heading">
      <div><p className="orders-eyebrow">Order shipping</p><h3 id={`${id}-title`}>Parcel & courier selection</h3><p>Prepare this order’s packed parcel, review courier charges, then confirm the service.</p></div>
      <span className="badge-active">Shiprocket couriers</span>
    </header>
    <ol className="order-parcel-steps" aria-label="Shipping approval steps">
      <li><span>1</span> Packed parcel</li><li><span>2</span> Courier quotes</li><li><span>3</span> Confirm & approve</li>
    </ol>
    {!eligible && <p className="order-parcel-notice">{paymentStatus !== 'paid' ? 'Payment must be completed before preparing the shipment.' : hasShipment || completed ? 'A shipment is already booked for this order. Use the Shiprocket workspace for tracking, pickup and labels.' : 'This order is already approved or closed. Parcel and courier approval controls are read-only.'}</p>}
    <div className="order-parcel-columns">
      <div className="order-parcel-measurements">
        <PackageDetailsForm title="1. Packed parcel measurements" value={draft} required disabled={controlsDisabled}
          onChange={updateDraft} onBlur={(key) => setTouched((current) => ({ ...current, [key]: true }))} fieldErrors={visibleErrors} />
        <button type="button" className="btn-primary" disabled={controlsDisabled || invalid} onClick={() => void prepareShipment()}>
          {quotesState === 'loading' ? <Loader2 size={16} className="animate-spin" /> : <Package size={16} />}
          {quotesState === 'loading' ? 'Fetching quotes...' : 'Save parcel & get courier quotes'}
        </button>
        <p className="product-extension-help" aria-live="polite" style={savedParcel ? { color: 'var(--success)' } : undefined}>{savedParcel ? 'Measurements saved ✓' : 'Measurements have not been saved.'}</p>
        {briefSuccess && <p role="status" className="product-extension-help" style={{ color: 'var(--success)' }}>Parcel saved · quotes loaded</p>}
      </div>
      <section className="order-parcel-couriers" aria-labelledby={`${id}-couriers`} aria-busy={quotesState === 'loading'}>
        <h4 id={`${id}-couriers`}>2. Available courier services</h4>
        <p className="product-extension-help">Compare the returned delivery charges and services for this packed parcel.</p>
        {quotesState === 'loading' ? <div role="status" className="order-parcel-empty"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />Fetching available couriers...</div>
          : quotesState === 'error' ? <div className="order-parcel-empty"><p className="product-extension-error" role="alert">Could not fetch courier quotes. {quotesError}</p><button type="button" className="btn-ghost" disabled={controlsDisabled || invalid} onClick={() => void prepareShipment()}>Try again</button></div>
          : quotesState === 'success' && couriers.length ? <CourierQuoteOptions couriers={couriers} selectedCourier={selectedCourier} onSelect={selectCourier} disabled={controlsDisabled} />
          : <div className="order-parcel-empty">{quotesState === 'success' ? <Info size={28} /> : <Truck size={28} />}
            <strong>{quotesState === 'success' ? 'No courier services available' : 'Courier quotes will appear here'}</strong>
            <p>{quotesState === 'success' ? 'No courier services are available for this delivery address and parcel size. Please check the dimensions or contact support.' : 'Save the parcel and request rates to see courier providers, service names, delivery charges and estimates.'}</p>
          </div>}
      </section>
    </div>
    <footer className="order-parcel-approval">
      <div><h4>3. Confirm courier & approve</h4><p>{selectedCourier ? `${selectedCourier.courierName} · ${currency.format(selectedCourier.rate)}` : 'Choose a returned courier service after the parcel has been saved.'}</p><small>Carrier charges are separate from the delivery fee already paid by the customer. Shipment creation and AWB assignment are handled by the backend.</small></div>
      <button type="button" className="btn-primary" disabled={controlsDisabled || !readyToConfirm} onClick={() => { setConfirmError(''); setShowConfirmModal(true); }}>
        <CheckCircle2 size={16} />Confirm courier & approve order
      </button>
    </footer>
    {showConfirmModal && selectedCourier && <CourierConfirmation courier={selectedCourier} busy={confirmLoading} error={confirmError}
      onCancel={() => { if (!inFlightRef.current) setShowConfirmModal(false); }} onConfirm={() => void approveSelection()} />}
  </section>;
}
