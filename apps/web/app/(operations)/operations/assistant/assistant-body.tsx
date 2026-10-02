'use client';

import type { ReactNode } from 'react';
import {
  PROPOSAL_PAYLOAD_SCHEMAS,
  type AssistantProposalKind,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type FeaturedFlagPayload,
  type MoneyDocumentPayload,
  type MoneyMovementPayload,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type SupplierCreatePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import { toCents } from '@lezzet/helper';
import { createDocumentAction, recordManualMovementAction, recordTransferAction } from '@/lib/finance/actions';
import { saveSupplierAction } from '@/lib/stock/supplier-actions';
import { DocumentFormSchema, documentBlock, documentInputOf, invoiceTermsOf } from '@/components/operation/form/document-form/schema';
import { uploadDocumentFile } from '@/components/operation/form/document-form/file-field';
import { SupplierFormValuesSchema, type SupplierFormValues } from '@/components/operation/form/supplier-form/schema';
import { ManualMovementSchema, movementBlock, type ManualMovementForm } from '@/components/operation/form/movement-form/schema';
import { TransferFormSchema, transferBlock, type TransferForm } from '@/components/operation/form/transfer-form/schema';
import { receiveIntakeFromProposalAction } from '@/lib/warehouse/intake-actions';
import { countedLines, intakeBlock } from '@/components/operation/form/intake-form/schema';
import { createDraftFromProposalAction } from '@/lib/stock/purchase-order-actions';
import { purchaseOrderBlock } from '@/components/operation/form/purchase-order-form/schema';
import { setFeaturedGridFromProposalAction } from '@/lib/catalog/featured-actions';
import type { FeaturedFormValues } from '@/components/operation/form/featured-form/schema';
import { addZoneCodesFromProposalAction } from '@/lib/delivery/zone-actions';
import { zoneBlock, type ZoneFormValues } from '@/components/operation/form/zone-form/schema';
import { saveRecipeAction } from '@/lib/catalog/recipe-actions';
import { RecipeFormSchema, recipeBlock, type RecipeFormValues } from '@/components/operation/form/recipe-form/schema';
import { createBundleAction } from '@/lib/catalog/bundle-actions';
import {
  BundleFormSchema,
  bundleBlock,
  toBundlePayload,
  type BundleFormValues,
} from '@/components/operation/form/bundle-form/schema';
import { batchOfferBlock } from '@/lib/assistant/offer-block';
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
import { BundleDraftBody, bundleDraftValuesFrom } from './bodies/bundle-draft-body';
import { RecipeDraftBody, recipeDraftValuesFrom } from './bodies/recipe-draft-body';
import { MoneyMovementBody, movementValuesFrom } from './bodies/money-movement-body';
import { MoneyDocumentBody, documentValuesFrom, type DocumentDraft } from './bodies/money-document-body';
import { TransferBody, transferValuesFrom } from './bodies/transfer-body';
import { StockIntakeBody, intakeInvoiceBlock, intakeValuesFrom, type IntakeDraft } from './bodies/stock-intake-body';
import { PurchaseOrderBody, purchaseOrderInvoiceBlock, purchaseOrderValuesFrom, type PurchaseOrderDraft } from './bodies/purchase-order-body';
import { SupplierCreateBody, supplierValuesFrom } from './bodies/supplier-create-body';
import { FeaturedFlagBody, featuredValuesFrom } from './bodies/featured-flag-body';
import { ZoneExtendBody, zoneValuesFrom } from './bodies/zone-extend-body';
import { DiscountDraftBody } from './bodies/discount-draft-body';
import { ProductDraftBody, productCreateValuesFrom, productDraftValuesFrom } from './bodies/product-draft-body';

/**
 * Öneri gövdeleri: kuyrukta karar verilen tiplerin kaydı ve `kind`a göre dallanan tek yer, çünkü karar çerçevesi (`DecisionCard`) tipi
 * bilmez ve gövdeyi, ilk değeri, engeli ve kapıyı buradan sorar. Taslağı çerçeve tutar ve `submit` varlığın kendi server action'ını
 * çağırır (`withProposal`), yani kuyruk ikinci bir yazma yolu açmaz.
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
  /** Kararın teknik künyesi; dilekçe sütununun "Metadata" görünümü bunu basar (`ProposalAside`), formun alanını yemesin diye. */
  meta: ProposalMeta;
  draft: Draft;
  onDraft: (next: Draft) => void;
  disabled: boolean;
  /**
   * Karar verilmiş öneri: aynı gövde, düzenlenmeyen hâliyle çizilir. Arşive ayrı bir özet bileşeni aynı kararı iki dilde anlatır ve bir
   * gün ayrışırdı.
   */
  readOnly: boolean;
}

