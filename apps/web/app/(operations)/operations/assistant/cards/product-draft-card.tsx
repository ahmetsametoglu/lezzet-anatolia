'use client';

import { resolveLocalizedText, type ProductDraftPayload } from '@lezzet/types';
import { num } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import { draftFieldSummary } from '../assistant-labels';
import type { AssistantRowView } from '../assistant-types';
import { CardLead, Facts, GapFact, LocaleFact, SubjectBox, SummaryLine, UncertainFact } from './shared';

/**
 * ÜRÜN TAMAMLAMA — kararın konusu ürün, ama asıl soru "NE KAYBEDİYORUM".
 *
 * ── ÜZERİNE YAZMA KARTIN EN ÖNEMLİ SAYISI ───────────────────────────────────
 * `updateDetails` düz bir `update`tir ve sürüm tutmaz: dolu bir açıklama onaylandığı an kaybolur,
 * geri getirilemez. Kart "3 kutu dolduruluyor" deyip geçseydi, patron geri alınamaz bir silmeyi
 * "eksik tamamlama" sanarak onaylardı. O yüzden satır ayrı ve tonu uyarıyor.
 *
 * **`currentFields` hiç gelmediyse ne "0" ne de "var" denir** — "eski hâl okunamadı" ayrı bir
 * cevaptır ve karta öyle yazılır (`CLAUDE §1`).
 *
 * ── GÖRSEL ÜRÜNÜN KENDİSİ ───────────────────────────────────────────────────
 * Bu tipte ürün ZATEN VAR, yani fotoğrafı da var: kart onu gösteriyor (`SubjectBox`). Yeni ürün
 * önerisinde (`product_create`) gösteremez, çünkü ortada henüz kayıt yoktur — iki kardeş tipin
 * kartı bu yüzden aynı görünmüyor.
 */
export function ProductDraftCard({ payload, row }: { payload: ProductDraftPayload; row: AssistantRowView }) {
  const summary = draftFieldSummary(payload);
  const newName = payload.fields.name ? resolveLocalizedText(payload.fields.name, 'tr') : '';
  // Ad yazılmıyorsa okunacak ilk metin ne ise o: açıklama → içindekiler → saklama. Kart "3 kutu
  // dolduruluyor" deyip içeriği saklarsa, operatör onaylamak için diyaloğu açmak zorunda kalır ve
  // ızgaranın "bir bakışta karar" vaadi biter.
  const preview = newName
    ? ''
    : [payload.fields.description, payload.fields.ingredients, payload.fields.storageInstructions]
        .filter(Boolean)
        .map((text) => resolveLocalizedText(text!, 'tr'))
        .find((text) => text.trim().length > 0) ?? '';

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {/* ── ASİSTANIN YAZDIĞI DEĞER, KARARIN KENDİSİ ─────────────────────────
          Ad yazılıyorsa büyük ve mor: mor bu ekranda "asistanın dokunduğu yer" rengi (form
          işaretleriyle aynı dil). Ürünün ADI değişiyorsa bu, kartta okunması gereken tek şeydir —
          künyeye "Doldurulan: Ad" yazıp yeni adı saklamak, kararın konusunu gizlemekti. */}
      {newName ? (
        <span className="line-clamp-2 font-ops-display text-ops-lead font-semibold leading-snug text-ops-violet">
          {newName}
        </span>
      ) : preview ? (
        <CardLead muted>{preview}</CardLead>
      ) : null}

      <Facts>
        <CardFact label="Doldurulan" value={summary.labels.length > 0 ? summary.labels.join(' · ') : '—'} />
        <CardFact
          label="Üzerine yazılan"
          value={
            summary.overwrites === null
              ? 'eski hâl okunamadı'
              : summary.overwrites === 0
                ? 'yok — boş kutular'
                : `${num(summary.overwrites)} dolu kutu`
          }
          tone={summary.overwrites ? 'text-ops-amber' : undefined}
        />
        <LocaleFact texts={[payload.fields.name, payload.fields.description, payload.fields.ingredients]} />
        <UncertainFact fields={payload.uncertainFields} />
        <GapFact gaps={payload.remainingGaps} />
      </Facts>
    </>
  );
}
