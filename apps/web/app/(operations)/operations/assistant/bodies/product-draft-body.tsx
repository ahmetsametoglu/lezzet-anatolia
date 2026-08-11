'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LocalizedText, ProductDraftPayload } from '@lezzet/types';
import {
  ProductFormPanels,
  ProductFormTabs,
  useProductFormFields,
} from '@/components/operation/form/product-form';
import {
  ProductFormSchema,
  buildDefaults,
  type ProductFormSource,
  type ProductFormValues,
} from '@/components/operation/form/product-form/schema';
import type { ProductFormTab } from '@/components/operation/form/product-form/types';
import { suggestTranslationAction, type TranslateField } from '@/lib/ai/translate';
import { ProposalAside } from '@/components/operation/ui/proposal-aside';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';
import { DECLARATION_FIELD_LABEL } from '../assistant-labels';

/**
 * ÜRÜN TASLAĞI — kuyruğun içinde, ÜRÜN EKRANININ KENDİ FORMUYLA (22.14).
 *
 * ── BİR TUR AYRI FORM YAZILDI, GERİ ALINDI ──────────────────────────────────
 * İlk denemede buraya alan alan seçim yapan yepyeni bir form yazılmıştı. Kullanıcının tespiti
 * kısaydı — *"bizim ürün formumuz bu değil ki."* Doğruydu: aynı ürün iki ekranda iki farklı formla
 * düzenlenirse bir gün biri KDV seçeneğini, öteki alerjen vurgusunu ya da varyant etiketinin
 * zorunluluğunu kaybeder (`CLAUDE §1`). Form ortak komponente taşındı; burası onu KULLANIYOR.
 *
 * ── FORM ÜRÜNÜN BUGÜNKÜ HÂLİYLE AÇILIR ──────────────────────────────────────
 * Taban `buildDefaults(product)` — kategori, KDV, varyantlar, kargo izni hepsi kayıttan. Asistanın
 * önerdiği alanlar bunun ÜZERİNE yazılır. Tersi (boş formu dilekçeyle doldurmak) kaydetmede
 * asistanın hiç dokunmadığı alanları sıfırlardı: bir onay, ürünün varyantlarını silerdi.
 *
 * ── ASİSTANIN DOKUNDUĞU KUTU İŞARETLİ ───────────────────────────────────────
 * `filled` kümesi kutunun başlığına "asistan" rozetini koyuyor. İşaret olmasa operatör hangi
 * kutunun kendi kaydı, hangisinin öneri olduğunu ayıramazdı — formun tamamı "zaten böyleydi" gibi
 * okunurdu. Eski değer de görünür kalıyor: rozetin ipucunda değil, `ProposalAside`ın künyesinde.
 */

/** Dilekçenin dokunabildiği alanlar — `filled` işareti ve künye bu sırayla okunur. */
const DRAFT_FIELDS = ['name', 'description', 'ingredients', 'storageInstructions', 'allergens', 'traces', 'nutrition'] as const;
type DraftField = (typeof DRAFT_FIELDS)[number];

/**
 * Formun açılış değeri: ürünün bugünkü hâli + asistanın önerisi.
 *
 * Ürün kaydı OKUNAMADIYSA (silinmiş, ya da havuza girmemiş) boş şablona düşülür ve gövde bunu
 * ekranda söyler — sessizce boş bir formla kaydetmek, dokunulmamış alanları sıfırlamak olurdu.
 */
export function productDraftValuesFrom(payload: ProductDraftPayload, product: ProductFormSource | null): ProductFormValues {
  const base = buildDefaults(product);
  const written = payload.fields as Partial<Record<DraftField, unknown>>;
  const patch: Record<string, unknown> = {};
  for (const key of DRAFT_FIELDS) {
    if (written[key] !== undefined) patch[key] = written[key];
  }
  return { ...base, ...patch } as ProductFormValues;
}

/** Asistanın DOKUNDUĞU alanlar — kutu başlıklarındaki rozet bundan çıkar. */
function productDraftFilled(payload: ProductDraftPayload): ReadonlySet<keyof ProductFormValues> {
  const written = payload.fields as Partial<Record<DraftField, unknown>>;
  return new Set(DRAFT_FIELDS.filter((key) => written[key] !== undefined) as Array<keyof ProductFormValues>);
}

interface ProductDraftBodyProps {
  payload: ProductDraftPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  values: ProductFormValues;
  onChange: (next: ProductFormValues) => void;
  disabled: boolean;
  /** Karar VERİLMİŞ öneri — aynı form, düzenlenmeyen hâliyle. */
  readOnly: boolean;
}