interface InlineBody<Payload, Draft> {
  /** Ham dilekçe → tipin payload'ı; şekil tutmuyorsa `null` (çerçeve o zaman önizlemeye düşer). */
  parse: (raw: unknown) => Payload | null;
  /**
   * Formun açılış değeri, asistanın önerdiği hâl. Seçenek havuzu da geçilir, çünkü bazı tiplerin açılışı kaydın bugünkü hâlinden çıkar
   * (ürün taslağı mevcut kategori, KDV, varyant ve beyanlarla açılır); boş şablonla açılan form kaydedilince dolu beyanları silerdi.
   */
  initial: (payload: Payload, options: AssistantFormOptions) => Draft;
  render: (args: InlineBodyArgs<Payload, Draft>) => ReactNode;
  /**
   * Kaydetmenin engeli ve sebebi; `null` ise yol açık. `payload` ve `economics` de verilir, çünkü engel her zaman taslaktan okunmaz:
   * yasak partinin hâli dilekçede ve ekonomi okumasında durur.
   */
  blocked: (draft: Draft, payload: Payload, economics: ProposalEconomics | null) => string | null;
  submit: (payload: Payload, draft: Draft, proposalId: string) => Promise<{ error: string | null }>;
  /**
   * Diyaloğun genişliği, tipe göre: içeriğin yoğunluğu tipten tipe değişir ve ürün formu dilekçe sütunuyla birlikte tek genişliğe
   * sığmıyordu, fırsat kartına ise fazlaydı.
   */
  width?: number;
  /** Alt bardaki onay düğmesinin metni — "Uygula" değil, işin kendi adı. */
  applyLabel: string | ((payload: Payload) => string);
  /**
   * Karardan sonra söylenecek cümle; kuyruk tazelenince kart başka öneriye geçer. Dilekçeye göre değişebilir, çünkü aynı tip iki iş
   * yapabilir (tedarik siparişi eşik altından taslak, faturadan gönderilmiş sipariş açar) ve tek cümle birinde yanlış olurdu.
   */
  appliedNote: string | ((payload: Payload) => string);
}

/** Düğmenin metni — sabit ya da dilekçeye göre (`InlineBody.appliedNote` künyesi). */
export function applyLabelOf(body: ErasedBody, payload: unknown): string {
  return typeof body.applyLabel === 'function' ? body.applyLabel(payload) : body.applyLabel;
}

/** Karardan sonraki cümle — sabit ya da dilekçeye göre. */
export function appliedNoteOf(body: ErasedBody, payload: unknown): string {
  return typeof body.appliedNote === 'function' ? body.appliedNote(payload) : body.appliedNote;
}

/**
 * Para önerisinin taslağı: tek tip, iki hâl (elle giriş ve transfer). Alanları örtüşmediği için ayrımcı birleşimdir; düz nesne her
 * hâlde ötekinin boş alanlarını da taşırdı.
 */
