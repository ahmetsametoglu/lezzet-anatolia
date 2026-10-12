import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StaffAddressOption, StaffCustomerOption, StaffDeliveryContext, StaffVariantRow } from '@lezzet/types';

import {
  fetchStaffAddresses,
  fetchStaffDeliveryContext,
  fetchStaffOrderOrigin,
  fetchStaffStock,
  placeStaffOrder,
} from '@/lib/api/staff-order';
import { newRequestKey } from '@/lib/request-key';
import { toastError } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { staffOrderCopy as t } from './copy';
import {
  activeLines,
  footerReasonOf,
  lineFromRow,
  lineIssueOf,
  orderRequestOf,
  paymentRowsOf,
  subtotalCents,
  type OrderLine,
  type PaymentChoice,
} from './staff-order-format';

/*
  Personel sipariş girişinin durumu: sayfa ve seçiciler aynı örneği okur (`staff-order-context.tsx`). Ödeme ön izlemesi kalemler
  değiştikçe sunucuya yeniden sorulur; son istek kazanır, düğme ön izleme son kalemlerle okunana kadar kapalı kalır.
*/

/** Kalem değişikliği ile ön izleme isteği arasındaki bekleme; her dokunuşta sunucuya gidilmesin. */
const PREVIEW_DELAY_MS = 400;

/** Stok reddinde sepetteki boyların kalanı yeniden okunur ki tükenen kalem kendi satırında işaretlensin. */
const STOCK_REASONS = new Set(['insufficient_here', 'insufficient_stock', 'blocked_lines']);
/** Gün ya da ödeme reddinde ön izleme bayattır; yeniden okunur. */
const CONTEXT_REASONS = new Set(['payment_not_allowed', 'date_unavailable']);

export interface StaffOrderEntry {
  /** Duraktan açıldıysa durağın siparişi; müşteri ve adres ondan çözülür. */
  fromOrderId: string | null;
  stopNo: string | null;
}

export interface PlacedStaffOrder {
  orderId: string;
  referenceNo: string | null;
  totalCents: number;
  customerName: string;
  deliveryType: 'route' | 'shipping';
  deliveryDate: string | null;
  warehouseName: string | null;
  payment: PaymentChoice;
}

type AddressState = StaffAddressOption[] | 'loading' | 'error' | null;

const NO_ENTRY: StaffOrderEntry = { fromOrderId: null, stopNo: null };

