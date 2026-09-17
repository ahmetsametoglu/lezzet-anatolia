'use client';

import type { ReactNode } from 'react';
import type { Control, UseFormWatch } from 'react-hook-form';
import { ALLERGEN_LABELS, ProductAllergenEnum, resolveLocalizedText } from '@lezzet/types';
import { type Locale } from '@lezzet/i18n';
import { UnderlineTabs } from '@/components/operation/ui/underline-tabs';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormMultiToggle } from '@/components/operation/form/form-multi-toggle';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormNutrition } from '@/components/operation/form/form-nutrition';
import { AllergenField } from './allergen-field';
import { VariantEditor } from './variant-editor';
import { ProductFormDeclaration } from './declaration';
import { ProductFormDesktop } from './layout.desktop';
import type { ProductFormValues } from './schema';
import type { ProductFormFields, ProductFormTab } from './types';

/**
 * Ürün formunun gövdesi — ürün ekranı ile asistan kuyruğunun ortak komponenti; aynı ürün iki ekranda iki formla düzenlenseydi biri bir gün bir kuralı kaybederdi.
 * Yalnız alanları kurar; RHF örneği, kaydeden eylem ve kabuk kabın işi, canlı yazan galeri de alan değil slot olarak gelir.
 */

interface ProductFormFieldsOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<ProductFormValues, any, any>;
  watch: UseFormWatch<ProductFormValues>;
  /** Kategori seçenekleri — adı ÇÖZÜLMÜŞ gelir; hangi dilde okunacağı kabın kararı. */
  categories: Array<{ id: string; name: string }>;
  /** Kapak + galeri bloğu — canlı yazdığı için slot. */
  photosSlot?: ReactNode;
  /**
   * Asistanın dokunduğu alanlar — kutunun başlığında işaretlenir.
   * Kuyrukta form ürünün bugünkü hâline öneri yazılmış olarak açılır; işaret olmasa operatör öneriyi kendi kaydından ayıramazdı.
   */
  filled?: ReadonlySet<keyof ProductFormValues>;
}

/**
 * Formun alanlarını kurar, çizmez ve yerleştirmez: dönen şey bir sözlüktür (`ProductFormFields`), yerleşimi kabın seçtiği düzen yapar.
 * Sekme durumu da kapta tutulur, çünkü barın yerine kap karar verir.
 */