type MoneyDraft = { kind: 'manual'; values: ManualMovementForm } | { kind: 'transfer'; values: TransferForm };

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
    /**
     * Maliyetin altında fiyat engel değildir, zararına satmak bir karardır; engel yalnız yazılamayacak değerlerdedir. SKT'si geçmiş parti
     * de burada engel değildir, çünkü yanlış tespitle kapanan düğme akışı tıkar; yasak ekranda görünür (`offer-block` künyesi).
     */
    blocked: (cents) => batchOfferBlock({ offerPriceCents: cents }),
    submit: (payload, cents, proposalId) => setOfferPriceAction(payload.batchId, cents, proposalId),
    applyLabel: 'Teklifi aç',
    // Cümle İKİ dili birden taşıyor ve bu bilinçli: yapılan iş "teklif açmak" (operasyonun kelimesi),
    // müşterinin gördüğü şey "Fırsat" (müşteri yüzeyinin kelimesi). Operatör ikisinin aynı şey
    // olduğunu bir yerde okumalı, yoksa iki ekran arasında bağı kendisi kurmak zorunda kalır.
    appliedNote: 'Teklif açıldı — parti satışa çıktı; müşteri yüzeyinde "Fırsat" olarak görünüyor. Öneri karar geçmişine indi.',
  }),

  bundle_draft: defineBody<BundleDraftPayload, BundleFormValues>({
    parse: parseWith<BundleDraftPayload>('bundle_draft'),
    // Açılış BOŞ ŞABLON + asistanın önerisi: paket taslağı var olan bir kaydın üstüne yazmıyor,
    // yeni bir paket kuruyor (ürün taslağının tersi durum — orada kaydın bugünkü hâli tabandı).
    initial: (payload) => bundleDraftValuesFrom(payload),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <BundleDraftBody
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
    /**
     * Engel İKİ kaynaktan ve ikisi de FORMUN kendi dosyasından: şema (ad, fiyat) ve MUTABAKAT
     * (`bundleBlock` — kalem payları paket fiyatını tutuyor mu). Kuyruk kendi kuralını yazmıyor;
     * yazsaydı aynı paket kuyrukta kaydedilir, paket ekranında reddedilirdi.
     */
    blocked: (values) => {
      const parsed = BundleFormSchema.safeParse(values);
      if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Form eksik';
      return bundleBlock(values)?.message ?? null;
    },
    // Kaydeden kapı PAKET EKRANININKİ: kuyruk ikinci bir yazma yolu açmıyor, `withProposal` da
    // kuyruk satırını kapatıyor ve doğan paketin kimliğini künyeye yazıyor.
    submit: (_payload, values, proposalId) => createBundleAction(toBundlePayload(values), proposalId),
    // Paket formu iki sütun ve kalem editörü taşıyor; dilekçe sütunu yanına gelince kalem satırı (ad, adet, birim fiyat, pay, marj) dar
    // alanda okunmuyor.
    width: 1640,
    applyLabel: 'Paketi oluştur',
    appliedNote: 'Paket oluşturuldu — Ürünler → Paketler sekmesinde. Satışta bıraktıysanız müşteri yüzeyinde görünüyor.',
  }),

  recipe_draft: defineBody<RecipeDraftPayload, RecipeFormValues>({
    parse: parseWith<RecipeDraftPayload>('recipe_draft'),
    initial: (payload) => recipeDraftValuesFrom(payload),
    render: ({ payload, subject, meta, draft, onDraft, disabled, readOnly }) => (
      <RecipeDraftBody
        payload={payload}
        subject={subject}
        meta={meta}
        values={draft}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    // Engel FORMUN kendi dosyasından — tarif ekranının altlığı da aynı fonksiyonu okuyor.
    blocked: (values) => {
      const parsed = RecipeFormSchema.safeParse(values);
      if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Form eksik';
      return recipeBlock(values);
    },
    submit: (_payload, values, proposalId) => saveRecipeAction(values, proposalId),
    // Tarif formu tek sütun ve alanları uzun metin: paket kadar genişliğe ihtiyacı yok, ama üç
    // dilli çok satırlı kutular dar alanda okunmuyor.
    width: 1320,
    applyLabel: 'Tarifi kaydet',
    appliedNote: 'Tarif kaydedildi — Tarifler ekranında. Yayına almak ayrı bir karar ve orada yapılır.',
  }),

  /**
   * Para: iki hâli var, elle giriş (gider, sermaye, sınıflandırılmamış) ve transfer; ikisi de kendi formuyla açılır, çünkü uydurma
   * değerlerle açılan form yanlış bir defter satırı demektir. İki hâl tek gövdede durur, çünkü tek öneri tipidir; ayrı tip şemayı ve
   * asistanın araç kataloğunu ikiye bölerdi.
   */
  money_movement: defineBody<MoneyMovementPayload, MoneyDraft>({
    parse: parseWith<MoneyMovementPayload>('money_movement'),
    initial: (payload, options) => {
      // Sözlük seçeneklerden: asistanın kategori kelimesi ancak sözlükte varsa tür olur.
      const manual = movementValuesFrom(payload, options.natures);
      return manual ? { kind: 'manual', values: manual } : { kind: 'transfer', values: transferValuesFrom(payload) };
    },
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) =>
      draft.kind === 'transfer' ? (
        <TransferBody
          payload={payload}
          subject={subject}
          options={options}
          meta={meta}
          values={draft.values}
          onChange={(next) => onDraft({ kind: 'transfer', values: next })}
          disabled={disabled}
          readOnly={readOnly}
        />
      ) : (
        <MoneyMovementBody
          payload={payload}
          subject={subject}
          options={options}
          meta={meta}
          values={draft.values}
          onChange={(next) => onDraft({ kind: 'manual', values: next })}
          disabled={disabled}
          readOnly={readOnly}
        />
      ),
    blocked: (draft) => {
      if (draft.kind === 'transfer') {
        const parsed = TransferFormSchema.safeParse(draft.values);
        if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Form eksik';
        return transferBlock(draft.values);
      }
      const parsed = ManualMovementSchema.safeParse(draft.values);
      if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Form eksik';
      return movementBlock(draft.values);
    },
    submit: (_payload, draft, proposalId) =>
      draft.kind === 'transfer'
        ? recordTransferAction(
            {
              fromAccountId: draft.values.fromAccountId,
              toAccountId: draft.values.toAccountId,
              // EURO → CENT sınırda: kapı cent istiyor.
              amountCents: toCents(draft.values.amount ?? 0),
              valueDate: draft.values.valueDate,
              description: draft.values.description,
            },
            proposalId,
          )
        : recordManualMovementAction({
            accountId: draft.values.accountId,
            type: draft.values.type,
            // EURO → CENT sınırda (`ManualMovementSchema` künyesi): kapı cent istiyor.
            amountCents: toCents(draft.values.amount ?? 0),
            direction: draft.values.direction,
            nature: draft.values.nature || null,
            counterpartyId: draft.values.counterpartyId || null,
            tags: draft.values.tags,
            campaign: draft.values.campaign,
            valueDate: draft.values.valueDate,
            description: draft.values.description,
            documentId: draft.values.documentId,
            proposalId,
          }),
    // Form dar ve tek sütun (finans diyaloğu 560 px için tasarlandı); yanına dilekçe sütunu geliyor.
    width: 1120,
    applyLabel: 'Hareketi kaydet',
    appliedNote: 'Defter satırı yazıldı — Para ekranındaki hareketler listesinde. Hesabın bakiyesi güncellendi.',
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
    // Ürün formu tek başına kendi diyaloğunun genişliğine göre tasarlandı; yanına dilekçe sütunu geldiği için o kadar daha gerekir,
    // yoksa formun sağ rayı (kargo, KDV, marj) sıkışır.
    width: 1720,
    // "Kaydet" değil "Güncelle": `product_draft` var olan bir ürünün kaydına yazar (`payload.productId`), yeni ürün ayrı tiptir;
    // "kaydet" iki işi birden anlatabilen tek kelime olurdu.
    applyLabel: 'Ürünü güncelle',
    appliedNote: 'Ürün güncellendi — katalogda görülebilir. Satış durumu değişmedi: kuyruk içeriği yazar, yayına almaz.',
  }),

  /**
   * Yeni ürün: `product_draft` ile aynı gövde, ürün ekranının `ProductFormDialog`ı gibi. Değişen üç şey burada durur: açılış değeri (boş
   * şablon ve dilekçe), kaydeden kapı (`createProductAction`) ve düğmenin adı.
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
    // Kayıt aday doğar: durumu formdaki seçici belirler ve o seçici kuyrukta yoktur, çünkü kuyruk satış eksenine dokunmaz; satışa
    // çıkarmak ürün ekranının kararıdır.
    appliedNote: 'Ürün oluşturuldu — katalogda ADAY olarak duruyor. Satışa çıkarmak ürün ekranının kararı.',
  }),

  /**
   * Bölge genişletme: harita kuyruğun içinde çizilir, çünkü karar burada verilir ve dayanağı haritadır.
   */
  zone_extend: defineBody<ZoneExtendPayload, ZoneFormValues>({
    parse: parseWith<ZoneExtendPayload>('zone_extend'),
    initial: (payload) => zoneValuesFrom(payload),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <ZoneExtendBody
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
    // Tek engel BOŞ seçim (`zoneBlock`): seçimsiz onay bölgeye hiçbir şey eklemez. Az kod seçmek
    // engel DEĞİL — dilekçenin üç kodundan birini almak bu formun varlık sebebi.
    blocked: (values) => zoneBlock(values),
    submit: async (payload, values, proposalId) => {
      const chosen = new Set(values.selectedKeys);
      const result = await addZoneCodesFromProposalAction({
        // Hedef taslaktan okunur: operatör dilekçenin önerdiği rotayı değiştirmiş olabilir; `payload.zoneId` yazılsaydı seçim hiçbir
        // yere gitmezdi.
        zoneId: values.zoneId,
        // Gönderilen küme dilekçenin kodlarından SÜZÜLÜYOR, taslaktan çözülmüyor: anahtarlar
        // istemcide kuruluyor ve sunucuya kod listesi gitmeli, anahtar dizesi değil.
        codes: payload.postalCodes
          .filter((code) => chosen.has(`${payload.country}:${code.postalCode}`))
          .map((code) => ({ country: payload.country, postalCode: code.postalCode })),
        proposalId,
      });
      return { error: result.error };
    },
    /**
     * Harita, kanıt listesi ve künye rayı yan yana durur; harita ile kod listesi dar tek kolonu paylaşmasın diye genişlik onlara göredir,
     * en geniş iki gövdenin altında kalır.
     */
    width: 1600,
    applyLabel: 'Bölgeye ekle',
    appliedNote:
      'Kodlar bölgeye eklendi. Haber bekleyen müşterilere "bölgeniz açıldı" bildirimi uzlaştırma işiyle gidiyor (saatte bir) — geri alınamaz.',
  }),

  /**
   * Vitrin işareti: vitrin kontenjanlı bir seçkidir ve dolu ızgaraya ekleme sıradakini ana sayfadan düşürür, bu yüzden kararın tamamı
   * ortak formla (`featured-form/`) diyaloğun içinde verilir. Açılış değeri ızgaranın bugünkü hâli ve dilekçenin istediği değişikliktir.
   */
  featured_flag: defineBody<FeaturedFlagPayload, FeaturedFormValues>({
    parse: parseWith<FeaturedFlagPayload>('featured_flag'),
    initial: (payload, options) => featuredValuesFrom(payload, options),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <FeaturedFlagBody
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
    // **ENGEL YOK ve bu bilinçli:** ızgarayı boşaltmak da geçerli bir karardır (vitrini kapatmak),
    // kontenjan aşımı ise bir kural değil uyarıdır — operatör bilerek fazla işaretleyip yayın
    // sırasını sonra düzenleyebilir (`catalog-tab` kararı). Engel koymak, ekranda serbest olan bir
    // işi kuyrukta yasaklamak olurdu.
    blocked: () => null,
    submit: (payload, values, proposalId) =>
      setFeaturedGridFromProposalAction({ target: payload.target, featuredIds: values.featuredIds, proposalId }),
    // Liste dar: tek sütun + sağda dilekçe. Kalemli formlar kadar yer istemiyor.
    width: 980,
    applyLabel: 'Vitrini güncelle',
    appliedNote: 'Vitrin ızgarası güncellendi — ana sayfada görünen seçki değişti.',
  }),

  /**
   * Tedarik siparişi: kalemler kuyrukta düzenlenir, çünkü adetleri eşiği bilen ama kasayı bilmeyen motor hesaplar; form tedarik ekranının
   * ortak formudur (`purchase-order-form/`). Kaydeden kapı kalemleri formdan yazar (`createDraftFromProposalAction`), dilekçeden yazsaydı
   * ekranda görünen ile deftere geçen sessizce ayrışırdı.
   */
  purchase_order: defineBody<PurchaseOrderPayload, PurchaseOrderDraft>({
    parse: parseWith<PurchaseOrderPayload>('purchase_order'),
    initial: (payload) => purchaseOrderValuesFrom(payload),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <PurchaseOrderBody
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
    blocked: (draft, payload) => purchaseOrderBlock(draft.order) ?? purchaseOrderInvoiceBlock(draft, payload),
    submit: async (payload, draft, proposalId) => {
      const invoice = draft.invoice && payload.invoice ? invoiceTermsOf(draft.invoice) : null;
      const result = await createDraftFromProposalAction({
        supplierId: draft.order.supplierId,
        // Boş bırakmak GEÇERLİ ve `null` onu söylüyor — hedefi bilinmeyen sipariş hiçbir deponun
        // eksiğini kapatmış sayılmaz (şema künyesi).
        targetWarehouseId: draft.order.targetWarehouseId || null,
        note: draft.order.note.trim() || null,
        // Faturadan siparişte birim fiyat faturanındır; eşik altı önerisinde boştur ve kapı eşlemedeki son alışı yazar.
        lines: draft.order.lines.map((line) => ({ variantId: line.variantId, qty: line.qty, unitPriceCents: line.unitPriceCents })),
        invoice:
          invoice && payload.invoice
            ? {
                number: payload.invoice.number,
                issuedOn: payload.invoice.issuedOn,
                amountCents: invoice.amountCents,
                vatAmountCents: invoice.vatAmountCents,
                vatRegime: invoice.vatRegime,
                dueOn: invoice.dueOn,
              }
            : null,
        // Eşleme önerileri: onay, tedarikçinin kalem eşlemesinin de onayıdır.
        mappings: payload.lines
          .filter((line) => line.mappingProposed && line.supplierItemKey)
          .map((line) => ({ variantId: line.variantId, supplierCode: line.supplierItemKey as string, nameAtSupplier: line.supplierItemName })),
        proposalId,
      });
      if (result.error) return { error: result.error };
      // Dosya belge YAZILDIKTAN sonra: anahtar belgenin kimliğinden kurulur (`uploadDocumentFile`).
      if (draft.file && result.data?.documentId) return { error: await uploadDocumentFile(result.data.documentId, draft.file) };
      return { error: null };
    },
    // Satır ızgarası dört kolon; dar sütunda ürün adı ile adet birbirine giriyor.
    width: 1180,
    applyLabel: (payload) => (payload.source === 'invoice' ? 'Siparişi ve faturayı kaydet' : 'Taslağı oluştur'),
    // Taslak gönderilmez (`applyPurchaseOrder` künyesi): onay "bu siparişi hazırla" demektir, "tedarikçiye yolla" değil; faturadan
    // siparişte sipariş zaten verilmiştir.
    appliedNote: (payload) =>
      payload.source === 'invoice'
        ? 'Sipariş GÖNDERİLMİŞ açıldı ve fatura siparişe bağlı belge olarak kaydedildi — mal gelince rampa sayar, borç Para ekranında.'
        : 'Sipariş TASLAK olarak açıldı — Tedarik ekranından gözden geçirip gönderin.',
  }),

  /**
   * Mal kabul: giren parti satılabilir olur ve SKT o an sabitlenir, bu yüzden faturadan okunan miktar karardan önce gözle doğrulanır.
   * Kaydeden kapı fiyatı formdan yazar (`receiveIntakeFromProposalAction`) ki yanlış okunan maliyet onaydan önce düzeltilebilsin.
   */
  stock_intake: defineBody<StockIntakePayload, IntakeDraft>({
    parse: parseWith<StockIntakePayload>('stock_intake'),
    initial: (payload) => intakeValuesFrom(payload),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <StockIntakeBody
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
    // Faturanın engeli satırlarınkinden sonra gelir: toplam boşsa fatura yok, engel de yok.
    blocked: (draft) => intakeBlock(draft.intake) ?? intakeInvoiceBlock(draft),
    submit: async (payload, draft, proposalId) => {
      const values = draft.intake;
      const result = await receiveIntakeFromProposalAction({
        warehouseId: values.warehouseId,
        // Eşleme önerileri: dilekçede işaretli kalemler, giriş onaylanınca tedarikçi eşlemesine bu anahtar ve adla yazılır; sonraki
        // fatura kendiliğinden eşleşir.
        mappings: payload.lines
          .filter((line) => line.mappingProposed && line.supplierItemKey)
          .map((line) => ({ variantId: line.variantId, supplierCode: line.supplierItemKey as string, nameAtSupplier: line.supplierItemName })),
        // Tedarikçi seçilmemiş olabilir — plansız/küçük alım meşru bir hâl ve `null` onu söylüyor.
        supplierId: values.supplierId || null,
        note: values.documentNo.trim() || null,
        // Belgenin tarihi; boşsa kapı bugüne yazar.
        date: values.date.trim() || null,
        lines: countedLines(values).map((line) => ({
          variantId: line.variantId,
          qty: line.qty ?? 0,
          expiryDate: line.expiryDate,
          lotNumber: line.lotNumber.trim() || null,
          storageAreaId: line.storageAreaId || null,
          // EURO → CENT sınırda (`IntakeLineSchema` künyesi): kapı cent istiyor. `null` = fiyatı
          // bilmiyorum ve öyle gider — sıfır yazmak bedava alınmış gibi okunurdu.
          unitCostCents: line.unitCost === null ? null : toCents(line.unitCost),
        })),
        // Faturanın toplamı girildiyse fatura kabule bağlı belge olarak doğar ve tedarikçi borcu ondan türer; boşsa kabul faturasız
        // yazılır, faturası sonra gelen kabul meşrudur.
        invoice: draft.invoice.amount === null ? null : invoiceTermsOf(draft.invoice),
        proposalId,
      });
      if (result.error) return { error: result.error };
      // Dosya belge YAZILDIKTAN sonra: anahtar belgenin kimliğinden kurulur (`uploadDocumentFile`).
      if (draft.file && result.data?.documentId) return { error: await uploadDocumentFile(result.data.documentId, draft.file) };
      return { error: null };
    },
    // Satır ızgarası altı kolon + fiyat: dar sütunda kalemler okunmuyor.
    width: 1560,
    applyLabel: 'Girişi kaydet',
    appliedNote:
      'Partiler stoğa girdi — Stok ekranında görünüyor ve satılabilir hâle geldi. Fatura girildiyse kabule bağlı belge olarak Para ekranında.',
  }),

  /**
   * Belge: mal dışı fatura ya da fiş (kira, muhasebe, sigorta, akaryakıt); form Para ekranının belge formu, kapı onun eylemidir
   * (`createDocumentAction` + `withProposal`). Dosya MCP'den geçmez: onay anında seçilir ve belge yazıldıktan sonra yüklenir.
   */
  money_document: defineBody<MoneyDocumentPayload, DocumentDraft>({
    parse: parseWith<MoneyDocumentPayload>('money_document'),
    // Tür sözlükten: dilekçenin slug'ı sözlükte ve yönüne uyuyorsa (`documentValuesFrom`).
    initial: (payload, options) => documentValuesFrom(payload, options.natures),
    render: ({ payload, subject, options, meta, draft, onDraft, disabled, readOnly }) => (
      <MoneyDocumentBody
        payload={payload}
        subject={subject}
        options={options}
        meta={meta}
        draft={draft}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    // Engel FORMUN kendi dosyasından — Para ekranının belge penceresi de aynı iki kapıyı okuyor.
    blocked: (draft) => {
      const parsed = DocumentFormSchema.safeParse(draft.values);
      if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Form eksik';
      return documentBlock(draft.values);
    },
    submit: async (_payload, draft, proposalId) => {
      const result = await createDocumentAction(documentInputOf(draft.values), proposalId);
      if (result.error || !result.data) return { error: result.error ?? 'Belge yazılamadı.' };
      if (draft.file) return { error: await uploadDocumentFile(result.data.documentId, draft.file) };
      return { error: null };
    },
    // Belge penceresi 640 px için tasarlandı; yanına dilekçe sütunu geliyor.
    width: 1180,
    applyLabel: 'Belgeyi kaydet',
    appliedNote: 'Belge kaydedildi — Para → Belgeler sekmesinde. Ödeme yapılınca "Ödemesini yaz" ile belgeye bağlanır.',
  }),

  /**
   * Tedarikçi: faturanın başlığından yeni kart; form Tedarik ekranının kartı, kapı onun eylemidir (`saveSupplierAction` +
   * `withProposal`). Yeni kayıtta vergi no, telefon ya da tam adla mükerrer yoklaması orada bir kez daha yapılır.
   */
  supplier_create: defineBody<SupplierCreatePayload, SupplierFormValues>({
    parse: parseWith<SupplierCreatePayload>('supplier_create'),
    initial: (payload) => supplierValuesFrom(payload),
    render: ({ payload, subject, meta, draft, onDraft, disabled, readOnly }) => (
      <SupplierCreateBody
        payload={payload}
        subject={subject}
        meta={meta}
        values={draft}
        onChange={onDraft}
        disabled={disabled}
        readOnly={readOnly}
      />
    ),
    blocked: (values) => {
      const parsed = SupplierFormValuesSchema.safeParse(values);
      return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Form eksik');
    },
    submit: (_payload, values, proposalId) => saveSupplierAction(values, proposalId),
    // Kart formu iki sütunlu ve kısa; yanına dilekçe sütunu geliyor.
    width: 1120,
    applyLabel: 'Tedarikçiyi kaydet',
    appliedNote:
      'Tedarikçi kaydedildi — Tedarik → Tedarikçiler sekmesinde. Faturası artık vergi numarasıyla bulunur; asistandan faturayı yeniden işlemesini isteyin.',
  }),
};

/** Bu tipin kuyruk içinde gövdesi var mı — çerçeve alt barını buna göre kurar. */
export function inlineBodyOf(kind: AssistantProposalKind): ErasedBody | null {
  return INLINE_BODIES[kind] ?? null;
}
