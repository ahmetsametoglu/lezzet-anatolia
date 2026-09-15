'use client';

import type { MoneyDocumentPayload } from '@lezzet/types';
import { DOCUMENT_KIND_LABEL, VAT_REGIME_LABEL } from '@/components/operation/form/document-form/labels';
import { money, shortDate } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { BandBox, BandLabel, BandNote, CardLead, Facts } from './shared';

/**
 * Belge önerisinin kartı (22.44) — "ne kadar, kime, ne zamana kadar". Tutarın rengi YÖN: bizim
 * ödeyeceğimiz belge kırmızı, bize ödenecek olan olive (para kartının sözlüğü). Rejim yalnız
 * standart değilse bir satır olur: ters yüklemeli faturada "KDV 0" ile beyan edilecek KDV'yi o ayırır.
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
        <CardFact label="KDV" value={payload.vatAmountCents === null ? '—' : money(payload.vatAmountCents)} />
        {payload.vatRegime === 'standard' ? null : <CardFact label="KDV rejimi" value={VAT_REGIME_LABEL[payload.vatRegime]} />}
      </Facts>
    </>
  );
}
