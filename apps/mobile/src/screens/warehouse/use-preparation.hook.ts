import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type {
  BoxLabelContract,
  BoxPrinterContract,
  PreparationBoxContract,
  PreparationLineContract,
  PreparationOrderContract,
  DispatchOptionContract,
  PreparationPick,
  ShippingBoxOptionContract,
  ShortfallSuggestionContract,
} from '@lezzet/types';

import {
  announceShipment,
  confirmPreparation,
  fetchBoxLabel,
  fetchDispatchOptions,
  fetchPreparationQueue,
  fetchPrinters,
  fetchShippingBoxes,
  markBoxPrinted,
  openOrderBox,
  resolveScannedCode,
  sealOrderBox,
} from '@/lib/api/warehouse';
import { printLabel, printLabelPdf } from '@/lib/print/brother';
import { downloadLabelPng, downloadShippingLabelPdf } from '@/lib/print/label-file';
import { readPrinterChoice, resolvePrinter } from '@/lib/print/printer-choice';
import { hasPrinterNativeModule } from '@/lib/print/printer-availability';
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
  /**
   * Kutu açılırken KARGO KUTUSU TİPİ sorulacak mı (07.12) — yalnız kargo kulvarında ve yalnız
   * deponun benimsediği tip varsa. Rota siparişinde soru anlamsız (kutu araca biner), tipsiz
   * depoda ise cevaplanamaz — ikisinde de eski akış aynen sürer.
   */
  askBoxType: boolean;
  /**
   * Kargo siparişi ama deponun HİÇ kutu tipi yok. Ekran bunu sürekli görünen bir uyarı olarak
   * çizer, geçici bir cümle olarak değil: ölçüsüz kapanan kutu, etiket satın alınırken ön koşula
   * takılır ve o an kartonu geri açmak gerekir — depocu bunu kutuyu doldurmadan bilmeli.
   */
  boxTypeMissing: boolean;
  /** Deponun açık kargo kutusu tipleri; `askBoxType` yanlışken boş kalır (okuma hiç koşmaz). */
  shippingBoxes: ShippingBoxOptionContract[];
  /**
   * Kutu tipi seçimi açık mı. Ayrı bir state, `scanOpen`la paylaşılmaz: ikisi ayrı soru soruyor
   * ve tek bayrağı paylaşsalardı biri kapanırken öteki de kapanırdı.
   */
  boxTypeOpen: boolean;
  setBoxTypeOpen: (open: boolean) => void;
  /** `shippingBoxId` = seçilen tip; `null` = tipsiz aç (rota kulvarı ya da bilinçli atlama). */
  openNewBox: (shippingBoxId?: string | null) => void;
  sealCurrentBox: () => void;
  scanOpen: boolean;
  setScanOpen: (open: boolean) => void;
  handleScan: (code: string) => void;
  /**
   * **Kuyruk okutması (10.1)** — hazırlık kâğıdının QR'ı bu kapıya bakıyor.
   *
   * Kâğıt masada basılıyor ve depocu onu alıp okutuyor; QR'ın içeriği siparişin REFERANS
   * numarası (`LA-26-…`). Ayrı bir state, çünkü ayrı bir soru: `scanOpen` *"bu kalem hangisi"*
   * diye soruyor, bu *"hangi sipariş"* diye — ikisi tek bayrağı paylaşsaydı kuyrukta açılan
   * okutucu kutu mantığını çalıştırırdı.
   */
  queueScanOpen: boolean;
  setQueueScanOpen: (open: boolean) => void;
  scanQueueOrder: (code: string) => void;
  /**
   * Son KAPANAN kutunun etiketi (23.7) — içerik sunucudan (`boxLabelPayload`); basım Brother SDK
   * bağlanınca (23.5), bugünkü hâli ÖNİZLEME. `null` = gösterilecek etiket yok (kapat düğmesi ya
   * da yeni seçim sıfırlar). Sipariş hazır olup kuyruktan düşse de kart görünür kalır — depocu
   * "ne bastıracağını" kapanış anında okur.
   */
  label: BoxLabelContract | null;
  dismissLabel: () => void;
  /**
   * Basımın hâli (23.7). `off` = yazıcı tanımsız ya da modül bu derlemede yok — kart önizleme
   * olarak kalır; öteki hâller fiili basımın seyri. Hata cümlesi AYNEN taşınır (SDK reddi
   * teşhisin verisidir, sabit metne indirgenmez).
   */
  printState: PrintState;
  /** Yeniden basım — yırtılan/silik etiket için; damga güncellenir. */
  reprintLabel: () => void;
  /**
   * **SEVK (07.12)** — kutu kapandıktan sonraki adım: etiket satın alınır ve basılır.
   *
   * Kendi durumunu taşıyor, `order`a bağlı DEĞİL: son kutu mühürlenince sipariş `ready`ye geçiyor
   * ve hazırlık kuyruğundan DÜŞÜYOR (`listPreparationQueue` yalnız `confirmed`+`preparing` okur).
   * Etiket kartının aynı gerekçesi — depocu kutuyu elinde tutarken ekran kaybolmamalı.
   */
  dispatch: DispatchState;
  /** Seçenekleri getirir ve çekmeceyi açar; salt okuma, para harcamaz. */
  startDispatch: () => void;
  /** Servisi seçer → **GERÇEK PARA**: etiket satın alınır, indirilir, basılır. */
  chooseService: (option: DispatchOptionContract) => void;
  dismissDispatch: () => void;
}

