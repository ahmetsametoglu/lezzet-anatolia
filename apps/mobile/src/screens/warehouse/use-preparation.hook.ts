import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type {
  PreparationBoxContract,
  PreparationLineContract,
  PreparationOrderContract,
  PreparationPick,
  ShortfallSuggestionContract,
} from '@lezzet/types';

import { confirmPreparation, fetchPreparationQueue, openOrderBox, resolveScannedCode, sealOrderBox } from '@/lib/api/warehouse';
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
  /**
   * Kutu döngüsü (23.6, karar §1.4): sipariş kutu ekseninde mi toplanıyor. HİÇ dokunulmamış
   * sipariş kutuyla başlar; kutusuz BAŞLANMIŞ iş (web masasından yarım) kutusuz biter — kalem
   * düzeyinde karışım RPC'ce reddedilir (0048), ekran o duvara hiç koşturmaz.
   */
  boxMode: boolean;
  /** Siparişin kutuları (kapalılar dahil); `openBox` = açık olan (yoksa `null`). */
  boxes: PreparationBoxContract[];
  openBox: PreparationBoxContract | null;
  /** Herhangi bir satıra adet girildi mi — "Kutuyu kapat"ın ön koşulu (boş kutu kapanmaz). */
  anyQty: boolean;
  openNewBox: () => void;
  sealCurrentBox: () => void;
  scanOpen: boolean;
  setScanOpen: (open: boolean) => void;
  handleScan: (code: string) => void;
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

  /*
    KUTU DÖNGÜSÜ (23.6, karar §1.4) — sipariş seç → kutu aç → okutarak/sayarak doldur → kapat →
    her şey konduysa sipariş kapanır, değilse yeni kutu. Tek kutu döngünün özel hâli.

    ── ADEDİN ANLAMI KUTU MODUNDA DEĞİŞİR ─────────────────────────────────────
    Alan "bu KUTUYA kaç adet koydum"u sorar. Üstteki absolüt-yazım künyesi kutu modunda GEÇERSİZ:
    birleşimi sunucu kurar (`sealBox` ⚠), önceki kutuların kaydı üstüne YAZILMAZ — satırın alt
    cümlesi de "önceki kutularda N" der, "yenisi yerine geçer" demez.

    ── KUTUSUZ BAŞLANMIŞ İŞ KUTUSUZ BİTER ─────────────────────────────────────
    Web masasından yarım gelmiş siparişte (pickedQty > 0, kutu yok) kutu modu AÇILMAZ — kalem
    düzeyinde kutulu/kutusuz karışımı RPC reddeder (0048 Σ kutu = karşılanan); ekran depocuyu o
    duvara hiç koşturmaz, eski akış aynen sürer.
  */
  const boxes = order?.boxes ?? [];
  const currentBox = boxes.find((box) => box.sealedAt === null) ?? null;
  const boxMode = order !== null && (boxes.length > 0 || order.lines.every((line) => line.pickedQty === 0));
  const anyQty = order !== null && order.lines.some((line) => (lines[line.itemId]?.qty ?? 0) > 0);
  const [scanOpen, setScanOpen] = useState(false);

  const openNewBox = useCallback(() => {
    if (order === null || sending) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const result = await trackWarehouse(openOrderBox(order.orderId));
      setSending(false);

      if (result.error !== null) {
        setNotice({
          tone: 'error',
          text: result.error === 'network_error' ? t.common.networkError : fillCopy(t.common.serverError, { error: result.error }),
        });
        return;
      }
      if (result.data.status === 'ok') {
        // Kutu kuyruk cevabında yaşar — yerelde taklit etmek yerine gerçek okunur (iskelet yok).
        await load();
        return;
      }
      if (result.data.status === 'stale') {
        setNotice({ tone: 'warn', text: t.picking.box.stale });
        await load();
        return;
      }
      setNotice({ tone: 'error', text: result.data.status === 'forbidden' ? t.common.outOfScope : t.common.notFound });
    })();
  }, [load, order, sending]);

  const handleScan = useCallback(
    (code: string) => {
      // Sayfa okuma başına kapanır (mal kabul deseni): sonuç cümlesi listenin üstünde okunur,
      // ikinci ürün için düğme yeniden açar.
      setScanOpen(false);
      if (order === null) return;

      void (async () => {
        const result = await trackWarehouse(resolveScannedCode(code));
        if (result.error !== null) {
          setNotice({ tone: 'error', text: t.picking.box.scanError });
          return;
        }
        if (result.data.status === 'unknown') {
          // Öğretme BİLEREK yok: toplamada yanlış ürüne öğretmenin bedeli kabuldekinden büyük —
          // ekran formda ne varsa onu önerirdi, katalog daralması yanıltıcı olurdu (D2 künyesi).
          setNotice({ tone: 'warn', text: t.picking.box.unknownCode });
          return;
        }

        const res = result.data;
        const name = productLabel(res.productName, res.variantLabel);
        const line = order.lines.find((row) => row.variantId === res.variantId);
        if (!line) {
          // Yanlış ürün ANINDA durdurulur (tasarım: "bu siparişte yok") — kutuya girmez.
          setNotice({ tone: 'error', text: fillCopy(t.picking.box.notInOrder, { name }) });
          return;
        }

        const max = capacity(line);
        const current = lines[line.itemId]?.qty ?? 0;
        if (current >= max) {
          setNotice({ tone: 'warn', text: fillCopy(t.picking.box.scanCapacity, { name }) });
          return;
        }
        // Koli kodu çarpanı kadar sayılır (karar §1.2); tavan motorun ayırdığı parti toplamı —
        // rafta olmayan mal okutmayla da "konmuş" yazılamaz.
        const added = Math.min(res.qtyPerCode, max - current);
        setQty(line.itemId, current + added, max);
        const sentence =
          res.source === 'sku'
            ? t.picking.box.scanFoundSku
            : res.source === 'supplier_code'
              ? t.picking.box.scanFoundSupplier
              : t.picking.box.scanFound;
        setNotice({ tone: 'ok', text: fillCopy(sentence, { name, n: String(added) }) });
      })();
    },
    [lines, order, setQty],
  );

  const sealCurrentBox = useCallback(() => {
    if (order === null || currentBox === null || sending) return;

    // `picks` BU kutunun dağılımı (kümülatif değil): boş satır kutu içeriği değildir, süzülür.
    const picks: PreparationPick[] = order.lines
      .map((line) => ({ orderItemId: line.itemId, batches: allocate(line, lines[line.itemId]?.qty ?? 0) }))
      .filter((pick) => pick.batches.length > 0);
    if (picks.length === 0) {
      setNotice({ tone: 'warn', text: t.picking.box.sealPending });
      return;
    }

    setSending(true);
    setNotice(null);

    void (async () => {
      // Eksik beyanı satırlardaki "eksik bildir" işaretinden gelir — ayrı bir soru sorulmaz;
      // beyansız kapanışta eksik "devam ediyor"dur ve yönetime soru gitmez (sözleşme künyesi).
      const result = await trackWarehouse(
        sealOrderBox(currentBox.boxId, { picks, declareShort: anyShort || undefined }),
      );
      setSending(false);

      if (result.error !== null) {
        setNotice({
          tone: 'error',
          text: result.error === 'network_error' ? t.common.networkError : fillCopy(t.common.serverError, { error: result.error }),
        });
        return;
      }

      const data = result.data;
      if (data.status === 'ok') {
        const head = data.ready
          ? fillCopy(t.picking.box.sealedReady, { n: String(data.boxNo), total: String(boxes.length) })
          : fillCopy(t.picking.box.sealedMissing, { n: String(data.boxNo) });
        const shortfalls = shortfallSentences(data.shortfalls, order);
        setNotice({ tone: data.ready && shortfalls.length === 0 ? 'ok' : 'warn', text: [head, ...shortfalls].join(' ') });
        setLines({});
        await load();
        return;
      }
      if (data.status === 'already_sealed') {
        setNotice({ tone: 'warn', text: t.picking.box.alreadySealed });
        await load();
        return;
      }
      if (data.status === 'pinned_violation') {
        setNotice({ tone: 'error', text: t.picking.result.pinned });
        return;
      }
      if (data.status === 'failed') {
        // RPC reddi operatöre AYNEN gösterilir (sözleşme vaadi) — sabit metne indirgenmez.
        setNotice({ tone: 'error', text: fillCopy(t.common.serverError, { error: data.message }) });
        return;
      }
      if (data.status === 'empty') {
        setNotice({ tone: 'warn', text: t.picking.box.sealPending });
        return;
      }
      setNotice({ tone: 'error', text: data.status === 'forbidden' ? t.common.outOfScope : t.common.notFound });
    })();
  }, [anyShort, boxes.length, currentBox, lines, load, order, sending]);

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
    boxMode,
    boxes,
    openBox: currentBox,
    anyQty,
    openNewBox,
    sealCurrentBox,
    scanOpen,
    setScanOpen,
    handleScan,
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

  const shortfalls = shortfallSentences(outcome.shortfalls, order);

  return {
    tone: outcome.ready && shortfalls.length === 0 ? 'ok' : 'warn',
    text: [head, ...shortfalls].join(' '),
  };
}

/**
 * Eksik tavsiyelerinin ekran cümleleri — onay VE kutu kapanışı aynı dili konuşur (tavsiyenin
 * kaynağı da tek: iki kapı `adviseShortfalls`ı paylaşıyor). Tutar burada da yok.
 */
function shortfallSentences(
  rows: ReadonlyArray<{ itemId: string; suggestion: ShortfallSuggestionContract }>,
  order: PreparationOrderContract,
): string[] {
  return rows.map((row) => {
    const line = order.lines.find((candidate) => candidate.itemId === row.itemId);
    return fillCopy(t.picking.result.shortfall, {
      name: line === undefined ? '—' : productLabel(line.productName, line.variantLabel),
      qty: String(row.suggestion.missingQty),
      reason: t.picking.shortfallReason[row.suggestion.reason],
      action: t.picking.shortfallAction[row.suggestion.action],
    });
  });
}
