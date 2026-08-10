'use client';

import { resolveLocalizedText, type RecipeDraftPayload } from '@lezzet/types';
import { num } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import type { AssistantRowView } from '../assistant-types';
import { CardLead, Facts, LocaleFact, SubjectBox, SummaryLine, totalQty } from './shared';

/**
 * TARİF TASLAĞI — kararın konusu içerik, ölçüsü MALZEME.
 *
 * ── NEDEN ADIM SAYISI ───────────────────────────────────────────────────────
 * Tarifin hazırlanışı çok dilli tek bir metin (`steps`) ve karta sığmaz. Ama "kaç adım" sayısı
 * kararın ölçeğini söylüyor: iki adımlık bir servis önerisi ile sekiz adımlık bir pişirme tarifi
 * aynı iş değil. Adımlar satır satır yazılıyor (`1.` `2.` …), sayı da satırlardan çıkıyor —
 * ayraç ekranın işi olduğu için (`RecipeDraftPayloadSchema` künyesi) burada da aynı ayraç geçerli.
 *
 * ── AÇIKLAMA VARSA GÖSTERİLİYOR ─────────────────────────────────────────────
 * Tarif müşteri yüzeyine çıkan bir içerik; onaylanan metnin ne olduğu onay anında okunmalı
 * (`product_create`teki tanıtım metniyle aynı gerekçe).
 */
export function RecipeCard({ payload, row }: { payload: RecipeDraftPayload; row: AssistantRowView }) {
  const description = payload.description ? resolveLocalizedText(payload.description, 'tr') : '';
  const steps = resolveLocalizedText(payload.steps, 'tr')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {description ? <CardLead muted>{description}</CardLead> : null}

      <Facts>
        <CardFact label="Malzeme" value={`${num(payload.items.length)} çeşit · ${num(totalQty(payload.items))} ad.`} />
        <CardFact label="Hazırlanış" value={steps.length > 0 ? `${num(steps.length)} adım` : 'yazılmamış'} />
        <CardFact label="Kaç kişilik" value={payload.serves ? resolveLocalizedText(payload.serves, 'tr') : '—'} />
        <LocaleFact texts={[payload.name, payload.steps, payload.description]} />
      </Facts>
    </>
  );
}