export function useProductFormFields({
  control,
  watch,
  categories,
  photosSlot,
  filled,
}: ProductFormFieldsOptions): ProductFormFields {
  // Alerjen listesi İKİ alanda birden kullanılır (içerdikleri + çapraz bulaşma) → tek yerde kurulur.
  const allergenOptions = ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a]) }));

  /** Asistanın yazdığı alanın başlığına düşen işaret — yoksa `undefined` (etiket sade kalır). */
  const mark = (key: keyof ProductFormValues): ReactNode =>
    filled?.has(key) ? (
      <span
        title="Bu kutuyu asistan doldurdu"
        className="rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-1.5 py-[1px] font-ops-body text-ops-micro font-medium text-ops-violet"
      >
        asistan
      </span>
    ) : undefined;

  // Çok dilli alan tanımları TEK yerde; dilini dışarıdan alır (dil kartının içi).
  const nameField = (lang?: Locale) => (
    <FormLocalizedText
      control={control}
      name="name"
      label="Ürün adı"
      labelAside={mark('name')}
      required
      placeholder="Ürün adı"
      lang={lang}
      field="ad"
    />
  );
  const descriptionField = (lang?: Locale) => (
    <FormLocalizedText
      control={control}
      name="description"
      label="Ürün açıklaması"
      labelAside={mark('description')}
      multiline
      placeholder="Açıklama"
      lang={lang}
    />
  );

  // Alan elemanları tek kez kurulur; sunum yalnız YERLEŞTİRİR (ad + açıklama `content` kartında).
  return {
    image: photosSlot ?? null,
    content: (
      <LocaleCard title="İçerik" completenessOf={watch('name')}>
        {(lang) => (
          <>
            {nameField(lang)}
            {descriptionField(lang)}
          </>
        )}
      </LocaleCard>
    ),
    category: (
      <FormSelect
        control={control}
        name="categoryId"
        label="Kategori"
        required
        placeholder="Kategori seç"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
      />
    ),
    vat: (
      <FormMultiToggle
        control={control}
        name="vatRate"
        label="KDV"
        required
        options={[
          { key: '5.5', label: '%5,5' },
          { key: '20', label: '%20' },
        ]}
      />
    ),
    dateType: (
      <FormMultiToggle
        control={control}
        name="dateType"
        label="Son tarih tipi"
        required
        options={[
          { key: 'DLC', label: 'DLC · güvenlik' },
          { key: 'DDM', label: 'DDM · kalite' },
        ]}
      />
    ),
    shelfLife: <FormNumber control={control} name="shelfLifeDays" label="Toplam raf ömrü (gün)" integer placeholder="ör. 180" />,
    allergens: <AllergenField control={control} options={allergenOptions} labelAside={mark('allergens') ?? 'ürünün İÇERDİKLERİ'} />,
    traces: (
      <FormMultiSelect
        control={control}
        name="traces"
        label="Çapraz bulaşma"
        labelAside={mark('traces') ?? 'aynı tesiste işlenenler'}
        options={allergenOptions}
        addLabel="+ alerjen seç"
        searchPlaceholder="Alerjen ara…"
      />
    ),
    nutrition: <FormNutrition control={control} name="nutrition" />,
    // İçindekiler + saklama TEK dil kartında (ad/açıklama ile aynı desen): ikisi de çok dilli, dil bir
    // kez seçilir. Ayrı ayrı sekme taşımaları hem üç sekme barı hem iki AI düğmesi doğuruyordu.
    declarationTexts: (
      <LocaleCard title="Beyan metinleri" completenessOf={watch('ingredients') ?? undefined}>
        {(lang) => (
          <>
            <FormLocalizedText
              control={control}
              name="ingredients"
              label="İçindekiler"
              labelAside={mark('ingredients')}
              multiline
              rows={5}
              emphasis
              emphasisHint="Alerjeni listede yazdığı hâliyle vurgula"
              placeholder="Un, su, tuz…"
              lang={lang}
              field="icindekiler"
            />
            <FormLocalizedText
              control={control}
              name="storageInstructions"
              label="Saklama ve hazırlama"
              labelAside={mark('storageInstructions')}
              multiline
              rows={4}
              emphasis
              emphasisHint="Önemli uyarıyı vurgula"
              placeholder="Saklama ve hazırlama"
              lang={lang}
              field="saklama"
            />
          </>
        )}
      </LocaleCard>
    ),
    // Varyant adı bir ÜRÜN ADIDIR ("1 kg kutu"), açıklama değil.
    variants: <VariantEditor control={control} />,
    // Durum seçici bu sözlükte yok: kuyruk ürünün içeriğini yazar, satış eksenine dokunmaz; seçici ürün ekranının alt barında.
    shippable: <FormSwitch control={control} name="shippable" label="Kargo izni" />,
    /**
     * Saklama rejimi — soğuk zincirin kendisi; vitrinin soğuk zincir işaretini ve iade sonrası akıbeti belirler, kargo izninden ayrıdır.
     * Yan yana duruyorlar ki operatör ikisine birlikte karar versin.
     */
    storage: (
      <FormSelect
        control={control}
        name="storageType"
        label="Saklama"
        required
        options={[
          { value: 'ambient', label: 'Oda sıcaklığı' },
          { value: 'chilled', label: 'Soğutulmuş (0–4 °C)' },
          { value: 'frozen', label: 'Donuk (−18 °C)' },
        ]}
      />
    ),
    autoPrice: <FormSwitch control={control} name="autoPrice" label="Otomatik fiyat" />,
    margin: <FormNumber control={control} name="targetMarginPercent" label="Hedef marj (%)" placeholder="ör. 42" />,
  };
}

/** Sekme barı — ayrı dışa verilir, çünkü ürün diyaloğunda başlığa, kuyrukta panelin kendi satırına girer. */
export function ProductFormTabs({ value, onChange }: { value: ProductFormTab; onChange: (tab: ProductFormTab) => void }) {
  return (
    <UnderlineTabs
      value={value}
      onChange={onChange}
      className="flex-none self-end"
      items={[
        { key: 'product', label: 'Ürün' },
        { key: 'declaration', label: 'Beyan', title: 'Yasal beyan — içindekiler, besin değerleri, alerjenler' },
      ]}
    />
  );
}

/**
 * İki sekmenin gövdesi aynı ızgara hücresinde üst üste: kap uzun olana göre sabitlenir, sekme değişince ekran zıplamaz.
 * Pasif sekme `invisible` kalır; sökülse RHF kayıtları düşer ve yazılan metin kaybolurdu.
 */
export function ProductFormPanels({ fields, tab }: { fields: ProductFormFields; tab: ProductFormTab }) {
  return (
    <div className="grid">
      <div className="col-start-1 row-start-1" aria-hidden={tab !== 'product'} inert={tab !== 'product'}>
        <div className={tab === 'product' ? '' : 'invisible'}>
          <ProductFormDesktop fields={fields} />
        </div>
      </div>
      <div className="col-start-1 row-start-1" aria-hidden={tab !== 'declaration'} inert={tab !== 'declaration'}>
        <div className={tab === 'declaration' ? '' : 'invisible'}>
          <ProductFormDeclaration fields={fields} />
        </div>
      </div>
    </div>
  );
}