/**
 * Sevkin hâli — her adım ADLI, çünkü ekranın cümlesi her adımda başka: "kargoya verilebilir",
 * "seçenekler geliyor", "hangi servis", "satın alınıyor", "alındı ve basıldı", "önkoşul tutmadı".
 * Tek bir `loading` bayrağı bunların hepsini aynı sessizliğe indirirdi.
 */
export type DispatchState =
  | { phase: 'idle' }
  /** Kutular mühürlendi, sipariş kargo kulvarında — "Kargoya ver" görünür. */
  | { phase: 'offer'; orderId: string; reference: string }
  | { phase: 'loading'; orderId: string; reference: string }
  | { phase: 'options'; orderId: string; reference: string; options: DispatchOptionContract[]; parcelCount: number; totalWeightG: number }
  /** Ön koşul tutmadı — sebebin ADI taşınıyor, ekran ona göre cümle kuruyor. */
  | { phase: 'blocked'; reference: string; reason: string }
  | { phase: 'announcing'; orderId: string; reference: string }
  /**
   * Alındı. `printed` fiilen basılan etiket sayısı — `parcels`tan AZ olabilir ve bu bir hata
   * değil bir HÂL: gönderi alındı, parası ödendi; basım ayrı bir olay ve "yeniden bas" eli bekler.
   */
  | { phase: 'done'; reference: string; trackingNumbers: string[]; printed: number; printError: string | null };

export type PrintState =
  | { phase: 'off' }
  | { phase: 'printing' }
  | { phase: 'printed'; model: string }
  | { phase: 'failed'; message: string };

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

/**
 * **Kargo etiketlerini bas** — duyurudan hemen sonra, kutu kutu.
 *
 * Yazıcı bugün deponun TEK ayarlı yazıcısından geliyor (`fetchBoxLabel` cevabındaki `printer`).
 * ⚠ **İş başına yazıcı ayrımı (`box` ↔ `shipping`) HENÜZ YOK** ve gerekiyor: kargo etiketi A6
 * yatay, bizim kutu etiketimiz 4×6 — aynı ruloya basılmaları fiziksel bir tesadüf olurdu.
 * BEKLEYEN(kargo-kanali-tasarimi.md §4.7): `warehouse_printer(warehouse_id, purpose, …)` envanteri
 * sunucuda, seçim cihazda.
 *
 * **Basım hatası akışı geriye çekmez:** kaç etiket çıktığı sayılıyor, ilk hata cümlesi taşınıyor
 * ve döngü DEVAM ediyor — ikinci kutunun etiketi birincinin hatasına kurban edilmez.
 */
