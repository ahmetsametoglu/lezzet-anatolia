'use client';

import type { ReactNode } from 'react';
import {
  PROPOSAL_PAYLOAD_SCHEMAS,
  type AssistantProposalKind,
  type BatchOfferPayload,
  type BundleDraftPayload,
  type DiscountDraftPayload,
  type FeaturedFlagPayload,
  type MoneyMovementPayload,
  type ProductCreatePayload,
  type ProductDraftPayload,
  type PurchaseOrderPayload,
  type RecipeDraftPayload,
  type StockIntakePayload,
  type ZoneExtendPayload,
} from '@lezzet/types';
import { toCents } from '@lezzet/helper';
import { recordManualMovementAction, recordTransferAction } from '@/lib/finance/actions';
import { ManualMovementSchema, movementBlock, type ManualMovementForm } from '@/components/operation/form/movement-form/schema';
import { TransferFormSchema, transferBlock, type TransferForm } from '@/components/operation/form/transfer-form/schema';
import { receiveIntakeFromProposalAction } from '@/lib/warehouse/intake-actions';
import { countedLines, intakeBlock, type IntakeFormValues } from '@/components/operation/form/intake-form/schema';
import { createDraftFromProposalAction } from '@/lib/stock/purchase-order-actions';
import { purchaseOrderBlock, type PurchaseOrderFormValues } from '@/components/operation/form/purchase-order-form/schema';
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
import { TransferBody, transferValuesFrom } from './bodies/transfer-body';
import { StockIntakeBody, intakeValuesFrom } from './bodies/stock-intake-body';
import { PurchaseOrderBody, purchaseOrderValuesFrom } from './bodies/purchase-order-body';
import { FeaturedFlagBody, featuredValuesFrom } from './bodies/featured-flag-body';
import { ZoneExtendBody, zoneValuesFrom } from './bodies/zone-extend-body';
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