export function ProductDraftBody({ payload, subject, options, values, onChange, disabled, readOnly }: ProductDraftBodyProps) {
  const product = options.products[payload.productId] ?? null;
  const filled = useMemo(() => productDraftFilled(payload), [payload]);
  // Sekme YEREL: form içi bir görünüm tercihi, kararın parçası değil — çerçevenin taslağına girmez.
  const [tab, setTab] = useState<ProductFormTab>('product');

  /**
   * RHF örneği GÖVDEDE, ama gerçeğin sahibi ÇERÇEVE.
   *
   * Çerçeve taslağı (`draft`) tutuyor ve kaydeden kapıya onu veriyor; form ise RHF ister. `values`
   * ile dış durum forma yansıtılıyor, her değişiklik `onChange` ile geri gidiyor. İki yönlü bağ
   * kurulmasaydı ya alt bardaki "uygula" bayat değerle koşardı ya da form her tazelemede sıfırlanırdı.
   */
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: values,
    values,
    mode: 'onChange',
  });

  const aiTranslate = (field: TranslateField) => (text: LocalizedText) => suggestTranslationAction(text, field);

  const fields = useProductFormFields({
    control: form.control,
    watch: form.watch,
    categories: options.categories,
    onAiTranslate: aiTranslate,
    // Galeri YOK: canlı yazan bir blok, kuyruğun içinde olmamalı (ortak komponentin künyesi).
    photosSlot: null,
    filled: readOnly ? undefined : filled,
  });

  /**
   * Her değişiklikte çerçeveye haber — RHF'nin kendi durumu tek başına kaydedilmez.
   *
   * Geri çağrı REF'te tutuluyor: `onChange` her render'da yeniden kurulan bir kapanış ve doğrudan
   * bağımlılığa yazılsaydı abonelik her render'da sökülüp kurulurdu (tuş başına iki iş). Abone bir
   * kez kurulur, her zaman en güncel çağrıyı okur.
   */
  const notify = useRef(onChange);
  notify.current = onChange;
  useEffect(() => {
    const sub = form.watch((next) => notify.current(next as ProductFormValues));
    return () => sub.unsubscribe();
  }, [form]);

  return (
    <div className="overflow-hidden rounded-ops-card border border-ops-line bg-ops-white p-3.5">
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-[38rem] flex-[3] basis-0 flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Ürün formu</span>
            <ProductFormTabs value={tab} onChange={setTab} />
          </div>

          {product === null ? (
            // Kayıt okunamadıysa FORM AÇILMAZ: boş bir formla kaydetmek, dokunulmamış alanları
            // sıfırlamak olurdu (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
            <span className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5 font-ops-body text-ops-base text-ops-amber-dark">
              Ürünün bugünkü kaydı okunamadı — silinmiş olabilir. Bu öneri uygulanamaz; ürün ekranından
              doğrulayın.
            </span>
          ) : (
            // Kilit TEK yerden: `fieldset` bütün girdileri HTML'in kendi mekanizmasıyla kapatır.
            // Alan alan `disabled` geçmek, bir gün birinde unutulacak bir tekrar olurdu.
            <fieldset disabled={disabled || readOnly} className="min-w-0 border-0 p-0">
              <ProductFormPanels fields={fields} tab={tab} />
            </fieldset>
          )}
        </div>

        <ProposalAside
          subject={subject}
          fallbackTitle={payload.productName}
          facts={[
            {
              label: 'Asistanın yazdığı',
              value: filled.size > 0 ? [...filled].map((k) => DECLARATION_FIELD_LABEL[k as string] ?? k).join(' · ') : 'yok',
            },
            {
              label: 'Üzerine yazılan',
              value: overwriteText(payload),
            },
            {
              label: 'Net okunmayan',
              value: payload.uncertainFields.length > 0 ? payload.uncertainFields.map((k) => DECLARATION_FIELD_LABEL[k] ?? k).join(' · ') : 'yok',
            },
            {
              label: 'Onay sonrası eksik',
              value: payload.remainingGaps.length > 0 ? `${payload.remainingGaps.length} beyan` : 'kayıt tam olur',
            },
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Kaç DOLU alanın üzerine yazılıyor — ve eski hâl hiç okunamadıysa bunu söyler.
 *
 * Sayı değil ADLAR gerekiyordu ama künye satırı dar; adlar sığmadığında sayıya düşülüyor. Eski hâl
 * BİLİNMİYORSA üzerine yazma İDDİA EDİLMEZ: `currentFields`in hiç gelmemesi "boştu" demek değil,
 * "okunamadı" demektir ve ikisi ayrı şeydir (`ProductDraftPayloadSchema` künyesi).
 */
function overwriteText(payload: ProductDraftPayload): string {
  if (payload.currentFields === undefined) return 'eski hâl okunamadı';
  const current = payload.currentFields as Record<string, unknown>;
  const written = payload.fields as Record<string, unknown>;
  const names = DRAFT_FIELDS.filter((key) => written[key] !== undefined && hasValue(current[key])).map(
    (key) => DECLARATION_FIELD_LABEL[key] ?? key,
  );
  if (names.length === 0) return 'yok — hepsi boş alana';
  return names.length <= 2 ? names.join(' · ') : `${names.length} dolu alan`;
}

/** Alan BUGÜN dolu mu — boş dizi ve boş metin dolu sayılmaz. */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some((v) => (typeof v === 'string' ? v.trim() : v !== null));
  return true;
}
