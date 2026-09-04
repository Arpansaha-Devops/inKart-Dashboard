import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, FileText, Loader2, MapPin, Package, Radio, RefreshCw, Search, Truck, X } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { cancelShipment, getShipmentDetails, getShipmentLabel, getShipmentManifest, getShiprocketTracking, normalizeShiprocketData, schedulePickup, syncShipment, type ShiprocketData, type ShiprocketTrackingResult } from '../services/orderService';

type Order = { _id: string; number: string; customer: string; createdAt: string; orderStatus: string; paymentStatus: string; shipment: ShiprocketData | null };
const dateFormatter = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const str = (value: unknown) => typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
const normalizeStatus = (value?: string | null) => (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const terminalShipmentStatuses = new Set(['delivered', 'cancelled', 'canceled', 'returned', 'rto_delivered']);
const terminalOrderStatuses = new Set(['delivered', 'cancelled', 'canceled', 'returned']);
const approvedOrderStatuses = new Set(['confirmed', 'processing', 'shipped']);
const isTerminalShipment = (value?: string | null) => terminalShipmentStatuses.has(normalizeStatus(value));
const isNumericStatus = (value?: string | null) => /^\d+$/.test((value || '').trim());
const hasShipmentReference = (value?: ShiprocketData | null) => Boolean(value?.awbCode || value?.shipmentId || value?.shiprocketOrderId);
const hasShipmentData = (value: ShiprocketData) => Object.values(value).some((field) => field !== null && field !== '');
const formatDate = (value?: string | null) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? dateFormatter.format(date) : '—'; };
const getHttpStatus = (error: unknown) => { const status = record(record(error).response).status; return typeof status === 'number' ? status : Number(status) || null; };
const getErrorMessage = (error: unknown, fallback: string) => { const source = record(error); const data = record(record(source.response).data); return str(data.message || data.error || source.message) || fallback; };

const parseOrders = (values: unknown[]): Order[] => values.reduce<Order[]>((orders, raw) => {
  const value = record(raw); const customer = record(value.customer); const user = record(value.user); const shipment = normalizeShiprocketData(value);
  const order = {
    _id: str(value._id || value.id), number: str(value.orderNumber || value.orderId || value._id),
    customer: str(customer.name || user.name || value.customerName) || 'Customer', createdAt: str(value.createdAt),
    orderStatus: normalizeStatus(str(value.orderStatus || value.status)), paymentStatus: normalizeStatus(str(value.paymentStatus)),
    shipment: hasShipmentData(shipment) ? shipment : null,
  };
  if (order._id && (!order.paymentStatus || order.paymentStatus === 'paid')) orders.push(order);
  return orders;
}, []);

const openRemoteDocument = async (getUrl: () => Promise<string | null>) => {
  const popup = window.open('about:blank', '_blank');
  if (!popup) throw new Error('Browser blocked the new tab. Allow pop-ups and try again.');
  try { popup.opener = null; const url = await getUrl(); if (!url) throw new Error('The document URL is not available yet.'); popup.location.replace(url); }
  catch (error) { popup.close(); throw error; }
};

type ShipmentViewState = { shipment: ShiprocketData | null; tracking: ShiprocketTrackingResult | null; detailsLoading: boolean; detailsUnavailable: boolean; loadError: string | null; trackingError: string | null; busy: string | null };
type ShipmentViewAction =
  | { type: 'patch'; payload: Partial<ShipmentViewState> }
  | { type: 'update-shipment'; update: (shipment: ShiprocketData | null) => ShiprocketData | null };
const shipmentViewReducer = (state: ShipmentViewState, action: ShipmentViewAction): ShipmentViewState =>
  action.type === 'update-shipment' ? { ...state, shipment: action.update(state.shipment) } : { ...state, ...action.payload };
const initialShipmentViewState: ShipmentViewState = { shipment: null, tracking: null, detailsLoading: false, detailsUnavailable: false, loadError: null, trackingError: null, busy: null };