/**
 * Para önerisinin taslağı — tek tip, İKİ HÂL (22.22).
 *
 * `money_movement` hem elle girişi hem transferi taşıyor ve ikisinin alanları hiç örtüşmüyor. Düz
 * bir nesnede birleştirilseydi her hâl ötekinin boş alanlarını da taşırdı; ayrımcı birleşim
 * hangisinin gerçek olduğunu tipin kendisine söyletiyor.
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
    // Paket formu iki sütun + kalem editörü taşıyor; yanına dilekçe sütunu gelince ürün formuyla
    // aynı sıkışma doğuyordu. Kalem satırı (ad · adet · birim fiyat · pay · marj) dar alanda
    // okunmuyor — 1560 ölçüldü ve kalem satırı hâlâ kırılıyordu.
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
   * PARA — `handoff`tan geldi (22.11) ve İKİ HÂLİ var: elle giriş (gider · sermaye ·
   * sınıflandırılmadı) ve transfer.
   *
   * ── ÇATAL BURADA, GÖVDEDE DEĞİL (22.22) ───────────────────────────────────
   * Transfer bir tur "kuyruktan geçmez" sayılıyordu: gövde formu açmıyor, boş bir taban veriliyor
   * ve `blocked` kaydetmeyi kapatıyordu. Niyet doğruydu (uydurma değerlerle açılan form yanlış bir
   * defter satırı demektir) ama ekranda olan başkaydı — tutarı boş, türü "Sınıflandırılmadı"
   * gösteren, künyesinde 500,00 € → 0,00 € yazan bir form (kullanıcı tespiti 12.08). Yarım bir
   * devir devir değildir: iki hâlin ikisi de artık kendi formuyla açılıyor, taslak da ayrımcı bir
   * birleşimle taşınıyor.
   *
   * İki hâl tek `defineBody`de kalıyor çünkü tek bir öneri TİPİ; ayrı bir kind açmak şemayı ve
   * asistanın araç kataloğunu ikiye bölerdi.
   */
  // Para taslağı AYRIMCI BİRLEŞİM: iki hâlin alanları hiç örtüşmüyor (elle giriş tek hesap + yön,
  // transfer iki hesap) ve tek bir düz nesnede birleştirilseydi her iki hâl de ötekinin boş
  // alanlarını taşırdı — hangisinin gerçek olduğu ancak `type` okunarak anlaşılırdı.
  money_movement: defineBody<MoneyMovementPayload, MoneyDraft>({
    parse: parseWith<MoneyMovementPayload>('money_movement'),
    initial: (payload) => {
      const manual = movementValuesFrom(payload);
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
            category: draft.values.category,
            campaign: draft.values.campaign,
            valueDate: draft.values.valueDate,
            description: draft.values.description,
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

  /**
   * VİTRİN İŞARETİ — gövdesizdi, ızgaranın tamamı düzenlenemiyordu (22.35).
   *
   * Karar iki uçluydu (onayla/reddet) ama vitrin bir SEÇKİ ve kontenjanı var: dolu bir ızgaraya
   * ekleme yapmak sıradaki birini ana sayfadan düşürür. Önizleme bunu söylüyordu ama kimin
   * düşeceğine karar vermenin yolu yoktu. Form ORTAK (`featured-form/`) ve kararın tamamı diyaloğun
   * içinde veriliyor — kullanıcı kararı 15.08: *"biz yönlendirme yapmıyoruz."*
   *
   * `initial` SEÇENEKLERİ de okuyor: açılış değeri ızgaranın bugünkü hâli + dilekçenin istediği
   * değişiklik. Dilekçe tek bayrak taşıyor, ızgara ise kayıtta duruyor.
   */
  /**
   * BÖLGE GENİŞLETME — son gövdesiz tip, artık haritayla kuyruğun içinde (22.36).
   *
   * `handoff`tan `inline`a geçti: rota ekranını ön doldurup oraya yollamak yerine haritayı buraya
   * getirdik. Karar zaten burada veriliyordu; eksik olan kararın DAYANAĞIYDI.
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
        // Hedef TASLAKTAN: operatör dilekçenin önerdiği rotayı değiştirmiş olabilir
        // (kullanıcı tespiti 15.08). `payload.zoneId` yazsaydık seçici çizilir ama seçim
        // hiçbir yere gitmezdi — ekranın söylediği ile sistemin yaptığı ayrışırdı.
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
     * Harita + kanıt listesi + künye rayı yan yana duruyor (kullanıcı isteği 15.08: *"diyaloğun
     * büyüklüğünü ona göre ayarlayabilirsin"*).
     *
     * 1320'de sol sütuna ~800 piksel düşüyordu ve harita ile kod listesi aynı dar kolonu
     * paylaşıyordu. 1600'de harita nefes alıyor; en geniş iki gövdenin (1720) altında kalması da
     * bilinçli — buradaki karar üç kodluk bir seçim, bir sipariş tablosu değil.
     */
    width: 1600,
    applyLabel: 'Bölgeye ekle',
    appliedNote:
      'Kodlar bölgeye eklendi. Haber bekleyen müşterilere "bölgeniz açıldı" bildirimi uzlaştırma işiyle gidiyor (saatte bir) — geri alınamaz.',
  }),

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
   * TEDARİK SİPARİŞİ — gövdesizdi, kalemleri düzenlenemiyordu (22.33).
   *
   * Onay `applyPurchaseOrder`'a gidiyor ve dilekçede ne yazıyorsa o taslağa dönüşüyordu. Adetleri
   * MOTOR hesapladı (`ReorderService`) ve motor eşiği bilir, kasayı bilmez — "bu hafta bu kadarını
   * alalım" kararı patronundur. Form ORTAK (`purchase-order-form/`): tedarik ekranının elle sipariş
   * penceresiyle aynı gövde, ikinci bir satır editörü yazılmadı (`CLAUDE §1`).
   *
   * Kaydeden kapı kuyruğun kendi eylemi (`createDraftFromProposalAction`): kalemler FORMDAN gider,
   * dilekçeden değil — düzeltilen değeri yok sayıp dilekçedekini yazmak, ekranda görünen ile deftere
   * geçen arasında sessiz bir ayrışma bırakırdı (`receiveIntakeFromProposalAction` künyesi).
   */
  purchase_order: defineBody<PurchaseOrderPayload, PurchaseOrderFormValues>({
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
    blocked: (values) => purchaseOrderBlock(values),
    submit: (_payload, values, proposalId) =>
      createDraftFromProposalAction({
        supplierId: values.supplierId,
        // Boş bırakmak GEÇERLİ ve `null` onu söylüyor — hedefi bilinmeyen sipariş hiçbir deponun
        // eksiğini kapatmış sayılmaz (şema künyesi).
        targetWarehouseId: values.targetWarehouseId || null,
        note: values.note.trim() || null,
        lines: values.lines.map((line) => ({ variantId: line.variantId, qty: line.qty })),
        proposalId,
      }),
    // Satır ızgarası dört kolon; dar sütunda ürün adı ile adet birbirine giriyor.
    width: 1180,
    applyLabel: 'Taslağı oluştur',
    // Taslak GÖNDERİLMEZ ve bu ayrım kayıtta duruyor (`applyPurchaseOrder` künyesi): onay "bu
    // siparişi hazırla" demektir, "tedarikçiye yolla" değil. Gönderme ayrı ve insanlı bir adım.
    appliedNote: 'Sipariş TASLAK olarak açıldı — Tedarik ekranından gözden geçirip gönderin.',
  }),

  /**
   * MAL KABUL — `handoff`tan geldi (22.23). Devrin gerekçesi *"geri alınamaz: giren parti satılabilir
   * olur ve SKT o an sabitlenir; faturadan okunan miktar gözle doğrulanmadan yazılmamalı"*tı ve o
   * şart AYNEN duruyor — doğrulama hâlâ karardan önce, değişen tek şey formun nerede DURDUĞU.
   *
   * Kaydeden kapı kuyruğun kendi eylemi (`receiveIntakeFromProposalAction`): fiyat FORMDAN gider,
   * dilekçeden değil — patron faturayı yanlış okunmuş görürse maliyeti onaydan önce düzeltebilmeli.
   */
  stock_intake: defineBody<StockIntakePayload, IntakeFormValues>({
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
    blocked: (values) => intakeBlock(values),
    submit: (_payload, values, proposalId) =>
      receiveIntakeFromProposalAction({
        warehouseId: values.warehouseId,
        // Tedarikçi seçilmemiş olabilir — plansız/küçük alım meşru bir hâl ve `null` onu söylüyor.
        supplierId: values.supplierId || null,
        note: values.documentNo.trim() || null,
        // Belgenin tarihi — boşsa kapı bugüne yazar. Alan dilekçede vardı ama HİÇBİR yola bağlı
        // değildi (ölçüldü 13.08): fatura tarihi kayda geçmiyor, kabul her hâlde bugüne yazılıyordu.
        date: values.date.trim() || null,
        lines: countedLines(values).map((line) => ({
          variantId: line.variantId,
          qty: line.qty ?? 0,
          expiryDate: line.expiryDate,
          lotNumber: line.lotNumber.trim() || null,
          location: line.location.trim() || null,
          // EURO → CENT sınırda (`IntakeLineSchema` künyesi): kapı cent istiyor. `null` = fiyatı
          // bilmiyorum ve öyle gider — sıfır yazmak bedava alınmış gibi okunurdu.
          unitCostCents: line.unitCost === null ? null : toCents(line.unitCost),
        })),
        proposalId,
      }),
    // Satır ızgarası altı kolon + fiyat: dar sütunda kalemler okunmuyor.
    width: 1560,
    applyLabel: 'Girişi kaydet',
    appliedNote: 'Partiler stoğa girdi — Stok ekranında görünüyor ve satılabilir hâle geldi.',
  }),
};

/** Bu tipin kuyruk içinde gövdesi var mı — çerçeve alt barını buna göre kurar. */
export function inlineBodyOf(kind: AssistantProposalKind): ErasedBody | null {
  return INLINE_BODIES[kind] ?? null;
}
