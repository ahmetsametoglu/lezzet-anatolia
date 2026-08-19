'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { bringForwardAction, moveDeliveryDayAction, reassignRunAction } from './dispatch-actions';
import { DispatchDesktop } from './dispatch.desktop';
import type { DispatchDayView } from './dispatch-types';

/**
 * Sevkiyatçının gün planının istemci kökü (09.15).
 *
 * **Gün ADRESTE.** Gün paylaşılabilir ve tazelenince korunmalı bir görünümdür ("yarının listesi").
 *
 * **Satır seçimi SÖKÜLDÜ (18.08):** tek tüketicisi toplu kurye atamasıydı ve atama kalktı — kurye
 * rotayı kendisi alıyor (`docs/feature/sefer.md` K2). Kalan tek elle müdahale sefer DEVRİ ve o,
 * seçim istemez: öznesi sipariş kümesi değil, tek sefer.
 */
export function DispatchClient({ day }: { day: DispatchDayView }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const goToDate = (date: string) => {
    router.push(`${pathname}?d=${date}`);
  };

  /** Sefer devri (K2 istisnası) — açık seferi başka kuryeye verir; duraklar sunucuda birlikte döner. */
  const reassign = (runId: string, courierId: string) => {
    setError(null);
    startTransition(async () => {
      const { error: failed } = await reassignRunAction(runId, courierId);
      if (failed) {
        setError(failed);
        return;
      }
      router.refresh();
    });
  };

  const move = (orderId: string, date: string) => {
    setError(null);
    startTransition(async () => {
      const { error: failed } = await moveDeliveryDayAction(orderId, date);
      if (failed) {
        setError(failed);
        return;
      }
      router.refresh();
    });
  };

  /**
   * Askıda kalanı bir güne yazma (16.08). Taşımadan ayrı bir eylem: sunucu tarafında bayat
   * `out_for_delivery` durumunu da çözüyor (`bringForwardAction` künyesi).
   *
   * Satır bu günün listesine düşerse `router.refresh()` onu askıdan çıkarıp yerine koyar; başka bir
   * güne yazıldıysa listeden tamamen kalkar. İki durumda da ekranın kendisi cevabı gösteriyor.
   */
  const bringForward = (orderId: string, date: string) => {
    setError(null);
    startTransition(async () => {
      const { error: failed } = await bringForwardAction(orderId, date);
      if (failed) {
        setError(failed);
        return;
      }
      router.refresh();
    });
  };

  return (
    <DispatchDesktop
      day={day}
      onReassign={reassign}
      onMove={move}
      onBringForward={bringForward}
      onDate={goToDate}
      busy={busy}
      error={error}
    />
  );
}
