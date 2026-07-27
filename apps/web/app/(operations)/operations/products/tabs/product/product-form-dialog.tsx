'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ALLERGEN_LABELS, ProductAllergenEnum, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { type Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { LocaleCard } from '@/components/operation/form/locale-card';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormSegment } from '@/components/operation/form/form-segment';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { ImageCropField } from '@/components/operation/form/image-crop-field';
import { suggestTranslationAction } from '../../actions/translate';
import { createProductAction, updateProductAction, uploadProductImageAction } from './actions';
import { VariantEditor } from './variant-editor';
import { ProductFormDesktop } from './product-form.desktop';
import { ProductFormMobile } from './product-form.mobile';
import { ProductFormSchema, buildDefaults, toActionPayload, type ProductFormValues } from './product-form-schema';
import type { ProductFormFields } from './product-form-types';
import type { CategoryView, ProductView } from '../../products-types';

// Ürün oluştur/düzenle — KAP (container): RHF + zodResolver, action'lar, Dialog kabuğu ve footer burada.
// Alan ELEMANLARI bir kez kurulur (fields), sunum cihaza göre çatallanır (Sapma 3): masaüstü çok bölgeli
// (.desktop), mobil tek sütun (.mobile). Aynı alanlar, farklı düzen → tekrar yok.
//
// DİL: form geneli görünmez kip YOK (eski header sekmesi kaldırıldı) — dil, çok dilli alanların
// yanında GÖRÜNÜR. Cihaza göre çatallanır, çünkü alanların komşuluğu farklı:
//   · web   → ad + açıklama aynı sütunda yan yana ⇒ TEK dil kartı (`content`) ikisini sarar
//   · mobil → ad "Temel", açıklama "Açıklama" bölümünde (tasarımın bölüm sırası) ⇒ her alan KENDİ sekmesiyle
// Alan tanımları tek yerde (nameField/descriptionField); iki şekle de aynı tanım verilir (tekrar yok).

const FORM_ID = 'product-form';

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  product: ProductView | null;
  categories: CategoryView[];
  device: Device;
  onClose: () => void;
}

