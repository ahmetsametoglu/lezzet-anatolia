import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { PreparationLineContract, PreparationOrderContract, PreparationPick } from '@lezzet/types';

import { confirmPreparation, fetchPreparationQueue } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { productLabel } from './warehouse-format';
import { trackWarehouse } from './warehouse-status';

/*
  D1 · TOPLAMA (v2:314-350) — `/warehouse/preparation` + `/preparation/:orderId/confirm`.

  ── ADET NEYİN SAYISI: BU EKRANIN EN ÖNEMLİ KARARI (ölçüldü) ────────────────
  Kapının yazma sözleşmesi ABSOLÜTTÜR ve bunu RPC'nin kendi yorumu söylüyor
  (`0015_record_preparation.sql`): *"Yeniden hazırlık: önceki parti kaydı tamamen yenisiyle değişir
  (yamalanmaz)"* — gönderilen partiler silinip yeniden yazılıyor ve `fulfilled_qty` gönderilen
  toplamın KENDİSİ oluyor. Okuma tarafı ise kalemin daha önce HANGİ partilerden hazırlandığını
  taşımıyor: sözleşmede yalnız `pickedQty` var, parti dağılımı yok. İkisi birlikte tek bir sonuç
  veriyor — **yarım kalmış bir kalemin eski dağılımı bu ekrandan yeniden üretilemez.**

  Bu yüzden alan "toplam kaç topladım"ı DEĞİL, **"bu kayıtla kaç adet yazıyorum"u** soruyor ve
  varsayılanı 0'dır. Daha önce yazılmış adet satırın altında AYRICA söyleniyor ("önceden N
  yazılmış — yeni kayıt onun yerine geçer"), çünkü sessizce üstüne yazmak depocunun bilmediği bir
  kaybı doğururdu. Alternatif ölçüldü ve elendi: eksik kalanı "ilk öneri partisine" eklemek, parti
  atamasını TAHMİN etmek olurdu — geri çağırmanın dayandığı kayıt tahminle yazılmaz.
  BEKLEYEN(21.11): kuyruk sözleşmesi kalemin mevcut parti dağılımını da taşımalı; o gün alan
  kümülatif hâline döner ve bu künye küçülür.

  ── TAVAN MOTORUN VERDİĞİ KAPASİTEDİR ───────────────────────────────────────
  Girilebilecek en büyük adet `suggestion` toplamıdır (motorun FEFO ile ayırdığı partiler), sipariş
  adedi değil: rafta olmayan mal "topladım" diye yazılamaz. Aradaki fark zaten cevabın içinde
  (`shortfallQty`) ve satırın altında gösteriliyor. Çıpalı kalemde (`pinnedStockId`) öneri TEK
  partiye sabittir — indirimli teklife söz verilen stok başka partiyle karşılanamaz (DOMAIN §4).

  ── "EKSİK BİLDİR" BİR ALAN DEĞİL, BİR KABULLENİŞ ───────────────────────────
  Sözleşmede "eksik" diye bir istek alanı YOK ve olmamalı: eksik, gönderilen adet ile sipariş adedi
  arasındaki farktan TÜRER ve tavsiyesini (`shortfalls`) kapı üretir. Ekrandaki bağlantı yalnız
  "bu kalemi aramayı bıraktım" demektir — CTA'yı açar, isteğe bir şey eklemez. Kararın kendisi
  YÖNETİM ekranındadır (v2: *"Eksik bildirildi — karar yönetim ekranında"*).
*/

const t = warehouseCopy;

type QueueStatus = 'loading' | 'ready' | 'error';

/** Kapının dört cevabı — sözleşmeden TÜRER (`ConfirmPreparationResponseSchema`), elle yazılmaz. */
type ConfirmOutcome = Extract<Awaited<ReturnType<typeof confirmPreparation>>, { error: null }>['data'];

/** Satırın ekrandaki hâli — girilen adet ve "aramayı bıraktım" işareti. */
interface LineState {
  qty: number;
  shortReported: boolean;
}

/** İsteğin sonucu, tek cümlede. `tone` v2'nin üç rengiyle aynı ayrımı taşır. */
interface PreparationNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

interface UsePreparationResult {
  status: QueueStatus;
  orders: PreparationOrderContract[];
  /** Seçili sipariş; `null` = kuyruk gösteriliyor. */
  order: PreparationOrderContract | null;
  select: (orderId: string | null) => void;
  lineState: (itemId: string) => LineState;
  /** Satıra girilebilecek en büyük adet — motorun ayırdığı parti toplamı. */
  capacityOf: (line: PreparationLineContract) => number;
  setQty: (itemId: string, qty: number | null, capacity: number) => void;
  reportShort: (itemId: string) => void;
  /** Bütün satırlar ya sayıldı ya eksik bildirildi mi (v2'nin `topDone`u). */
  resolved: boolean;
  /** Eksik bildirilen satır var mı — CTA'nın rengini ve cümlesini değiştirir. */
  anyShort: boolean;
  sending: boolean;
  notice: PreparationNotice | null;
  submit: () => void;
  reload: () => void;
}

/** Motorun bu satır için ayırabildiği toplam adet — sipariş adedi DEĞİL, raftaki gerçek. */
function capacity(line: PreparationLineContract): number {
  return line.suggestion.reduce((total, pick) => total + pick.qty, 0);
}

