'use client';

import { vatLinesTotals } from '@lezzet/domain-core';
import type { MoneyDocumentPayload } from '@lezzet/types';
import { DOCUMENT_KIND_LABEL, VAT_REGIME_LABEL } from '@/components/operation/form/document-form/labels';
import { money, shortDate } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, CardLead, Facts } from './shared';

/**
 * Belge önerisinin kartı: ne kadar, kime, ne zamana kadar; tutarın rengi yönü söyler (bizim ödeyeceğimiz kırmızı, bize ödenecek
 * olive). Rejim yalnız standart değilse satır olur: ters yüklemeli faturada beyan edilecek KDV'yi "KDV 0"dan o ayırır.
 */
export function MoneyDocumentCard({ payload }: { payload: MoneyDocumentPayload }) {
  const out = payload.direction === 'out';
  return (
    <>
      <BandBox>
        <BandLabel>{DOCUMENT_KIND_LABEL[payload.kind]}</BandLabel>
        <span className={`font-ops-mono text-ops-title font-semibold leading-none ${out ? 'text-ops-red' : 'text-ops-olive-dark'}`}>
          {money(payload.amountCents)}
        </span>
        <BandNote>{payload.supplierName ?? payload.counterpartyName ?? '—'}</BandNote>
      </BandBox>

      {payload.note ? <CardLead muted>{payload.note}</CardLead> : null}

      <Facts>
        <CardFact label="Belge no" value={payload.number ?? '—'} />
        <CardFact label="Tarih" value={shortDate(payload.issuedOn)} />
        <CardFact label="Vade" value={payload.dueOn ? shortDate(payload.dueOn) : '—'} />
        <CardFact label="KDV" value={money(vatLinesTotals(payload.vatLines).vatCents)} />
        {payload.vatRegime === 'standard' ? null : <CardFact label="KDV rejimi" value={VAT_REGIME_LABEL[payload.vatRegime]} />}
      </Facts>
    </>
  );
}
