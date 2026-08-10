'use client';

import type { ReactNode } from 'react';
import {
  PROPOSAL_PAYLOAD_SCHEMAS,
  type AssistantProposalKind,
  type BatchOfferPayload,
  type DiscountDraftPayload,
} from '@lezzet/types';
import { setOfferPriceAction } from '@/lib/stock/offer-actions';
import { saveDiscountAction } from '@/lib/prices/discount-actions';
import {
  discountBlocked,
  discountInputOf,
  discountValuesFromProposal,
  type DiscountFormValues,
} from '@/components/operation/form/discount-form';
import type { ProposalEconomics } from '@/lib/assistant/economics';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { BatchOfferBody } from './bodies/batch-offer-body';
import { DiscountDraftBody } from './bodies/discount-draft-body';

/**
 * ÖNERİ GÖVDELERİ — kuyruğun içinde karar verilen tiplerin kaydı (22.8).
 *
 * ── BU DOSYA `kind`'A GÖRE DALLANAN TEK YERDİR ──────────────────────────────
 * Karar çerçevesi (`DecisionCard`) tipi BİLMEZ: gövdeyi, ilk değerini, engelini ve kaydeden kapısını
 * buradan sorar. Çerçeveye tek bir `if (kind === …)` girseydi, on bir tipin on biri oraya sızardı ve
 * "öğrenilecek tek ekran" vaadi biterdi.
 *
 * ── SÖZLEŞME NEDEN BU BEŞ PARÇA ─────────────────────────────────────────────
 * Gövde kendi durumunu tutmuyor, ÇERÇEVE tutuyor (`draft`) — çünkü kararı yürüten, hatayı gösteren
 * ve kuyruğu tazeleyen taraf çerçeve. Gövde kendi state'ini saklasaydı "kaydet" düğmesi gövdenin
 * içine kaçardı ve her tip kendi alt barını yeniden çizerdi; çizimin tek alt barı budur.
 *
 * ── YAZAN KAPI HEDEF EKRANINKİDİR ───────────────────────────────────────────
 * `submit` yeni bir yazma yolu açmaz: varlığın kendi server action'ını çağırır ve o eylem
 * `withProposal` ile kuyruk satırını da kapatır (`lib/assistant/handoff`). Kuyruk hâlâ uygulamıyor —
 * değişen tek şey formun nerede durduğu.
 */

interface InlineBodyArgs<Payload, Draft> {
  payload: Payload;
  economics: ProposalEconomics | null;
  /** Önerinin konusu (görsel + ad + ilgili ekran); tipin konusu yoksa `null`. */
  subject: ProposalSubject | null;
  /**
   * Formların seçenek havuzu (kategori · koleksiyon). Sözleşmeye TİP BAŞINA değil ortak eklendi:
   * sıradaki gövdeler de aynı iki listeyi isteyecek ve her tip kendi okumasını açsaydı aynı sorgu
   * üç kez koşardı.
   */
  options: AssistantFormOptions;
  draft: Draft;
  onDraft: (next: Draft) => void;
  disabled: boolean;
  /**
   * Karar VERİLMİŞ öneri — aynı gövde, düzenlenmeyen hâliyle çizilir.
   *
   * Arşiv satırına ayrı bir "özet" bileşeni yazmak duplikasyonun kendisiydi: aynı karar iki dilde
   * anlatılır ve bir gün biri ötekinden ayrışırdı. Tek gövde, iki hâl.
   */
  readOnly: boolean;
}

interface InlineBody<Payload, Draft> {
  /** Ham dilekçe → tipin payload'ı; şekil tutmuyorsa `null` (çerçeve o zaman önizlemeye düşer). */
  parse: (raw: unknown) => Payload | null;
  /** Formun açılış değeri — asistanın önerdiği hâl. */
  initial: (payload: Payload) => Draft;
  render: (args: InlineBodyArgs<Payload, Draft>) => ReactNode;
  /** Kaydetmenin engeli ve SEBEBİ; `null` ise yol açık. Düğme etkin görünüp hiçbir şey yapmasın. */
  blocked: (draft: Draft) => string | null;
  submit: (payload: Payload, draft: Draft, proposalId: string) => Promise<{ error: string | null }>;
  /** Alt bardaki onay düğmesinin metni — "Uygula" değil, işin kendi adı. */
  applyLabel: string;
  /** Karardan sonra söylenecek cümle; kuyruk tazelendiğinde kart başka öneriye geçmiş olur. */
  appliedNote: string;
}

