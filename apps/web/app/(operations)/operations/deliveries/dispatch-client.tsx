'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { assignCourierAction, moveDeliveryDayAction } from './dispatch-actions';
import { DispatchDesktop } from './dispatch.desktop';
import type { DispatchDayView } from './dispatch-types';

/**
 * Sevkiyatçının gün planının istemci kökü (09.15).
 *
 * **Gün ADRESTE, seçim DEĞİL.** Gün paylaşılabilir ve tazelenince korunmalı bir görünümdür ("yarının
 * listesi"); satır seçimi ise bir işlemin yarısıdır — adrese yazılsaydı geri düğmesi yarım kalmış
 * bir atamayı geri getirirdi. Aynı ayrım Para ve Ürünler ekranlarında da böyle.
 *
 * **Atama sonrası seçim TEMİZLENİR:** aynı satırlar seçili kalsaydı sevkiyatçı bir sonraki kuryeyi
 * seçtiğinde aynı siparişleri farkında olmadan yeniden atardı.
 */
export function DispatchClient({ day }: { day: DispatchDayView }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const goToDate = (date: string) => {
    setSelected([]);
    router.push(`${pathname}?d=${date}`);
  };

  const assign = (courierId: string | null) => {
    setError(null);
    startTransition(async () => {
      const { error: failed } = await assignCourierAction(selected, courierId);
      if (failed) {
        setError(failed);
        return;
      }
      setSelected([]);
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
      // Taşınan sipariş bu günün listesinden düşer — seçiliyse seçimde de kalmamalı.
      setSelected((current) => current.filter((id) => id !== orderId));
      router.refresh();
    });
  };

  /** Bölge başlığı: hepsi seçiliyse bırakır, değilse tamamlar — tek düğme, iki yön. */
  const toggleZone = (zoneId: string) => {
    const zone = day.zones.find((candidate) => candidate.id === zoneId);
    if (!zone) return;
    const ids = zone.stops.map((stop) => stop.orderId);
    setSelected((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : [...new Set([...current, ...ids])],
    );
  };

  return (
    <DispatchDesktop
      day={day}
      selected={selected}
      onToggle={(orderId) =>
        setSelected((current) =>
          current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId],
        )
      }
      onSelectZone={toggleZone}
      onAssign={assign}
      onMove={move}
      onDate={goToDate}
      busy={busy}
      error={error}
    />
  );
}
