'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Input } from '@/components/operation/form/input';
import type { DepotStockThreshold } from '@lezzet/types';
import { setDepotThresholdAction } from '../actions';

interface DepotThresholdCardProps {
  variantId: string;
  threshold: DepotStockThreshold & { warehouseId: string };
  /** Odak deponun kodu; kartın hangi depoya yazdığı okunmadan görülsün. */
  depotCode: string;
}

/** Seçili boyun odak depodaki asgari stok eşiği; boş kayıt istisnayı kaldırır ve depo varyantın varsayılanına döner. */
export function DepotThresholdCard({ variantId, threshold, depotCode }: DepotThresholdCardProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(threshold.overrideQty === null ? '' : String(threshold.overrideQty));
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const trimmed = draft.trim();
  const parsed = trimmed === '' ? null : Number(trimmed);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0);
  const changed = parsed !== threshold.overrideQty;
  const defaultText = threshold.defaultQty === null ? 'eşik yok' : String(threshold.defaultQty);

  const save = (minStockQty: number | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setDepotThresholdAction({ warehouseId: threshold.warehouseId, variantId, minStockQty });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.08em] text-ops-muted">
          Bu depoda eşik · {depotCode}
        </span>
        <span className="font-ops-body text-ops-micro text-ops-faint">
          {threshold.overrideQty === null ? 'varsayılan geçerli' : 'depoya özel'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          inputSize="sm"
          mono
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder={threshold.defaultQty === null ? '—' : String(threshold.defaultQty)}
          aria-label={`${depotCode} deposunda asgari stok eşiği`}
          fullWidth={false}
          className="w-24"
        />
        <Button size="sm" disabled={busy || !valid || !changed} onClick={() => save(parsed)}>
          Kaydet
        </Button>
        {threshold.overrideQty !== null ? (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => save(null)}>
            Varsayılana dön
          </Button>
        ) : null}
      </div>
      <span className="font-ops-body text-ops-micro leading-[1.4] text-ops-faint">
        Boş bırakılırsa varsayılan geçerli: {defaultText} (ürün formundaki min. stok).
      </span>
      {error ? <span className="font-ops-body text-ops-micro text-ops-red">{error}</span> : null}
    </div>
  );
}