/** Tip güvenliğini kaydın İÇİNDE tutar, dışarıya silinmiş (`unknown`) hâliyle verir. */
type ErasedBody = InlineBody<unknown, unknown>;
function defineBody<Payload, Draft>(body: InlineBody<Payload, Draft>): ErasedBody {
  return body as ErasedBody;
}

/** `PROPOSAL_PAYLOAD_SCHEMAS`ten şekil doğrulaması — `as` ile kesilmez, bozuk dilekçe `null` döner. */
function parseWith<Payload>(kind: AssistantProposalKind) {
  return (raw: unknown): Payload | null => {
    const schema = (
      PROPOSAL_PAYLOAD_SCHEMAS as Partial<
        Record<AssistantProposalKind, { safeParse: (v: unknown) => { success: boolean; data?: unknown } }>
      >
    )[kind];
    const parsed = schema?.safeParse(raw);
    return parsed?.success ? (parsed.data as Payload) : null;
  };
}

const INLINE_BODIES: Partial<Record<AssistantProposalKind, ErasedBody>> = {
  batch_offer: defineBody<BatchOfferPayload, number | null>({
    parse: parseWith<BatchOfferPayload>('batch_offer'),
    initial: (payload) => payload.offerPriceCents,
    render: ({ payload, economics, subject, draft, onDraft, disabled, readOnly }) => (
      <BatchOfferBody
        payload={payload}
        economics={economics?.kind === 'offer' ? economics : null}
        subject={subject}
        valueCents={draft}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    // Maliyetin ALTINDA fiyat engel DEĞİLDİR — zararına satmak bir karardır; ekran onu cümleyle
    // söyler, yolu kapatmaz. Engel yalnız yazılamayacak değerlerde.
    blocked: (cents) => (cents === null ? 'Teklif fiyatı girilmeli' : cents <= 0 ? 'Fiyat sıfırdan büyük olmalı' : null),
    submit: (payload, cents, proposalId) => setOfferPriceAction(payload.batchId, cents, proposalId),
    applyLabel: 'Teklifi aç',
    appliedNote: 'Teklif açıldı — parti fırsat olarak vitrine düştü. Öneri karar geçmişine indi.',
  }),

  discount_draft: defineBody<DiscountDraftPayload, DiscountFormValues>({
    parse: parseWith<DiscountDraftPayload>('discount_draft'),
    // Formun açılış hâli asistanın dilekçesi; hangi kutulara dokunduğu da aynı yerden türer, çünkü
    // ikisi tek bir gerçeğin iki yüzü ve ayrı hesaplanırsa bir gün ayrışırlar.
    initial: (payload) => discountValuesFromProposal(payload).values,
    render: ({ payload, subject, options, draft, onDraft, disabled, readOnly }) => (
      <DiscountDraftBody
        payload={payload}
        subject={subject}
        options={options}
        values={draft}
        filled={discountValuesFromProposal(payload).filled}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    // Engel formun kendi dosyasından: iki yüzey aynı emniyeti paylaşmazsa kural bir ekranda
    // kaydedilir ötekinde reddedilir.
    blocked: discountBlocked,
    submit: (_payload, values, proposalId) => saveDiscountAction(discountInputOf(values, null), proposalId),
    applyLabel: 'İndirimi kaydet',
    appliedNote:
      'İndirim kuralı yazıldı — Fiyatlar → Kuponlar listesinde. Aktif bıraktıysanız koşulları tutan sepetlere işlemeye başladı.',
  }),
};

/** Bu tipin kuyruk içinde gövdesi var mı — çerçeve alt barını buna göre kurar. */
export function inlineBodyOf(kind: AssistantProposalKind): ErasedBody | null {
  return INLINE_BODIES[kind] ?? null;
}
