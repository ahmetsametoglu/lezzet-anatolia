import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DoorCollectionMethods, DoorMethod, PickupDeliverResponse, PickupQueueOrderContract } from '@lezzet/types';

import { deliverPickup, fetchPickupQueue } from '@/lib/api/warehouse';
import { centsToAmountText, parseAmountToCents } from '@/lib/operations/money';
import { newRequestKey } from '@/lib/request-key';
import { trackWarehouse } from './warehouse-status';

/*
  Gel-al teslimi: kanca kuyruğu okur, seçili siparişin kutu okutmalarını ve tahsilatını tutar, teslimi yazar; kural sunucudadır (`deliverPickupOrder`).
  Teslim anında yazılır, kuyruğa alınmaz, çünkü müşteriye verilen malın sistemde "sırada" beklemesi malın kimde olduğunu belirsiz bırakır.
*/

export interface UsePickupResult {
  status: 'loading' | 'ready' | 'error';
  orders: PickupQueueOrderContract[];
  /** Tezgâhta hangi yöntemin hesabı ayarlı; hesabı olmayan yöntemde borçlu siparişin teslim kapısı kapanır. */
  doorCollection: DoorCollectionMethods;
  selected: PickupQueueOrderContract | null;
  select: (orderId: string | null) => void;
  scanned: ReadonlySet<string>;
  /** Okutulan kod seçili siparişin kutusuysa işaretlenir ve `true` döner; değilse `false` (ekran sebebi söyler). */
  scan: (code: string) => boolean;
  allBoxesScanned: boolean;
  amountText: string;
  setAmountText: (text: string) => void;
  method: DoorMethod;
  setMethod: (method: DoorMethod) => void;
  /** Tahsilat gerekiyor mu — borç varsa; vadeli ve online ödenmişte 0. */
  dueCents: number;
  partialPayment: boolean;
  /** Tahsilat gerekiyor ama yöntemin hesabı yok ya da tutar geçersiz — teslim kapısı kapalı. */
  collectionBlocked: boolean;
  canDeliver: boolean;
  busy: boolean;
  deliver: () => Promise<PickupDeliverResponse | null>;
  reload: () => void;
}

export function usePickup(): UsePickupResult {
  const [status, setStatus] = useState<UsePickupResult['status']>('loading');
  const [orders, setOrders] = useState<PickupQueueOrderContract[]>([]);
  const [doorCollection, setDoorCollection] = useState<DoorCollectionMethods>({ cash: false, card: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<DoorMethod>('cash');
  const [busy, setBusy] = useState(false);
  /* Tahsilatın tekrar anahtarı SEÇİM başına: ağ yeniden denemesi aynı anahtarla gider, para iki kez yazılmaz. */
  const collectionKey = useRef<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchPickupQueue());
    if (run !== generation.current) return;
    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setOrders(result.data.orders);
    setDoorCollection(result.data.doorCollection);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => orders.find((order) => order.orderId === selectedId) ?? null, [orders, selectedId]);

  const select = useCallback(
    (orderId: string | null) => {
      setSelectedId(orderId);
      setScanned(new Set());
      collectionKey.current = null;
      // Tutar MOTORUN borcuyla açılır; depocu eksik ödemeyi tuş takımından yazar.
      const next = orders.find((order) => order.orderId === orderId) ?? null;
      setAmountText(next && next.amountDueCents > 0 ? centsToAmountText(next.amountDueCents) : '');
      setMethod('cash');
    },
    [orders],
  );

  const scan = useCallback(
    (code: string): boolean => {
      const trimmed = code.trim();
      if (!selected || !selected.boxes.some((box) => box.code === trimmed)) return false;
      setScanned((current) => new Set(current).add(trimmed));
      return true;
    },
    [selected],
  );

  const allBoxesScanned = selected !== null && selected.boxes.length > 0 && selected.boxes.every((box) => scanned.has(box.code));
  const dueCents = selected?.amountDueCents ?? 0;
  const amountCents = parseAmountToCents(amountText);
  const partialPayment = dueCents > 0 && amountCents !== null && amountCents < dueCents;
  const collectionBlocked = dueCents > 0 && (!doorCollection[method] || amountCents === null || amountCents <= 0);
  const canDeliver = selected !== null && allBoxesScanned && !collectionBlocked && !busy;

  const deliver = useCallback(async (): Promise<PickupDeliverResponse | null> => {
    if (!selected || !canDeliver) return null;
    setBusy(true);
    collectionKey.current ??= newRequestKey('pickup');
    const collection =
      dueCents > 0 && doorCollection[method] && amountCents !== null && amountCents > 0
        ? { method, amountCents, idempotencyKey: collectionKey.current }
        : null;
    const result = await trackWarehouse(deliverPickup(selected.orderId, { scannedBoxCodes: [...scanned], collection }));
    setBusy(false);
    if (result.error !== null) return null;
    // Teslim yazıldıysa liste sunucudan tazelenir: yerelde satır silmek, ikinci telefonun okuttuğu siparişi de gizlerdi.
    if (result.data.status === 'ok') {
      setSelectedId(null);
      setScanned(new Set());
      collectionKey.current = null;
      void load();
    }
    return result.data;
  }, [amountCents, canDeliver, doorCollection, dueCents, load, method, scanned, selected]);

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  return {
    status,
    orders,
    doorCollection,
    selected,
    select,
    scanned,
    scan,
    allBoxesScanned,
    amountText,
    setAmountText,
    method,
    setMethod,
    dueCents,
    partialPayment,
    collectionBlocked,
    canDeliver,
    busy,
    deliver,
    reload,
  };
}