export default function ShipmentTracking() {
  const [searchParams] = useSearchParams();
  const requestedOrderId = searchParams.get('orderId')?.trim() || '';
  const [orders, setOrders] = useState<Order[]>([]); const [selectedId, setSelectedId] = useState(requestedOrderId); const [query, setQuery] = useState('');
  const [shipmentView, dispatchShipmentView] = useReducer(shipmentViewReducer, initialShipmentViewState);
  const { shipment, tracking, detailsLoading, detailsUnavailable, loadError, trackingError, busy } = shipmentView;
  const [ordersLoading, setOrdersLoading] = useState(true);
  const shipmentRequestRef = useRef(0); const ordersRequestRef = useRef(0); const selectedIdRef = useRef(requestedOrderId);
  const selected = orders.find((order) => order._id === selectedId);

  const loadOrders = useCallback(async () => {
    const requestId = ++ordersRequestRef.current; setOrdersLoading(true);
    try {
      const collected: unknown[] = []; const limit = 100; let page = 1; let totalPages = 1;
      do {
        const response = await apiClient.get('/admin/orders', { params: { page, limit, paymentStatus: 'paid' } });
        const root = record(response.data); const data = record(root.data);
        const values = Array.isArray(root.orders) ? root.orders : Array.isArray(data.orders) ? data.orders : Array.isArray(root.data) ? root.data : [];
        const pagination = Object.keys(record(root.pagination)).length ? record(root.pagination) : record(data.pagination);
        const parsedPages = Number(pagination.pages || pagination.totalPages || 1);
        collected.push(...values); totalPages = Number.isFinite(parsedPages) && parsedPages > 0 ? parsedPages : 1; page += 1;
      } while (page <= totalPages);
      if (requestId !== ordersRequestRef.current) return;
      const unique = new Map<string, Order>(); parseOrders(collected).forEach((order) => unique.set(order._id, order)); const nextOrders = Array.from(unique.values()); setOrders(nextOrders);
      const currentSelectedId = selectedIdRef.current;
      if (
        currentSelectedId &&
        !nextOrders.some((order) => order._id === currentSelectedId)
      ) {
        selectedIdRef.current = '';
        setSelectedId('');
      }
    } catch (error) { if (requestId === ordersRequestRef.current) toast.error(getErrorMessage(error, 'Could not load orders')); }
    finally {
      setOrdersLoading((isLoading) =>
        requestId === ordersRequestRef.current ? false : isLoading
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    const orderId = selectedId; if (!orderId) { dispatchShipmentView({ type: 'patch', payload: { shipment: null, tracking: null } }); return; }
    const requestId = ++shipmentRequestRef.current; const snapshot = orders.find((order) => order._id === orderId)?.shipment ?? null;
    dispatchShipmentView({ type: 'patch', payload: { detailsLoading: true, loadError: null, trackingError: null } }); let nextShipment = snapshot; let detailsFailed = false; let detailsError: string | null = null;
    try {
    try { nextShipment = await getShipmentDetails(orderId); }
    catch (error) {
      const expectedMissing = getHttpStatus(error) === 404 && !hasShipmentReference(snapshot); detailsFailed = !expectedMissing; nextShipment = expectedMissing ? null : snapshot;
      if (detailsFailed) detailsError = getErrorMessage(error, 'Could not load shipment details');
    }
    if (requestId !== shipmentRequestRef.current || selectedIdRef.current !== orderId) return;
    dispatchShipmentView({ type: 'patch', payload: { shipment: nextShipment, detailsUnavailable: detailsFailed, loadError: detailsError } });
    if (hasShipmentReference(nextShipment)) {
      try { const nextTracking = await getShiprocketTracking(orderId); if (requestId !== shipmentRequestRef.current || selectedIdRef.current !== orderId) return; dispatchShipmentView({ type: 'patch', payload: { tracking: nextTracking } }); }
      catch (error) { if (requestId !== shipmentRequestRef.current || selectedIdRef.current !== orderId) return; dispatchShipmentView({ type: 'patch', payload: { tracking: null, trackingError: getErrorMessage(error, 'Live tracking is currently unavailable') } }); }
    } else dispatchShipmentView({ type: 'patch', payload: { tracking: null } });
    } finally {
      if (requestId === shipmentRequestRef.current && selectedIdRef.current === orderId) dispatchShipmentView({ type: 'patch', payload: { detailsLoading: false } });
    }
  }, [orders, selectedId]);

  useEffect(() => { void loadOrders(); return () => { ordersRequestRef.current += 1; }; }, [loadOrders]);
  useEffect(() => {
    shipmentRequestRef.current += 1; dispatchShipmentView({ type: 'patch', payload: { shipment: selected?.shipment ?? null, tracking: null, loadError: null, trackingError: null, detailsUnavailable: false, detailsLoading: false } });
    if (selectedId) void refresh(); return () => { shipmentRequestRef.current += 1; };
  }, [refresh, selected?.shipment, selectedId]);

  const trackingStatus = tracking?.currentStatus?.trim() || null; const storedStatus = shipment?.shipmentStatus?.trim() || null;
  const status = trackingStatus && !isNumericStatus(trackingStatus) ? trackingStatus : storedStatus || trackingStatus;
  const displayStatus = isNumericStatus(status) ? `Shiprocket status code ${status}` : status; const awb = shipment?.awbCode || tracking?.awbCode; const liveTrackingUrl = tracking?.trackingUrl || shipment?.trackingUrl;
  const hasBooking = hasShipmentReference(shipment) || Boolean(tracking?.awbCode); const orderStatus = normalizeStatus(selected?.orderStatus); const paymentStatus = normalizeStatus(selected?.paymentStatus);
  const pickupHandled = Boolean(shipment?.pickupScheduled || shipment?.pickupScheduledDate || tracking?.activities.some((activity) => {
    const eventStatus = normalizeStatus(activity.status); const eventText = normalizeStatus(`${activity.status} ${activity.activity}`);
    return eventStatus === 'picked' || eventStatus === 'on_hold' || eventStatus === 'rts' || eventStatus.startsWith('recd_') || eventText.includes('picked_successfully');
  }));
  const isPaid = !paymentStatus || paymentStatus === 'paid'; const isApproved = approvedOrderStatuses.has(orderStatus); const isOrderTerminal = terminalOrderStatuses.has(orderStatus);
  const canManageShipment = Boolean(selectedId) && isPaid && isApproved && !isOrderTerminal; const canMutateShipment = canManageShipment && !isTerminalShipment(status); const canSyncShipment = canMutateShipment && !detailsUnavailable;

  useEffect(() => { if (!hasBooking || isOrderTerminal || isTerminalShipment(status)) return; const timerId = window.setInterval(() => void refresh(), 30_000); return () => window.clearInterval(timerId); }, [hasBooking, isOrderTerminal, refresh, status]);
  const run = async (name: string, action: (orderId: string) => Promise<void>, refreshAfter = true) => {
    const orderId = selectedId; if (!orderId || busy) return; dispatchShipmentView({ type: 'patch', payload: { busy: name } });
    try { await action(orderId); if (refreshAfter && selectedIdRef.current === orderId) await refresh(); }
    catch (error) { toast.error(getErrorMessage(error, `Could not ${name}`)); }
    finally { if (selectedIdRef.current === orderId) dispatchShipmentView({ type: 'patch', payload: { busy: null } }); }
  };
  const filtered = useMemo(() => { const text = query.trim().toLowerCase(); return orders.filter((order) => `${order.number} ${order.customer}`.toLowerCase().includes(text)); }, [orders, query]);
  const handleSelectOrder = (orderId: string) => { if (busy) return; selectedIdRef.current = orderId; setSelectedId(orderId); };

  return <main className='shipment-tracking-page'>
    <header className='shipment-tracking-hero'>
      <div><p className='orders-eyebrow'>Shiprocket operations</p><h1>Shipment tracking</h1><p>Track AWBs, manage pickups, and keep shipping paperwork in one focused workspace.</p></div>
      <Link className='btn-ghost' to='/orders'>View all orders</Link>
    </header>
    <div className='shipment-tracking-layout'>
      <aside className='shipment-order-picker'>
        <div className='shipment-picker-head'>
          <strong>Select an order</strong>
          <button type='button' className='action-icon-button' onClick={() => void loadOrders()} disabled={ordersLoading || busy !== null} aria-label='Refresh paid orders' title='Refresh paid orders'>
            {ordersLoading ? <Loader2 size={15} className='animate-spin' /> : <RefreshCw size={15} />}
          </button>
        </div>
        <label className='shipment-search'><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Order or customer' aria-label='Search orders' /></label>
        <div className='shipment-order-list'>
          {filtered.map((order) => <button type='button' key={order._id} className={`shipment-order ${order._id === selectedId ? 'selected' : ''}`} onClick={() => handleSelectOrder(order._id)} disabled={busy !== null}><strong>#{order.number}</strong><span>{order.customer}</span><small>{formatDate(order.createdAt)}</small></button>)}
          {!ordersLoading && !filtered.length && <p className='shipment-muted'>No paid orders found.</p>}
        </div>
      </aside>
      <section className='shipment-content'>
        {!selected ? <div className='shipment-empty'><Truck size={40} /><h2>Select an order</h2><p>Choose an order to see its Shiprocket status and available actions.</p></div> : <>
          <div className='shipment-detail-head'>
            <div><p className='orders-eyebrow'>Order #{selected.number}</p><h2>{awb ? `AWB ${awb}` : hasBooking ? 'Shipment awaiting AWB' : 'Shipment not created'}</h2><p>{selected.customer} · Ordered {formatDate(selected.createdAt)}</p></div>
            <button type='button' className='btn-ghost' onClick={() => void refresh()} disabled={detailsLoading || busy !== null}>{detailsLoading ? <Loader2 size={15} className='animate-spin' /> : <RefreshCw size={15} />} Refresh</button>
          </div>
          {!canManageShipment && <div className='shipment-alert shipment-alert--warning'><AlertTriangle size={16} />Shiprocket actions are available only for paid, approved, non-terminal orders.</div>}
          {loadError && <div className='shipment-alert'><AlertTriangle size={16} />{loadError}. Shipment creation is disabled until details can be verified.</div>}
          {shipment?.lastShiprocketError && <div className='shipment-alert'><AlertTriangle size={16} />{shipment.lastShiprocketError}</div>}
          {trackingError && <div className='shipment-alert shipment-alert--warning'><AlertTriangle size={16} />{trackingError}</div>}
          <div className='shipment-metrics'>
            <Metric icon={<Truck size={18} />} title='Courier' value={shipment?.courierName || tracking?.courierName || 'Awaiting assignment'} />
            <Metric icon={<Radio size={18} />} title='Shipment status' value={displayStatus || 'Not available'} />
            <Metric icon={<MapPin size={18} />} title='Current location' value={tracking?.currentLocation || shipment?.currentLocation || 'No scan yet'} />
            <Metric icon={<Package size={18} />} title='Estimated delivery' value={formatDate(tracking?.etd || shipment?.etd)} />
          </div>
          <div className='shipment-panels'>
            <article className='shipment-panel'>
              <h3>Tracking timeline</h3>
              {tracking?.activities.length ? <ol className='shipment-timeline'>{tracking.activities.map((activity) => <li key={`${activity.date}-${activity.status}-${activity.activity}-${activity.location}`}><span><CheckCircle2 size={14} /></span><div><strong>{activity.activity || activity.status || 'Shipment update'}</strong><p>{activity.location || 'Location not provided'}</p><small>{formatDate(activity.date)}</small></div></li>)}</ol> : <p className='shipment-muted'>Live events will appear here after Shiprocket receives a courier scan.</p>}
            </article>
            <article className='shipment-panel'>
              <h3>Shiprocket actions</h3><p className='shipment-muted'>Manage fulfillment without opening the full order detail screen.</p>
              <div className='shipment-actions'>
                {!awb ? <button type='button' className='btn-primary' disabled={!canSyncShipment || busy !== null || detailsLoading} onClick={() => void run('create shipment', async (orderId) => {
                  const next = await syncShipment(orderId); if (selectedIdRef.current === orderId) dispatchShipmentView({ type: 'patch', payload: { shipment: next } });
                  toast.success(next.awbCode ? `Shipment created — AWB ${next.awbCode}` : 'Shipment synchronized; AWB is still pending');
                })}>{busy === 'create shipment' ? <Loader2 size={15} className='animate-spin' /> : <Truck size={15} />}{busy === 'create shipment' ? 'Creating…' : hasBooking ? 'Retry AWB assignment' : 'Create shipment'}</button> : <>
                  <button type='button' className='btn-ghost' disabled={!canMutateShipment || busy !== null || pickupHandled} onClick={() => void run('schedule pickup', async (orderId) => {
                    const result = await schedulePickup(orderId);
                    if (selectedIdRef.current === orderId) dispatchShipmentView({ type: 'update-shipment', update: (current) => current ? { ...current, pickupScheduled: result.pickupScheduled, pickupScheduledDate: result.pickupDate } : current });
                    toast.success(result.status ? `Pickup scheduled: ${result.status}` : 'Pickup scheduled');
                  })}>{busy === 'schedule pickup' ? <Loader2 size={15} className='animate-spin' /> : <Package size={15} />}{pickupHandled ? 'Pickup completed' : 'Schedule pickup'}</button>
                  <button type='button' className='btn-ghost' disabled={busy !== null} onClick={() => void run('download label', (orderId) => openRemoteDocument(async () => shipment?.labelUrl || getShipmentLabel(orderId)), false)}>{busy === 'download label' ? <Loader2 size={15} className='animate-spin' /> : <Download size={15} />}Shipping label</button>
                  <button type='button' className='btn-ghost' disabled={busy !== null} onClick={() => void run('download manifest', (orderId) => openRemoteDocument(async () => shipment?.manifestUrl || getShipmentManifest(orderId)), false)}>{busy === 'download manifest' ? <Loader2 size={15} className='animate-spin' /> : <FileText size={15} />}Manifest</button>
                  {liveTrackingUrl && <a className='btn-ghost' href={liveTrackingUrl} target='_blank' rel='noopener noreferrer'><ExternalLink size={15} />Live tracking</a>}
                  <button type='button' className='btn-danger' disabled={!canMutateShipment || busy !== null} onClick={() => {
                    if (!window.confirm('Cancel this Shiprocket shipment? This cannot be undone.')) return;
                    void run('cancel shipment', async (orderId) => { await cancelShipment(orderId); if (selectedIdRef.current === orderId) dispatchShipmentView({ type: 'update-shipment', update: (current) => current ? { ...current, shipmentStatus: 'cancelled' } : current }); toast.success('Shipment cancelled'); });
                  }}>{busy === 'cancel shipment' ? <Loader2 size={15} className='animate-spin' /> : <X size={15} />}{busy === 'cancel shipment' ? 'Cancelling…' : 'Cancel shipment'}</button>
                </>}
              </div>
            </article>
          </div>
        </>}
      </section>
    </div>
  </main>;
}

function Metric({ icon, title, value }: { icon: ReactNode; title: string; value: string }) {
  return <article className='shipment-metric'><span>{icon}</span><div><p>{title}</p><strong title={value}>{value}</strong></div></article>;
}