export function useStaffOrder() {
  const [entry, setEntry] = useState<StaffOrderEntry>(NO_ENTRY);
  const [customer, setCustomer] = useState<StaffCustomerOption | null>(null);
  const [addresses, setAddresses] = useState<AddressState>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [context, setContext] = useState<StaffDeliveryContext | null>(null);
  /** Son ön izlemenin hangi kalemlerle okunduğu; güncel anahtarla aynı değilse ödeme kararı bayattır. */
  const [contextKey, setContextKey] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [payment, setPayment] = useState<PaymentChoice | null>(null);
  const [sending, setSending] = useState(false);
  const [placed, setPlaced] = useState<PlacedStaffOrder | null>(null);
  /** Duraktan açıldıysa durağın adresi; sayfa onu "duraktaki adres" diye işaretler. */
  const [stopAddressId, setStopAddressId] = useState<string | null>(null);
  const contextSeq = useRef(0);
  const addressSeq = useRef(0);
  /* Cevabı kaybolan gönderim aynı anahtarla yeniden gider ve sunucu ikinci sipariş açmaz; ret ya da başarıdan sonra anahtar yenilenir. */
  const requestKey = useRef<string | null>(null);

  const selectCustomer = useCallback((option: StaffCustomerOption, preferredAddressId: string | null = null) => {
    setCustomer(option);
    /* Fiyat müşteriye göre çözülür: önceki müşterinin kalemleri yeni müşteriye onun hiç almadığı fiyatı gösterirdi. */
    setLines([]);
    setPayment(null);
    setDeliveryDate(null);
    setContext(null);
    setContextKey(null);
    setAddressId(null);
    setAddresses('loading');
    const seq = ++addressSeq.current;
    void fetchStaffAddresses(option.id).then((result) => {
      if (seq !== addressSeq.current) return;
      if (result.error !== null) {
        setAddresses('error');
        return;
      }
      const list = result.data.addresses;
      setAddresses(list);
      const preferred = list.find((a) => a.id === preferredAddressId) ?? list.find((a) => a.isBilling) ?? list[0];
      setAddressId(preferred?.id ?? null);
    });
  }, []);

  const reloadAddresses = useCallback(() => {
    if (customer !== null) selectCustomer(customer, addressId);
  }, [addressId, customer, selectCustomer]);

  /** Duraktan açılış: müşteri ve adres durağın siparişinden çözülür; okunamazsa personel müşteriyi aramadan seçer. */
  const openFromStop = useCallback((next: StaffOrderEntry) => {
    setEntry((current) => (current.fromOrderId === next.fromOrderId && current.stopNo === next.stopNo ? current : next));
  }, []);

  useEffect(() => {
    if (entry.fromOrderId === null) return;
    let alive = true;
    void fetchStaffOrderOrigin(entry.fromOrderId).then((result) => {
      if (!alive) return;
      if (result.error !== null) {
        toastError(t.page.originError);
        return;
      }
      setStopAddressId(result.data.addressId);
      selectCustomer(result.data.customer, result.data.addressId);
    });
    return () => {
      alive = false;
    };
  }, [entry.fromOrderId, selectCustomer]);

  const selectAddress = useCallback((id: string) => {
    setAddressId(id);
    setDeliveryDate(null);
    setContext(null);
    setContextKey(null);
  }, []);

  const addAddress = useCallback((address: StaffAddressOption) => {
    setAddresses((prev) => (Array.isArray(prev) ? [...prev, address] : [address]));
    setAddressId(address.id);
    setDeliveryDate(null);
    setContext(null);
    setContextKey(null);
  }, []);

  const previewLines = useMemo(
    () => activeLines(lines).map((line) => ({ totalCents: line.qty * line.unitPriceCents, vatRate: line.vatRate })),
    [lines],
  );
  const previewKey = useMemo(
    () => `${addressId ?? ''}|${JSON.stringify(previewLines)}|${refreshNonce}`,
    [addressId, previewLines, refreshNonce],
  );

  useEffect(() => {
    if (customer === null || addressId === null || contextKey === previewKey) return;
    const seq = ++contextSeq.current;
    const key = previewKey;
    /* Adres yeni seçildiyse beklemeden sorulur; yalnız kalemler değiştiyse dokunuşlar bitene kadar beklenir. */
    const sameAddress = contextKey !== null && contextKey.startsWith(`${addressId}|`);
    const timer = setTimeout(
      () => {
        void fetchStaffDeliveryContext({ customerId: customer.id, addressId, lines: previewLines }).then((result) => {
          if (seq !== contextSeq.current) return;
          if (result.error !== null) {
            toastError(t.page.contextError);
            return;
          }
          setContext(result.data);
          setContextKey(key);
        });
      },
      sameAddress ? PREVIEW_DELAY_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [customer, addressId, previewKey, previewLines, contextKey]);

  /* Tek gün varsa o gün alınır (DOMAIN §6); seçili gün yeni listede yoksa seçim düşer. */
  const dates = context?.delivery.availableDates;
  useEffect(() => {
    if (dates === undefined) return;
    setDeliveryDate((current) => {
      if (current !== null && dates.includes(current)) return current;
      return dates.length === 1 ? (dates[0] ?? null) : null;
    });
  }, [dates]);

  const applyStock = useCallback((stock: readonly { variantId: string; availableQty: number }[]) => {
    const byId = new Map(stock.map((s) => [s.variantId, s.availableQty]));
    setLines((prev) => prev.map((line) => (byId.has(line.variantId) ? { ...line, availableQty: byId.get(line.variantId) ?? 0 } : line)));
  }, []);

  /* Adres depoyu değiştirdiyse kalemlerin kalanı yeni deponun stoğudur. */
  const warehouseId = context?.delivery.warehouseId ?? null;
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);
  const refreshStock = useCallback(async () => {
    const ids = linesRef.current.map((line) => line.variantId);
    if (warehouseId === null || ids.length === 0) return;
    const result = await fetchStaffStock({ warehouseId, variantIds: ids });
    if (result.error === null) applyStock(result.data.stock);
  }, [applyStock, warehouseId]);
  useEffect(() => {
    void refreshStock();
  }, [refreshStock]);

  /** Seçicinin adet düğmesi: kalem yoksa doğar, varsa adedi değişir; sıfır kalem yerinde kalır. */
  const setRowQty = useCallback((row: StaffVariantRow, qty: number) => {
    setLines((prev) => {
      const existing = prev.find((line) => line.variantId === row.variantId);
      if (existing) return prev.map((line) => (line.variantId === row.variantId ? { ...line, qty: Math.max(0, qty) } : line));
      const born = qty > 0 ? lineFromRow(row, qty) : null;
      return born === null ? prev : [...prev, born];
    });
  }, []);

  const setLineQty = useCallback((variantId: string, qty: number) => {
    setLines((prev) => prev.map((line) => (line.variantId === variantId ? { ...line, qty: Math.max(0, qty) } : line)));
  }, []);

  const setLinePrice = useCallback((variantId: string, unitPriceCents: number) => {
    setLines((prev) => prev.map((line) => (line.variantId === variantId ? { ...line, unitPriceCents } : line)));
  }, []);

  const shipping = context?.delivery.deliveryType === 'shipping';
  const totalCents = subtotalCents(lines);
  const linesOk = activeLines(lines).every((line) => lineIssueOf(line, shipping) === null);
  const paymentRows = paymentRowsOf({
    payment: context?.payment ?? null,
    customer,
    totalCents,
    hasLines: activeLines(lines).length > 0,
    linesOk,
  });
  const footer = footerReasonOf({
    customer,
    addressId,
    context,
    contextFresh: contextKey === previewKey,
    deliveryDate,
    lines,
    payment,
    paymentRows,
  });

  const submit = useCallback(async (): Promise<boolean> => {
    if (!footer.ready || customer === null || addressId === null || context === null || payment === null || sending) return false;
    requestKey.current ??= newRequestKey('ord');
    const request = orderRequestOf({
      customerId: customer.id,
      addressId,
      deliveryType: context.delivery.deliveryType,
      deliveryDate,
      lines,
      payment,
      idempotencyKey: requestKey.current,
    });
    setSending(true);
    const result = await placeStaffOrder(request);
    setSending(false);
    if (result.error !== null) {
      toastError(t.submitFailed);
      return false;
    }
    requestKey.current = null;
    if (result.data.status === 'rejected') {
      toastError(result.data.message);
      if (STOCK_REASONS.has(result.data.reason)) void refreshStock();
      if (CONTEXT_REASONS.has(result.data.reason)) setRefreshNonce((n) => n + 1);
      return false;
    }
    setPlaced({
      orderId: result.data.orderId,
      referenceNo: result.data.referenceNo,
      totalCents: result.data.totalCents,
      customerName: customer.name,
      deliveryType: context.delivery.deliveryType,
      deliveryDate: context.delivery.deliveryType === 'route' ? deliveryDate : null,
      warehouseName: context.delivery.warehouseName,
      payment,
    });
    return true;
  }, [addressId, context, customer, deliveryDate, footer.ready, lines, payment, refreshStock, sending]);

  /** Onay ekranından "Yeni sipariş": aynı yığında baştan başlanır. */
  const reset = useCallback(() => {
    addressSeq.current += 1;
    contextSeq.current += 1;
    setCustomer(null);
    setAddresses(null);
    setAddressId(null);
    setContext(null);
    setContextKey(null);
    setDeliveryDate(null);
    setLines([]);
    setPayment(null);
    setPlaced(null);
    setEntry(NO_ENTRY);
    setStopAddressId(null);
    requestKey.current = null;
  }, []);

  return {
    entry,
    openFromStop,
    customer,
    addresses,
    addressId,
    stopAddressId,
    context,
    deliveryDate,
    lines,
    payment,
    paymentRows,
    footer,
    totalCents,
    shipping,
    sending,
    placed,
    selectCustomer,
    reloadAddresses,
    selectAddress,
    addAddress,
    setDeliveryDate,
    setRowQty,
    setLineQty,
    setLinePrice,
    setPayment,
    submit,
    reset,
  };
}

export type StaffOrderStore = ReturnType<typeof useStaffOrder>;
