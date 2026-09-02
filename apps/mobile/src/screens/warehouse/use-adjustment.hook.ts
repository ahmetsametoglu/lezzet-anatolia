import { useCallback, useState } from 'react';
import type { AdjustmentAfter, AdjustmentLineContract, WarehouseAdjustmentReason } from '@lezzet/types';

import { recordAdjustment } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  D4 · SAYIM ve D4b · STOK DÜŞÜMÜ'nün YAZMA yarısı — `/warehouse/adjustments`.

  ── TEK KAPI, İKİ EKRAN (v3 · 02.09) ────────────────────────────────────────
  Tasarım D4'ü ikiye ayırdı ve ayrım DOĞRU: sayım "raftaki gerçek adet kaç" diye sorar ve farkı
  sistem bulur; düşüm "kaç adet eksildi" diye sorar ve sebebini operatör söyler. Yazılan şey ise
  aynı: bir partiye adet farkı. Bu yüzden ekran ikiye ayrıldı, KAPI ayrılmadı — ikinci bir yazma
  yolu, aynı kuralın iki yerde yaşaması demekti (CLAUDE §1).

  ── EKRAN İŞARETLE, KAYIT YÖN ALANIYLA KONUŞUR (27.08 · 06.14) ──────────────
  İki taraf aynı olayı BAŞKA dilde anlatıyor ve çeviri tek yerde (`toRequestLine`, testli):
  · **Ekran**: eksi "stoktan düştü", artı "raftan fazla çıktı" — operatörün ve kâğıt tutanağın dili.
  · **Kapı** (`AdjustmentLine`): `qty` DAİMA POZİTİF, yön ayrı alanda (`direction: 'out' | 'in'`).

  **Kapının dili 06.14'te değişti ve gerekçesi ölçülmüş bir arızaydı** (stok hareket defteri talebi):
  işaret miktara gömülüyken girişler ve çıkışlar aynı toplamda eriyor, "Çıkışlar" sekmesi dönem
  toplamını EKSİ gösteriyordu (−13,49 €). Aynı kuralı para modülü yıllar önce koymuştu
  (`0018_money.sql:35`: *"yön ayrı alandır, işaret tutara gömülmez"*).

  Ekranın dilini kapıya uydurmak yine seçenek DEĞİL: operatör tutanakta eksi görmeli. Sessiz bir
  yön hatası burada en pahalı hatadır — stoğu düşürmek yerine ARTIRIR ve kimse fark etmez.

  ── BELGE NUMARASI ÖNCEDEN BİLİNMEZ ─────────────────────────────────────────
  Numarayı VERİTABANI üretiyor (`adjust_stock_batch`, depo koduna çıpalı) ve istemcinin onu önceden
  bilmesinin tek yolu uydurmaktır. Bu yüzden sonuç kartı KAYITTAN SONRA doğuyor; ekranda önceden
  duran bir "referans" kutusu yok — kâğıda yanlış numara geçirmemenin tek dürüst yolu bu.

  ── SONUÇTAKİ İKİ SAYI ÖLÇÜLÜR, HESAPLANMAZ (02.09) ─────────────────────────
  *"partide 12 → 9"* satırının ikinci sayısı kapıdan geliyor (`after`), ekranın çıkarması değil:
  `eski − düşülen` aynı partiye o sırada dokunan başka bir yazımı (kabul, toplama) sessizce yok
  sayardı. `after: null` = ölçülemedi ve sıfır DEĞİLDİR — ekran o hâlde yeni değeri hiç yazmaz.
*/

const t = warehouseCopy;

/** Kapının beş cevabı — sözleşmeden TÜRER, elle yazılmaz. */
type AdjustOutcome = Extract<Awaited<ReturnType<typeof recordAdjustment>>, { error: null }>['data'];

interface AdjustmentNotice {
  tone: 'ok' | 'error';
  text: string;
}

/** Yazım tuttuğunda ekranın sonuç kartına verdiği her şey. */
export interface AdjustmentRecord {
  referenceNo: string;
  /** Yazımdan sonraki iki sayı; **`null` = ölçülemedi** (uydurulmaz). */
  after: AdjustmentAfter | null;
}

