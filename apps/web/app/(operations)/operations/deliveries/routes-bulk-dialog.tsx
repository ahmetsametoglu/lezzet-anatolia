'use client';

import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { placesLabel } from '@/components/operation/ui/labels';
import { keyOfPoint, type ZoneMapPoint } from '@/components/operation/ui/zone-map-model';
import { ROUTE_NOTES } from './deliveries-labels';

/** Kutuyla seçilen kodların onayı: büyük bir alan yanlışlıkla seçilebilir, bu yüzden liste taslağa girmeden önce görülür. */
interface RoutesBulkDialogProps {
  codes: readonly ZoneMapPoint[];
  /** Kutuda olup başka rotada tanımlı olduğu için listeye girmeyen kod sayısı. */
  held: number;
  onClose: () => void;
  onConfirm: () => void;
}

/** Satırda en fazla üç yerleşim adı; kalanı sayılır, kalıcı harita etiketiyle aynı ölçü. */
const ROW_MAX_PLACES = 3;

export function RoutesBulkDialog({ codes, held, onClose, onConfirm }: RoutesBulkDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={460}
      title={ROUTE_NOTES.bulkTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="ml-auto">
            Vazgeç
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {ROUTE_NOTES.bulkConfirm(codes.length)}
          </Button>
        </>
      }
    >
      <p className="font-ops-body text-ops-sm leading-relaxed text-ops-body">{ROUTE_NOTES.bulkQuestion(codes.length)}</p>
      <div className="max-h-[320px] overflow-y-auto rounded-ops-card border border-ops-line">
        {codes.map((code) => (
          <div key={keyOfPoint(code)} className="flex items-baseline gap-2.5 border-b border-ops-line-soft px-3 py-1.5 last:border-b-0">
            <span className="font-ops-mono text-ops-xs text-ops-ink">{code.postalCode}</span>
            <span className="truncate font-ops-body text-ops-xs text-ops-muted">
              {placesLabel(code.places ?? [], ROW_MAX_PLACES) ?? '—'}
            </span>
          </div>
        ))}
      </div>
      {held > 0 ? (
        <p className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5 font-ops-body text-ops-xs leading-relaxed text-ops-amber-dark">
          {ROUTE_NOTES.bulkHeld(held)}
        </p>
      ) : null}
    </Dialog>
  );
}
