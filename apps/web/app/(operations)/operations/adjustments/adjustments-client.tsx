'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordAdjustmentAction } from './adjustments-actions';
import { AdjustmentsDesktop } from './adjustments.desktop';
import type { AdjustmentsData } from './adjustments-types';
import type { WarehouseReason } from '@/lib/stock/adjustment';

/**
 * Stoktan düşme masasının istemci kökü (10.5).
 *
 * Form kayıttan sonra SIFIRLANIR ve belge numarası yazılır: aynı ekranda ard arda kayıt girmek
 * rutin (bir tepsi bozulunca üç parti birden gidebilir) ve dolu kalan bir form, ikinci kaydı
 * yanlışlıkla birincinin kopyası yapardı.
 */
export function AdjustmentsClient({ data }: { data: AdjustmentsData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [stockId, setStockId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<WarehouseReason | ''>('');
  const [note, setNote] = useState('');

  const submit = () => {
    if (!stockId || !reason) return;
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const { data: result, error: failed } = await recordAdjustmentAction({
        // Tek satır: ekran bugün tek parti düşüyor. Kapı çoklu satırı destekliyor (tek belge
        // numarası altında) ve çoklu giriş sırası gelince aynı çağrıya bağlanır.
        lines: [{ stockId, qty: Number(qty) }],
        reason,
        note: note.trim() || null,
      });

      if (failed || !result) {
        setError(failed ?? 'Kayıt yazılamadı.');
        return;
      }

      // Belge numarası GÖSTERİLİYOR: denetmenin elindeki kâğıt bu numarayla eşleşiyor, ve operatör
      // onu kaydettiği an not edebilmeli.
      setSuccess(result.referenceNo ? `Kayıt yazıldı — belge no ${result.referenceNo}` : 'Kayıt yazıldı.');
      setStockId('');
      setQty('');
      setReason('');
      setNote('');
      router.refresh();
    });
  };

  return (
    <AdjustmentsDesktop
      data={data}
      stockId={stockId}
      onStock={setStockId}
      qty={qty}
      onQty={setQty}
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
