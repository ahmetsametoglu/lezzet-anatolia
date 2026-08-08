import { useCallback, useState } from 'react';
import type { WarehouseAdjustmentReason } from '@lezzet/types';

import { recordAdjustment } from '@/lib/api/warehouse';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  D4 · SAYIM / DÜZELTME (v2:427-455). `/warehouse/adjustments`.

  ── İŞARET TERS ÇEVRİLİR, VE BU ÖLÇÜLMÜŞ BİR FARKTIR ────────────────────────
  İki taraf aynı sayıyı TERS işaretle konuşuyor:
  · **Ekran** (v2:437): *"− düşüm · + yalnız sayım fazlasında"* — operatörün dili; stok azaldıysa
    eksi, raftan fazla çıktıysa artı. Kâğıt tutanakla ve sağduyuyla uyumlu olan bu.
  · **Kapı** (`AdjustmentLineSchema.qty`): *"+ stoktan düşüm, − stoğa geri ekleme"* — kaydın dili;
    `stock_adjustment.qty` bir KAYIP sütunudur, net zayiat tek toplamla çıksın diye.

  Çeviri TEK yerde (`toRequestQty`) ve testi var. İki dilden birini ötekine uydurmak seçenek
  değildi: ekranın işaretini kapıya çevirmek operatöre yanlış geleni yazdırır, kapının işaretini
  ekrana taşımak da `+`ı "imha ettim" gibi okuturdu. Sessiz bir işaret hatası burada en pahalı
  hatadır — stoğu düşürmek yerine ARTIRIR ve kimse fark etmez.

  ── SEBEP LİSTESİ TİPTEN GELİR ──────────────────────────────────────────────
  Dört sebep `WarehouseAdjustmentReason`ın kendisidir (`return_restock` varlık enum'undan
  `.exclude` ile çıkarılmış — v2: *"'İade stoğa döndü' depocuya açılmaz"*). Ekran kendi listesini
  yazmaz; yarın beşinci sebep eklenirse burada derleme kırılır ve kimse listeyi unutmaz.

  ── BELGE NUMARASI ÖNCEDEN BİLİNMEZ ─────────────────────────────────────────
  v2 "OLAY REFERANSI"nı ekranda dolu gösteriyor (demo, yerel dize). Gerçekte numarayı VERİTABANI
  üretiyor (`adjust_stock_batch`, depo koduna çıpalı) ve istemcinin onu önceden bilmesinin tek yolu
  uydurmaktır. Kutu bu yüzden kayıttan ÖNCE "kayıttan sonra verilir" der, sonra gerçek numarayı
  yazar — kâğıda yanlış numara geçirmemenin tek dürüst yolu bu.
*/

const t = warehouseCopy;

/** Kapının beş cevabı — sözleşmeden TÜRER, elle yazılmaz. */
type AdjustOutcome = Extract<Awaited<ReturnType<typeof recordAdjustment>>, { error: null }>['data'];

interface AdjustmentNotice {
  tone: 'ok' | 'error';
  text: string;
}

interface UseAdjustmentResult {
  reason: WarehouseAdjustmentReason | null;
  pickReason: (reason: WarehouseAdjustmentReason) => void;
  /** EKRANIN işaretiyle adet: − düşüm, + sayım fazlası. `null` = hiç girilmedi. */
  qty: number | null;
  setQty: (qty: number | null) => void;
  note: string;
  setNote: (note: string) => void;
  /** Stoğa geri ekleme mi — not ZORUNLU olduğu hâl (kuralı veritabanı zorlar). */
  isRestock: boolean;
  /** Fazla yalnız "sayım farkı" sebebiyle yazılabilir (v2'nin `dSayOk`u). */
  surplusAllowed: boolean;
  canSubmit: boolean;
  sending: boolean;
  notice: AdjustmentNotice | null;
  /** Kayıt yazıldıysa OLAY belgesi; öncesinde `null` — uydurulmaz. */
  referenceNo: string | null;
  submit: (stockId: string) => void;
}

/**
 * EKRAN İŞARETİ → KAPI İŞARETİ. Ekranda eksi "stoktan düştü" demek; kayıtta düşüm ARTI yazılır.
 * Tek satır ama bu ekranın en kritik satırı — kendi birim testi var.
 */
export function toRequestQty(screenQty: number): number {
  return -screenQty;
}

export function useAdjustment(): UseAdjustmentResult {
  const [reason, setReason] = useState<WarehouseAdjustmentReason | null>(null);
  const [qty, setQtyState] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<AdjustmentNotice | null>(null);
  const [referenceNo, setReferenceNo] = useState<string | null>(null);

  const pickReason = useCallback((next: WarehouseAdjustmentReason) => {
    setReason(next);
    setNotice(null);
  }, []);

  const setQty = useCallback((next: number | null) => {
    setQtyState(next);
    setNotice(null);
  }, []);

  const isRestock = qty !== null && qty > 0;
  const surplusAllowed = reason === 'count_diff';
  const canSubmit =
    reason !== null &&
    qty !== null &&
    qty !== 0 &&
    // Fazla (stoğa geri ekleme) YALNIZ sayım farkında ve NOTLA yazılır; ikisini de veri zorluyor,
    // ekran yalnız kullanıcıyı boşuna reddettirmiyor.
    (!isRestock || (surplusAllowed && note.trim().length > 0));

  const submit = useCallback(
    (stockId: string) => {
      if (reason === null || qty === null || qty === 0 || sending) return;
      setSending(true);
      setNotice(null);

      void (async () => {
        const trimmed = note.trim();
        const result = await trackWarehouse(
          recordAdjustment({
            lines: [{ stockId, qty: toRequestQty(qty) }],
            reason,
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

        if (result.data.status === 'ok') setReferenceNo(result.data.result.referenceNo);
        setNotice(noticeOf(result.data));
      })();
    },
    [note, qty, reason, sending],
  );

  return {
    reason,
    pickReason,
    qty,
    setQty,
    note,
    setNote,
    isRestock,
    surplusAllowed,
    canSubmit,
    sending,
    notice,
    referenceNo,
    submit,
  };
}

function noticeOf(outcome: AdjustOutcome): AdjustmentNotice {
  switch (outcome.status) {
    case 'ok':
      return {
        tone: 'ok',
        text: fillCopy(t.adjustment.result.ok, {
          ref: outcome.result.referenceNo,
          lines: String(outcome.result.lines),
          qty: String(outcome.result.totalQty),
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
      return { tone: 'error', text: t.adjustment.result.empty };
  }
}