async function printShippingLabels(boxIds: readonly string[]): Promise<{ printed: number; error: string | null }> {
  if (!hasPrinterNativeModule()) return { printed: 0, error: null };

  // Hedef ENVANTERDEN + CİHAZIN seçiminden çözülüyor (07.12 · 29.08). Kutu etiketiyle AYNI
  // yazıcıya basmak fiziksel bir hataydı: kargo etiketi A6 yatay, bizimki 4×6 kalıp kesim.
  const [liste, secim] = await Promise.all([trackWarehouse(fetchPrinters()), readPrinterChoice()]);
  const printer = liste.error === null ? resolvePrinter(liste.data.printers, 'shipping', secim) : null;
  if (!printer) return { printed: 0, error: 'kargo yazıcısı seçilmedi' };

  let printed = 0;
  let error: string | null = null;
  for (const boxId of boxIds) {
    try {
      const fileUri = await downloadShippingLabelPdf(boxId);
      await printLabelPdf(fileUri, printer);
      // Damga başarının kaydı; düşmesi kâğıdı geri almaz (23.7 dersi) — sayaç yine artar.
      await markBoxPrinted(boxId);
      printed += 1;
    } catch (err) {
      error ??= err instanceof Error ? err.message : String(err);
    }
  }
  return { printed, error };
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
    // Yeni seçim yeni iştir: önceki kutunun etiketi artık bu ekranın konusu değil.
    setLabel(null);
  }, []);

  /**
   * **Kâğıdın QR'ı → sipariş açılır** (10.1). Okunan kod siparişin referans numarası.
   *
   * ── EŞLEŞME KUYRUĞUN İÇİNDE ARANIR, SUNUCUYA SORULMAZ ───────────────────────
   * Kuyruk zaten elde ve depo kapsamıyla süzülmüş; sunucuya ikinci bir tur atmak hem yavaş hem
   * gereksiz olurdu. Daha önemlisi: kuyrukta OLMAYAN bir referans için doğru cevap "aç" değil
   * "bu senin işin değil" — sunucu sorgusu o cevabı bulanıklaştırırdı (sipariş var ama başka
   * depoda? kapanmış? ileri tarihli?). Depocunun sorusu tek: *elimdeki kâğıt bu listede mi.*
   *
   * ── BULUNAMAYAN KOD SESSİZ GEÇMEZ ───────────────────────────────────────────
   * Hiçbir şey yapmayan bir okutma, bozuk bir kamera gibi görünür ve depocu aynı kâğıdı defalarca
   * okutur. Cevap her hâlde bir cümle: bulundu → sipariş açılır, bulunamadı → sebebi yazılır.
   *
   * Karşılaştırma harf duyarsız ve boşluksuz: QR'dan gelen dize temizdir ama elle girilen ya da
   * başka bir okuyucudan gelen kod öyle olmayabilir.
   */
  const scanQueueOrder = useCallback(
    (code: string) => {
      const wanted = code.trim().toLocaleUpperCase('tr');
      if (wanted.length === 0) return;
      const match = orders.find((row) => (row.referenceNo ?? '').toLocaleUpperCase('tr') === wanted);

      setQueueScanOpen(false);
      if (!match) {
        setNotice({ tone: 'warn', text: fillCopy(t.picking.queueScan.notFound, { code: code.trim() }) });
        return;
      }
      select(match.orderId);
    },
    // `t` modül sabiti (`warehouseCopy`) — bağımlılık listesine girmez.
    [orders, select, setNotice],
  );

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
  const [queueScanOpen, setQueueScanOpen] = useState(false);
  const [shippingBoxes, setShippingBoxes] = useState<ShippingBoxOptionContract[]>([]);
  const [boxTypeOpen, setBoxTypeOpen] = useState(false);
  const [dispatch, setDispatch] = useState<DispatchState>({ phase: 'idle' });
  const [label, setLabel] = useState<BoxLabelContract | null>(null);
  const [printState, setPrintState] = useState<PrintState>({ phase: 'off' });
  /** Basımın hedefi — etiketle birlikte gelir; yeniden basım aynı kutu + aynı yazıcıyla koşar. */
  const printTarget = useRef<{ boxId: string; printer: BoxPrinterContract } | null>(null);

  const runPrint = useCallback(async (boxId: string, printer: BoxPrinterContract) => {
    setPrintState({ phase: 'printing' });
    try {
      // PNG sunucudan (tek şablon — karar §1.9), basım cihazdan (SDK ağ üzerinden basar, 23.5).
      const fileUri = await downloadLabelPng(boxId);
      await printLabel(fileUri, printer);
      // Damga başarının kaydı. Damga yazımı düşse bile kâğıt çıktı GERÇEK — basım "bastı" kalır;
      // düşen damga bir sonraki basımda güncellenir, akışı geriye çekmek kâğıdı geri almaz.
      await markBoxPrinted(boxId);
      setPrintState({ phase: 'printed', model: printer.model });
    } catch (error) {
      setPrintState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  /*
    KARGO KUTUSU TİPLERİ (07.12) — kutu açılmadan ÖNCE okunur.

    Sessiz düşüş bilinçli: liste gelmezse soru sorulmaz ve kutu tipsiz açılır. Kutu döngüsünü
    ikinci bir ağ turuna bağlamak, bugün çalışan bir akışı kargo kataloğunun sağlığına
    bağlamak olurdu — tipsiz kutu meşru bir hâl (sözleşme künyesi), duyuru kapısı zaten ölçüsüz
    kutuyu ön koşulda durduruyor ve sebebini söylüyor.
  */
  const loadShippingBoxes = useCallback(async () => {
    const result = await trackWarehouse(fetchShippingBoxes());
    setShippingBoxes(result.error === null ? result.data.boxes : []);
  }, []);

  /*
    Kargo siparişi seçilince tipler okunur — kutu açılmadan önce, çünkü soru o an sorulacak.

    BOŞ KATALOG SESSİZ GEÇMEZ: depo hiç kutu benimsememişse kutu tipsiz açılır (akış durmaz) ama
    depocu bunu SEÇİM ANINDA değil, siparişi açtığı anda öğrenir — ölçüsüz kutuyla kapanan bir
    gönderi, etiket satın alınırken ön koşula takılır ve o an kartonu geri açmak gerekir.
  */
  const shippingLane = order?.deliveryType === 'shipping';
  useEffect(() => {
    if (!shippingLane) {
      setShippingBoxes([]);
      return;
    }
    void loadShippingBoxes();
  }, [loadShippingBoxes, shippingLane]);

  /*
    SEVK — kutu kapandıktan sonraki adım (07.12).

    İki tur: önce SALT OKUMA teklif (para harcamaz), sonra depocunun seçimiyle duyuru (gerçek
    para). Araya seçim koymamızın sebebi kullanıcının kuralı: otomatik seçim boş dönerse liste
    DEPOCUYA gösterilir. Otomatik ön seçim (onaylı taşıyıcı ∩ süre) kargo şeridinin teklif
    kapısına inince buraya hazır seçimle gelecek; bugün liste her hâlde gösteriliyor.
  */
  const startDispatch = useCallback(() => {
    setDispatch((current) => {
      if (current.phase !== 'offer') return current;
      const { orderId, reference } = current;

      void (async () => {
        const result = await trackWarehouse(fetchDispatchOptions(orderId));
        if (result.error !== null) {
          setDispatch({ phase: 'blocked', reference, reason: result.error });
          return;
        }
        const data = result.data;
        if (data.status !== 'ok') {
          // Ön koşulun ADI taşınıyor: "ölçüsüz mal" tartıya, "tipsiz kutu" seçime, "adressiz
          // sipariş" yönetime gider — hepsini "olmadı"ya indirmek üç işi tek çıkmaza çevirirdi.
          setDispatch({ phase: 'blocked', reference, reason: data.status });
          return;
        }
        setDispatch({ phase: 'options', orderId, reference, options: data.options, parcelCount: data.parcelCount, totalWeightG: data.totalWeightG });
      })();

      return { phase: 'loading', orderId, reference };
    });
  }, []);

  /**
   * Servis seçildi → **GERÇEK PARA**. Duyuru başarılıysa etiketler indirilip basılıyor.
   *
   * **Basım hatası duyuruyu GERİ ÇEKMEZ** (23.7 çizgisi): gönderi alındı ve parası ödendi;
   * basımın düşmesi yüzünden akışı geriye çekmek, ödenmiş bir etiketi kayıt dışı bırakmak olurdu.
   * Kaç etiketin çıktığı ve hata varsa cümlesi karta yazılıyor.
   *
   * Yeniden deneme YOK: sağlayıcıda idempotency anahtarı yok, ikinci çağrı ikinci koli açar.
   */
  const chooseService = useCallback((option: DispatchOptionContract) => {
    setDispatch((current) => {
      if (current.phase !== 'options') return current;
      const { orderId, reference } = current;

      void (async () => {
        const result = await trackWarehouse(
          announceShipment(orderId, { shippingOptionCode: option.code, servicePointId: null, quotedCents: option.priceCents }),
        );
        if (result.error !== null) {
          setDispatch({ phase: 'blocked', reference, reason: result.error });
          return;
        }
        const data = result.data;
        if (data.status !== 'ok') {
          setDispatch({ phase: 'blocked', reference, reason: data.status });
          return;
        }

        const trackingNumbers = data.parcels.map((p) => p.trackingNumber);
        const { printed, error } = await printShippingLabels(data.parcels.map((p) => p.boxId));
        setDispatch({ phase: 'done', reference, trackingNumbers, printed, printError: error });
        await load();
      })();

      return { phase: 'announcing', orderId, reference };
    });
  }, [load]);

  const dismissDispatch = useCallback(() => setDispatch({ phase: 'idle' }), []);

  const reprintLabel = useCallback(() => {
    const target = printTarget.current;
    if (target === null || printState.phase === 'printing') return;
    void runPrint(target.boxId, target.printer);
  }, [printState.phase, runPrint]);

  const openNewBox = useCallback(
    (shippingBoxId: string | null = null) => {
    if (order === null || sending) return;
    setBoxTypeOpen(false);
    setSending(true);
    setNotice(null);

    void (async () => {
      const result = await trackWarehouse(openOrderBox(order.orderId, shippingBoxId));
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
      // Kutu TİPİ geçersiz — sipariş duruyor, liste bayat. `not_found`a katlanmıyor: depocu var
      // olan bir siparişi yok sanardı ve gerçek çare (listeyi tazele) hiç akla gelmezdi.
      if (result.data.status === 'unknown_box') {
        setNotice({ tone: 'warn', text: t.picking.box.typeUnknown });
        void loadShippingBoxes();
        return;
      }
      setNotice({ tone: 'error', text: result.data.status === 'forbidden' ? t.common.outOfScope : t.common.notFound });
    })();
    },
    [load, loadShippingBoxes, order, sending],
  );

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
        /* SEVK TEKLİFİ (07.12) — son kutu kapandığında ve YALNIZ kargo kulvarında.
           Bu satır burada olmak zorunda: sipariş `ready`ye geçince hazırlık kuyruğundan düşüyor
           ve `order` bir sonraki okumada `null` oluyor. Teklif kendi durumunda yaşıyor. */
        if (data.ready && order.deliveryType === 'shipping') {
          setDispatch({ phase: 'offer', orderId: order.orderId, reference: order.referenceNo ?? '—' });
        }
        // Etiket önizlemesi (23.7): içerik kapanışta kesinleşti, sunucudan okunur. Okuma düşerse
        // sessiz kalınır — kapanışın kendisi yazıldı, etiket karta sonra da bakılabilir.
        const labelResult = await fetchBoxLabel(currentBox.boxId);
        if (labelResult.error === null && labelResult.data.status === 'ok') {
          setLabel(labelResult.data.label);
          // Basım kutu kapanışında (karar §1.6) — yazıcı ayarlıysa ve modül bu derlemede varsa.
          // Beklenmez (`void`): kapanışın kendisi yazıldı, kâğıdın seyri kartta ayrıca akar.
          // Kutu yazıcısı da envanterden (07.12 · 29.08): uç artık cevaba yazıcı iliştirmiyor.
          const [liste, secim] = await Promise.all([trackWarehouse(fetchPrinters()), readPrinterChoice()]);
          const printer = liste.error === null ? resolvePrinter(liste.data.printers, 'box', secim) : null;
          if (printer !== null && hasPrinterNativeModule()) {
            printTarget.current = { boxId: currentBox.boxId, printer };
            void runPrint(currentBox.boxId, printer);
          } else {
            printTarget.current = null;
            setPrintState({ phase: 'off' });
          }
        }
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
    askBoxType: shippingLane && shippingBoxes.length > 0,
    boxTypeMissing: shippingLane && shippingBoxes.length === 0,
    shippingBoxes,
    boxTypeOpen,
    setBoxTypeOpen,
    openNewBox,
    sealCurrentBox,
    scanOpen,
    setScanOpen,
    handleScan,
    queueScanOpen,
    setQueueScanOpen,
    scanQueueOrder,
    label,
    dismissLabel: useCallback(() => {
      setLabel(null);
      setPrintState({ phase: 'off' });
      printTarget.current = null;
    }, []),
    printState,
    reprintLabel,
    dispatch,
    startDispatch,
    chooseService,
    dismissDispatch,
  };
}

/**
 * Kapının cevabı → ekrandaki cümle. Dallardan HİÇBİRİ gizlenmez: `ok`+`ready:false` bir hata
 * değil yarım iştir, `pinned_violation` hiçbir şeyin yazılmadığını söyler ve o bilgi bir HTTP
 * koduna indirgenirse depocu neyi yanlış yaptığını göremez.
 *
 * `box_required` pratikte bu ekrandan doğmaz — kargo siparişi zaten kutu moduyla açılıyor ve
 * kutusuz onay CTA'sı hiç çizilmiyor. Yine de yazılı: kapı onu döndürebiliyorsa ekranın cevabı
 * olmalı, yoksa bir gün sessiz bir "hiçbir şey olmadı" hâli doğar.
 */
function noticeOf(outcome: ConfirmOutcome, order: PreparationOrderContract): PreparationNotice {
  if (outcome.status === 'pinned_violation') return { tone: 'error', text: t.picking.result.pinned };
  if (outcome.status === 'forbidden') return { tone: 'error', text: t.common.outOfScope };
  if (outcome.status === 'not_found') return { tone: 'error', text: t.common.notFound };
  if (outcome.status === 'box_required') return { tone: 'error', text: t.picking.result.boxRequired };

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