export function ProductFormDialog({ mode, product, categories, device, onClose }: ProductFormDialogProps) {
  const editing = mode === 'edit' && product !== null;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: buildDefaults(editing ? product : null),
    mode: 'onChange',
  });
  const { control, handleSubmit, formState } = form;

  // AI çeviri: TR metinden FR/DE önerir (arka uç stub — UI hazır). Dönüş eksik dilleri doldurur.
  const aiTranslate = (text: LocalizedText): Promise<LocalizedText> => suggestTranslationAction(text);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const payload = toActionPayload(values);
    const { error: actionError } = editing ? await updateProductAction(product.id, payload) : await createProductAction(payload);
    if (actionError) {
      setError(actionError);
      return;
    }
    router.refresh();
    onClose();
  });

  // Çok dilli alan tanımları TEK yerde; `lang` verilmezse alan kendi sekmesini gösterir (mobil),
  // verilirse dilini dışarıdan alır (web'de dil kartının içi).
  const nameField = (lang?: Locale) => (
    <FormLocalizedText control={control} name="name" label="Ürün adı" required placeholder="Ürün adı" lang={lang} onAiTranslate={aiTranslate} />
  );
  const descriptionField = (lang?: Locale) => (
    <FormLocalizedText control={control} name="description" label="Ürün açıklaması" multiline placeholder="Açıklama" lang={lang} onAiTranslate={aiTranslate} />
  );

  // Görsel: kaynak 3:2, odak + zoom kırpması form değeri; düzenleme ayrı diyalogda. Kayıt yoksa yükleme
  // yapılamaz (R2 anahtarı slug'a bağlı) → istem gösterilir. Alt metin AYRI alan değil: boşsa müşteri
  // yüzeyinde ürün adına düşer (kopya tutulmaz) — bu yüzden formda alt-metin alanı yok.
  const crop = { x: form.watch('imageFocalX'), y: form.watch('imageFocalY'), zoom: form.watch('imageZoom') };
  const imageField = (
    <ImageCropField
      role="product"
      src={editing ? product.imageUrl : null}
      crop={crop}
      onCropChange={(c) => {
        form.setValue('imageFocalX', c.x, { shouldDirty: true });
        form.setValue('imageFocalY', c.y, { shouldDirty: true });
        form.setValue('imageZoom', c.zoom, { shouldDirty: true });
      }}
      upload={editing ? (fd) => uploadProductImageAction(product.id, fd) : undefined}
      uploadDisabledHint="Ürünü kaydedince görsel eklenebilir — R2 anahtarı slug'a bağlı."
    />
  );

  // Alan elemanları tek kez kurulur; sunumlar yalnız YERLEŞTİRİR (web `content`, mobil `name`+`description`).
  const fields: ProductFormFields = {
    image: imageField,
    name: nameField(),
    description: descriptionField(),
    content: (
      <LocaleCard title="İçerik" completenessOf={form.watch('name')}>
        {(lang) => (
          <>
            {nameField(lang)}
            {descriptionField(lang)}
          </>
        )}
      </LocaleCard>
    ),
    category: <FormSelect control={control} name="categoryId" label="Kategori" required placeholder="Kategori seç" options={categories.map((c) => ({ value: c.id, label: resolveLocalizedText(c.name) }))} />,
    vat: <FormSegment control={control} name="vatRate" label="KDV" required options={[{ key: '5.5', label: '%5,5' }, { key: '20', label: '%20' }]} />,
    dateType: <FormSegment control={control} name="dateType" label="Son tarih tipi" required options={[{ key: 'DLC', label: 'DLC · güvenlik' }, { key: 'DDM', label: 'DDM · kalite' }]} />,
    shelfLife: <FormNumber control={control} name="shelfLifeDays" label="Toplam raf ömrü (gün)" integer placeholder="ör. 180" />,
    allergens: <FormMultiSelect control={control} name="allergens" label="Alerjenler" labelAside="AB 14 listesinden seçilir" options={ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a]) }))} addLabel="+ alerjen seç" searchPlaceholder="Alerjen ara…" />,
    variants: <VariantEditor control={control} />,
    shippable: <FormSwitch control={control} name="shippable" label="Kargo izni" />,
    autoPrice: <FormSwitch control={control} name="autoPrice" label="Otomatik fiyat" />,
    margin: <FormNumber control={control} name="targetMarginPercent" label="Hedef marj (%)" placeholder="ör. 42" />,
    priceNote: (
      <span className="font-ops-body text-[11px] leading-[1.5] text-ops-muted">
        Fiyatın kendisi kanala/müşteriye göre Fiyatlar ekranında çözülür — burada yalnız marj hedefi ve otomatik davranış tanımlanır.
      </span>
    ),
  };

  // Alt bar SOL tarafı = aksiyon bölgesi (zorunlu-alan metni değil): satışa açma kararı kaydetmenin
  // hemen yanında durur — katalog/paket dialoglarıyla aynı desen.
  const footer = (
    <DialogFooter
      formId={FORM_ID}
      onCancel={onClose}
      submitting={formState.isSubmitting}
      error={error}
      actions={<FormSwitch control={control} name="isActive" label="Satışta (aktif)" bare />}
    />
  );

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={device === 'mobile' ? 520 : 1180}
      title={editing ? 'Ürün düzenle' : 'Yeni ürün'}
      subtitle={editing ? (resolveLocalizedText(product.name) || 'Ürün') : 'Zorunlu alanları doldurun; beyanlar sonradan tamamlanabilir'}
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={onSubmit}>
        {device === 'mobile' ? <ProductFormMobile fields={fields} /> : <ProductFormDesktop fields={fields} />}
      </form>
    </Dialog>
  );
}
