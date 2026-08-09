'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordAdjustmentAction } from './adjustments-actions';
import { AdjustmentsDesktop } from './adjustments.desktop';
import type { AdjustmentsData, DraftLine } from './adjustments-types';
import type { WarehouseReason } from '@lezzet/application';

/**
 * Stoktan düşme masasının istemci kökü (10.5).
 *
 * ── OLAY = BİR KÂĞIT ────────────────────────────────────────────────────────
 * Satırlar önce `lines`'ta birikir, kayıt TEK çağrıda yazılır ve hepsi tek belge numarasını
 * paylaşır (`IMH-STR-26-0012`). Bir tepsi bozulunca üç parti birden gider ve denetmenin elindeki
 * kâğıt tektir; her partiyi ayrı göndermek o kâğıdı sistemde üç kayda dağıtırdı — tam da
 * `ADJ_NOTES.documentRule`'un yasakladığı şey. Kapı (`recordAdjustment`) çoklu satırı ilk günden
 * beri destekliyordu; eksik olan yalnız yüzeydi.
 *
 * **Sebep ve not OLAYIN, satırın değil:** arka uç imzası da öyle (`{ lines, reason, note }`).
 * Satır başına sebep, aynı imhanın parçalarını farklı gerekçelere bölerdi.
 *
 * Kayıttan sonra form SIFIRLANIR ve belge numarası yazılır: dolu kalan bir form, ikinci tutanağı
 * yanlışlıkla birincinin kopyası yapardı.
 */
export function AdjustmentsClient({ data }: { data: AdjustmentsData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Yazılacak satırlar + üstünde kurulan taslak satır. İkisi AYRI durum: taslak henüz tutanağa
  // girmemiştir ve "Ekle"ye basılmadan gönderilmemelidir — yoksa yarım yazılmış bir adet kayda
  // geçerdi.
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [draftStockId, setDraftStockId] = useState('');
  const [draftQty, setDraftQty] = useState('');
  const [reason, setReason] = useState<WarehouseReason | ''>('');
  const [note, setNote] = useState('');

  const addLine = () => {
    const qty = Number(draftQty);
    if (!draftStockId || !Number.isInteger(qty) || qty <= 0) return;
    // Aynı parti iki kez EKLENMEZ (ekran zaten engelliyor) — burada da korunuyor, çünkü iki satırın
    // aynı partiye yazılması veritabanında toplam kontrolünü ikiye bölerdi.
    if (lines.some((line) => line.stockId === draftStockId)) return;
    setLines((prev) => [...prev, { stockId: draftStockId, qty }]);
    setDraftStockId('');
    setDraftQty('');
    setSuccess(null);
  };

  const removeLine = (stockId: string) => setLines((prev) => prev.filter((line) => line.stockId !== stockId));

  const submit = () => {
    if (lines.length === 0 || !reason) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const { data: result, error: failed } = await recordAdjustmentAction({
        lines,
        reason,
        note: note.trim() || null,
      });

      if (failed || !result) {
        // Satırlar KORUNUR: kapı "hiçbiri yazılmadı" diyor (`adjust_stock_batch` tek işlem) ve
        // operatörün beş satırlık tutanağı bir hata mesajı uğruna silinemez.
        setError(failed ?? 'Kayıt yazılamadı.');
        return;
      }

      // Belge numarası GÖSTERİLİYOR: denetmenin elindeki kâğıt bu numarayla eşleşiyor, ve operatör
      // onu kaydettiği an not edebilmeli.
      const satir = `${result.lines} satır`;
      setSuccess(result.referenceNo ? `Kayıt yazıldı — belge no ${result.referenceNo} · ${satir}` : `Kayıt yazıldı — ${satir}.`);
      setLines([]);
      setDraftStockId('');
      setDraftQty('');
      setReason('');
      setNote('');
      router.refresh();
    });
  };

  return (
    <AdjustmentsDesktop
      data={data}
      lines={lines}
      draftStockId={draftStockId}
      onDraftStock={setDraftStockId}
      draftQty={draftQty}
      onDraftQty={setDraftQty}
      onAddLine={addLine}
      onRemoveLine={removeLine}
      reason={reason}
      onReason={setReason}
      note={note}
      onNote={setNote}
      busy={busy}
      error={error}
      success={success}
      onSubmit={submit}
    />
  );
}
