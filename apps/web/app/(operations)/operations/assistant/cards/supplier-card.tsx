'use client';

import type { SupplierCreatePayload } from '@lezzet/types';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, Facts } from './shared';

/**
 * Tedarikçi önerisinin kartı (22.44) — kimin kartı açılacak ve onu sonra neyle bulacağız: vergi no ve
 * ülke başlığın altında, çünkü asistanın nokta atışı araması (`pinpointSupplier`) o anahtarlara dayanır.
 */
export function SupplierCard({ payload }: { payload: SupplierCreatePayload }) {
  const identity = [payload.country, payload.vatNumber].filter(Boolean).join(' · ');
  return (
    <>
      <BandBox>
        <BandLabel>Yeni tedarikçi</BandLabel>
        <span className="font-ops-display text-ops-lead font-semibold leading-tight text-ops-ink">{payload.name}</span>
        <BandNote>{identity || '—'}</BandNote>
      </BandBox>

      <Facts>
        <CardFact label="Telefon" value={payload.phone ?? '—'} />
        <CardFact label="E-posta" value={payload.email ?? '—'} />
        <CardFact label="Vade" value={payload.paymentTermDays === null ? 'peşin' : `${payload.paymentTermDays} gün`} />
      </Facts>
    </>
  );
}