export interface AdjustmentSubmit {
  stockId: string;
  /** EKRANIN işaretiyle adet: − düşüm, + sayım fazlası. */
  qty: number;
  reason: WarehouseAdjustmentReason;
  note?: string | null;
}

interface UseAdjustmentResult {
  sending: boolean;
  notice: AdjustmentNotice | null;
  /** Yazım tuttuysa sonuç; öncesinde `null` — ekran o hâlde formu çizer. */
  record: AdjustmentRecord | null;
  submit: (input: AdjustmentSubmit) => void;
  /** Sonucu bırakıp yeni bir partiye geçmek ("Başka parti say"). */
  reset: () => void;
}

/**
 * EKRAN İŞARETİ → KAYIT SATIRI. Ekranda eksi "stoktan düştü" demek; kayıtta bu, pozitif bir adet
 * ve `direction: 'out'` olur. Artı (sayım fazlası) `'in'`e gider.
 *
 * Bu ekranların en kritik dönüşümü — kendi birim testi var. `Math.abs` bilinçli: yön artık AYRI
 * alanda taşındığı için miktarda işaret kalması, aynı bilgiyi iki yerde tutmak olurdu ve
 * ayrıştıkları gün hangisinin doğru olduğunu söyleyecek bir yer kalmazdı.
 */
export function toRequestLine(stockId: string, screenQty: number): AdjustmentLineContract {
  return { stockId, qty: Math.abs(screenQty), direction: screenQty < 0 ? 'out' : 'in' };
}

export function useAdjustment(): UseAdjustmentResult {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<AdjustmentNotice>();
  const [record, setRecord] = useState<AdjustmentRecord | null>(null);

  const reset = useCallback(() => {
    setRecord(null);
    setNotice(null);
  }, [setNotice]);

  const submit = useCallback(
    (input: AdjustmentSubmit) => {
      if (input.qty === 0 || sending) return;
      setSending(true);
      setNotice(null);

      void (async () => {
        const trimmed = (input.note ?? '').trim();
        const result = await trackWarehouse(
          recordAdjustment({
            lines: [toRequestLine(input.stockId, input.qty)],
            reason: input.reason,
            note: trimmed.length === 0 ? null : trimmed,
          }),
        );
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

        if (result.data.status === 'ok') {
          setRecord({ referenceNo: result.data.result.referenceNo, after: result.data.after });
        }
        setNotice(noticeOf(result.data));
      })();
    },
    [sending, setNotice],
  );

  return { sending, notice, record, submit, reset };
}

function noticeOf(outcome: AdjustOutcome): AdjustmentNotice {
  switch (outcome.status) {
    case 'ok':
      return {
        tone: 'ok',
        text: fillCopy(t.adjustment.outcome.ok, {
          ref: outcome.result.referenceNo,
          lines: String(outcome.result.lines),
          /* İKİ YÖN AYRI DÖNÜYOR (06.14) ve burada TOPLANMAZ: bu ekranlar tek satır gönderiyor,
             yani ikisinden yalnız biri dolu — dolu olanı yazıyoruz. Toplamak, defterin ayırdığı
             iki büyüklüğü geri birleştirmek olurdu; kapının künyesi karışık bir tutanakta çıkan
             *"1 adet · −35,56 €"* sonucunu tam bu yüzden bir arıza olarak kaydetmiş. */
          qty: String(outcome.result.outQty > 0 ? outcome.result.outQty : outcome.result.inQty),
        }),
      };
    case 'failed':
      // Fiziksel gerçeğin reddi AYNEN gösterilir ("partide 3 var, 5 düşülemez") — 21.11c'den beri
      // bu cümle RPC'nin kendi cümlesi, sabit bir yedek metin değil.
      return { tone: 'error', text: outcome.message };
    case 'forbidden':
      return { tone: 'error', text: t.common.outOfScope };
    case 'not_found':
      return { tone: 'error', text: t.common.notFound };
    default:
      return { tone: 'error', text: t.adjustment.outcome.empty };
  }
}
