'use client';

import type { ReactNode } from 'react';
import {
  PROPOSAL_PAYLOAD_SCHEMAS,
  type AssistantProposalKind,
  type BatchOfferPayload,
  type DiscountDraftPayload,
  type ProductCreatePayload,
  type ProductDraftPayload,
} from '@lezzet/types';
import { setOfferPriceAction } from '@/lib/stock/offer-actions';
import { saveDiscountAction } from '@/lib/prices/discount-actions';
import { createProductAction, updateProductAction } from '@/lib/catalog/product-actions';
import { ProductFormSchema, toActionPayload, type ProductFormValues } from '@/components/operation/form/product-form/schema';
import {
  discountBlocked,
  discountInputOf,
  discountValuesFromProposal,
  type DiscountFormValues,
} from '@/components/operation/form/discount-form';
import type { ProposalMeta } from '@/components/operation/ui/proposal-aside';
import type { ProposalEconomics } from '@/lib/assistant/economics';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { BatchOfferBody } from './bodies/batch-offer-body';
import { DiscountDraftBody } from './bodies/discount-draft-body';
import { ProductDraftBody, productCreateValuesFrom, productDraftValuesFrom } from './bodies/product-draft-body';

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
  /**
   * Kararın teknik künyesi — dilekçe sütununun "Metadata" görünümü bunu basar (`ProposalAside`).
   *
   * Sözleşmeye TİP BAŞINA değil ortak eklendi ve gövdelerin hepsi olduğu gibi geçiriyor: bir tur bu
   * bilgi diyaloğun dibinde ayrı bir blokta duruyordu ve formun alanını yiyordu (11.08).
   */
  meta: ProposalMeta;
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
  /**
   * Formun açılış değeri — asistanın önerdiği hâl.
   *
   * **Seçenek havuzu da geçilir** (11.08): bazı tiplerin açılış değeri dilekçeden ÇIKMAZ, kaydın
   * bugünkü hâlinden çıkar. Ürün taslağı böyle — form ürünün mevcut kategorisi, KDV'si, varyantları
   * ve beyanlarıyla açılıp asistanın önerisi üzerine yazılır.
   *
   * Havuz bir tur geçilmiyordu ve bedeli ölçüldü: taslak boş şablonla kuruluyor, gövde gerçek kaydı
   * okusa bile form o boş şablonu gösteriyordu (kategori boş, beyan sekmesi tamamen boş). Kaydetme
   * o hâlde ürünün DOLU beyanlarını silerdi — sessizce, çünkü ekran zaten "boş" diyordu.
   */
  initial: (payload: Payload, options: AssistantFormOptions) => Draft;
  render: (args: InlineBodyArgs<Payload, Draft>) => ReactNode;
  /** Kaydetmenin engeli ve SEBEBİ; `null` ise yol açık. Düğme etkin görünüp hiçbir şey yapmasın. */
  blocked: (draft: Draft) => string | null;
  submit: (payload: Payload, draft: Draft, proposalId: string) => Promise<{ error: string | null }>;
  /**
   * Diyaloğun genişliği — TİPE GÖRE (kullanıcı kararı 11.08: *"farklı öneri diyalogları farklı
   * genişlik olması gerekecek, içinin yoğunluğuna, yapılan işe ve komponente göre"*).
   *
   * Tek bir sayı bütün tiplere dayatılıyordu ve ölçüldü: ürün formu tek başına 1180 px için
   * tasarlanmış, yanına dilekçe sütunu gelince 1180'e sığmıyor — kutular kelime ortasından
   * kırılıyordu ("Gelene/ksel/baklav"). Fırsat kartında ise aynı genişlik fazlaydı.
   */
  width?: number;
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
    render: ({ payload, economics, subject, meta, draft, onDraft, disabled, readOnly }) => (
      <BatchOfferBody
        payload={payload}
        economics={economics?.kind === 'offer' ? economics : null}
        subject={subject}
        meta={meta}
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
    // Cümle İKİ dili birden taşıyor ve bu bilinçli: yapılan iş "teklif açmak" (operasyonun kelimesi),
    // müşterinin gördüğü şey "Fırsat" (müşteri yüzeyinin kelimesi). Operatör ikisinin aynı şey
    // olduğunu bir yerde okumalı, yoksa iki ekran arasında bağı kendisi kurmak zorunda kalır.
    appliedNote: 'Teklif açıldı — parti satışa çıktı; müşteri yüzeyinde "Fırsat" olarak görünüyor. Öneri karar geçmişine indi.',
  }),

  discount_draft: defineBody<DiscountDraftPayload, DiscountFormValues>({
    parse: parseWith<DiscountDraftPayload>('discount_draft'),
    // Formun açılış hâli asistanın dilekçesi; hangi kutulara dokunduğu da aynı yerden türer, çünkü
    // ikisi tek bir gerçeğin iki yüzü ve ayrı hesaplanırsa bir gün ayrışırlar.
    initial: (payload) => discountValuesFromProposal(payload).values,
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <DiscountDraftBody
        payload={payload}
        subject={subject}
        options={options}
        meta={meta}
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
    appliedNote: 'İndirim kuralı yazıldı — Fiyatlar → Kuponlar listesinde. Aktif bıraktıysanız koşulları tutan sepetlere işlemeye başladı.',
  }),

  product_draft: defineBody<ProductDraftPayload, ProductFormValues>({
    parse: parseWith<ProductDraftPayload>('product_draft'),
    // İlk değer ÜRÜNÜN BUGÜNKÜ HÂLİ + asistanın önerisi — ikisi bu sırayla, çünkü asistan yalnız
    // birkaç alana dokunuyor ve geri kalanı kayıttan gelmeli. Kayıt okunamazsa gövde formu hiç
    // açmıyor (boş formla kaydetmek dolu beyanları silerdi).
    initial: (payload, options) => productDraftValuesFrom(payload, options.products[payload.productId] ?? null),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <ProductDraftBody
        payload={payload}
        subject={subject}
        options={options}
        meta={meta}
        values={draft}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    // Engel FORMUN kendi şemasından: aynı kural iki yüzeyde ayrışmasın (`ProductFormSchema`).
    blocked: (values) => {
      const parsed = ProductFormSchema.safeParse(values);
      return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Form eksik');
    },
    // Kaydeden kapı ÜRÜN EKRANININKİ: kuyruk ikinci bir yazma yolu açmıyor, `withProposal` da
    // kuyruk satırını kapatıyor.
    submit: (payload, values, proposalId) => updateProductAction(payload.productId, toActionPayload(values), proposalId),
    // Ürün formu tek başına 1180 px için tasarlandı (kendi diyaloğunun ölçüsü); yanına dilekçe
    // sütunu geldiği için o kadar daha gerekiyor. 1560 denendi ve DAR kaldı (kullanıcı ölçümü
    // 11.08): formun sağ rayı (kargo · KDV · marj) ile içerik sütunu hâlâ sıkışıyordu.
    width: 1720,
    // "Kaydet" değil GÜNCELLE: `product_draft` VAR OLAN bir ürünün kaydına yazıyor
    // (`payload.productId`) — yeni ürün ayrı bir tip (aşağıda). Kullanıcının sorusu tam buydu
    // (11.08: *"yeni ürün mü oluşturuyorum yoksa güncelliyor muyum?"*): düğme cevabı vermiyordu ve
    // "kaydet" iki işi birden anlatabilen tek kelime.
    applyLabel: 'Ürünü güncelle',
    appliedNote: 'Ürün güncellendi — katalogda görülebilir. Satış durumu değişmedi: kuyruk içeriği yazar, yayına almaz.',
  }),

  /**
   * YENİ ÜRÜN — `product_draft` ile AYNI GÖVDE (22.16).
   *
   * Kullanıcının sorusu: *"yeni ürün ile ürün düzenleme ayna diyaloğu kullanabilir değil mi?"* Evet,
   * ve ürün ekranında zaten öyle (`ProductFormDialog`, `mode: 'create' | 'edit'`). Değişen ÜÇ şey
   * burada duruyor — açılış değeri (boş şablon + dilekçe), kaydeden kapı (`createProductAction`) ve
   * düğmenin adı. Gövde ikiye bölünseydi bugün kopya olurdu, yarın ayrışırdı.
   */
  product_create: defineBody<ProductCreatePayload, ProductFormValues>({
    parse: parseWith<ProductCreatePayload>('product_create'),
    // Taban FORMUN kendi varsayılanları; dilekçenin `null` bıraktığı alan onları EZMEZ ("okuyamadım"
    // ile "hayır" ayrı şeyler — `ProductCreatePayloadSchema` künyesi).
    initial: (payload) => productCreateValuesFrom(payload),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <ProductDraftBody
        payload={payload}
        subject={subject}
        options={options}
        meta={meta}
        values={draft}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    blocked: (values) => {
      const parsed = ProductFormSchema.safeParse(values);
      return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Form eksik');
    },
    submit: (_payload, values, proposalId) => createProductAction(toActionPayload(values), proposalId),
    width: 1720,
    applyLabel: 'Ürünü oluştur',
    // Kayıt ADAY doğar ve bu cümle bayat DEĞİL: durumu formdaki seçici belirliyor, o seçici kuyrukta
    // yok (kullanıcı kararı 11.08 — kuyruk satış eksenine dokunmaz), yani ürün kapının kendi
    // varsayılanıyla geliyor. Satışa çıkarmak ürün ekranının kararı.
    appliedNote: 'Ürün oluşturuldu — katalogda ADAY olarak duruyor. Satışa çıkarmak ürün ekranının kararı.',
  }),
};

/** Bu tipin kuyruk içinde gövdesi var mı — çerçeve alt barını buna göre kurar. */
export function inlineBodyOf(kind: AssistantProposalKind): ErasedBody | null {
  return INLINE_BODIES[kind] ?? null;
}