/**
 * Girilen adedi önerilen partilere DAĞITIR — sırayla, her partiden en çok önerdiği kadar.
 *
 * Sıra FEFO'nun kendisidir (motor öyle sıraladı): en yakın SKT önce çıkar. Kapasiteyi aşan bir
 * istek doğamaz (alan zaten orada kilitli), ama savunma olarak dağıtım kapasiteyle sınırlı kalır —
 * uydurulmuş bir parti satırı, geri çağırmanın dayandığı kaydı bozardı.
 */
function allocate(line: PreparationLineContract, qty: number): PreparationPick['batches'] {
  const batches: PreparationPick['batches'] = [];
  let left = qty;

  for (const pick of line.suggestion) {
    if (left <= 0) break;
    const take = Math.min(left, pick.qty);
    if (take > 0) {
      batches.push({ stockId: pick.stockId, qty: take });
      left -= take;
    }
  }

  return batches;
}

export function usePreparation(): UsePreparationResult {
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [orders, setOrders] = useState<PreparationOrderContract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<PreparationNotice>();

  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchPreparationQueue());
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }

    setOrders(result.data.orders);
    setStatus('ready');
    // TEK sipariş varsa doğrudan açılır (v2'nin ekranı tek siparişi çiziyor); iki ve üzeri sipariş
    // ise seçim SORULUR — hangi siparişin toplandığını uydurmak, yanlış koliyi doldurmaktır.
    setSelectedId((current) =>
      current !== null && result.data.orders.some((order) => order.orderId === current)
        ? current
        : result.data.orders.length === 1
          ? (result.data.orders[0]?.orderId ?? null)
          : null,
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  const select = useCallback((orderId: string | null) => {
    setSelectedId(orderId);
    setLines({});
    setNotice(null);
  }, []);

  const lineState = useCallback(
    (itemId: string): LineState => lines[itemId] ?? { qty: 0, shortReported: false },
    [lines],
  );

  const setQty = useCallback((itemId: string, qty: number | null, max: number) => {
    setLines((current) => ({
      ...current,
      [itemId]: {
        // Boş alan sıfırdır BURADA (ve yalnız burada): D1'de "sıfır yazdım" ile "hiç yazmadım"
        // aynı sonuca varır — ikisi de "bu kalemden hiçbir şey koymadım" demektir. Ayrımın anlam
        // taşıdığı yer D5'tir ve orada korunuyor.
        qty: qty === null ? 0 : Math.max(0, Math.min(max, qty)),
        shortReported: current[itemId]?.shortReported ?? false,
      },
    }));
  }, []);

  const reportShort = useCallback((itemId: string) => {
    setLines((current) => ({
      ...current,
      [itemId]: { qty: current[itemId]?.qty ?? 0, shortReported: true },
    }));
  }, []);

  const order = orders.find((row) => row.orderId === selectedId) ?? null;

  const resolved =
    order !== null &&
    order.lines.every((line) => {
      const state = lines[line.itemId];
      return state !== undefined && (state.shortReported || state.qty >= Math.min(line.orderedQty, capacity(line)));
    });

  const anyShort = order !== null && order.lines.some((line) => lines[line.itemId]?.shortReported === true);

  const submit = useCallback(() => {
    if (order === null || sending) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const picks: PreparationPick[] = order.lines.map((line) => ({
        orderItemId: line.itemId,
        batches: allocate(line, lines[line.itemId]?.qty ?? 0),
      }));

      const result = await trackWarehouse(confirmPreparation(order.orderId, { picks }));
      setSending(false);

      if (result.error !== null) {
        setNotice({
          tone: 'error',
          text:
            result.error === 'network_error'
              ? t.common.networkError
              : fillCopy(t.common.serverError, { error: result.error }),
        });
        return;
      }

      setNotice(noticeOf(result.data, order));
      // Cevap "durum değişti" diyor; kuyruk da aynı gerçeği göstermeli (iskelet YOK).
      await load();
    })();
  }, [lines, load, order, sending]);

  return {
    status,
    orders,
    order,
    select,
    lineState,
    capacityOf: capacity,
    setQty,
    reportShort,
    resolved,
    anyShort,
    sending,
    notice,
    submit,
    reload,
  };
}

/**
 * Kapının cevabı → ekrandaki cümle. Dört dalın DÖRDÜ de gösterilir: `ok`+`ready:false` bir hata
 * değil yarım iştir, `pinned_violation` hiçbir şeyin yazılmadığını söyler ve o bilgi bir HTTP
 * koduna indirgenirse depocu neyi yanlış yaptığını göremez.
 */
function noticeOf(outcome: ConfirmOutcome, order: PreparationOrderContract): PreparationNotice {
  if (outcome.status === 'pinned_violation') return { tone: 'error', text: t.picking.result.pinned };
  if (outcome.status === 'forbidden') return { tone: 'error', text: t.common.outOfScope };
  if (outcome.status === 'not_found') return { tone: 'error', text: t.common.notFound };

  const head = outcome.ready
    ? fillCopy(t.picking.result.ready, { n: String(outcome.items) })
    : fillCopy(t.picking.result.partial, { n: String(outcome.items) });

  const shortfalls = outcome.shortfalls.map((row) => {
    const line = order.lines.find((candidate) => candidate.itemId === row.itemId);
    return fillCopy(t.picking.result.shortfall, {
      name: line === undefined ? '—' : productLabel(line.productName, line.variantLabel),
      qty: String(row.suggestion.missingQty),
      reason: t.picking.shortfallReason[row.suggestion.reason],
      action: t.picking.shortfallAction[row.suggestion.action],
    });
  });

  return {
    tone: outcome.ready && shortfalls.length === 0 ? 'ok' : 'warn',
    text: [head, ...shortfalls].join(' '),
  };
}
