'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ALLERGEN_LABELS, ProductAllergenEnum, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { type Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { LocaleTabs } from '@/components/operation/form/locale-tabs';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormSegment } from '@/components/operation/form/form-segment';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { suggestTranslationAction } from '../../actions/translate';
import { createProductAction, updateProductAction } from './actions';
import { ProductImageField } from './product-image-field';
import { VariantEditor } from './variant-editor';
import { ProductFormDesktop } from './product-form.desktop';
import { ProductFormMobile } from './product-form.mobile';
import { ProductFormSchema, buildDefaults, toActionPayload, type ProductFormValues } from './product-form-schema';
import type { ProductFormFields } from './product-form-types';
import type { CategoryView, ProductView } from '../../products-types';

// Ürün oluştur/düzenle — KAP (container): RHF + zodResolver, action'lar, Dialog kabuğu ve footer burada.
// Dil TEK bağlam: header'daki LocaleTabs form genelini yönetir (name/description sekmesiz, o dili gösterir).
// Alan ELEMANLARI bir kez kurulur (fields), sunum cihaza göre çatallanır (Sapma 3): masaüstü çok bölgeli
// (.desktop), mobil tek sütun (.mobile). Aynı alanlar, farklı düzen → tekrar yok.

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
  const [lang, setLang] = useState<Locale>('tr');

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

  // Alan elemanları tek kez — name/description form geneli dille (sekmesiz), sunumlar yalnız yerleştirir.
  const fields: ProductFormFields = {
    image: <ProductImageField product={editing ? product : null} />,
    name: <FormLocalizedText control={control} name="name" label="Ürün adı" required placeholder="Ürün adı" lang={lang} onAiTranslate={aiTranslate} />,
    category: <FormSelect control={control} name="categoryId" label="Kategori" required placeholder="Kategori seç" options={categories.map((c) => ({ value: c.id, label: resolveLocalizedText(c.name, lang) }))} />,
    vat: <FormSegment control={control} name="vatRate" label="KDV" required options={[{ key: '5.5', label: '%5,5' }, { key: '20', label: '%20' }]} />,
    dateType: <FormSegment control={control} name="dateType" label="Son tarih tipi" required options={[{ key: 'DLC', label: 'DLC · güvenlik' }, { key: 'DDM', label: 'DDM · kalite' }]} />,
    shelfLife: <FormNumber control={control} name="shelfLifeDays" label="Toplam raf ömrü (gün)" integer placeholder="ör. 180" />,
    description: <FormLocalizedText control={control} name="description" label="Ürün açıklaması" multiline placeholder="Açıklama" lang={lang} onAiTranslate={aiTranslate} />,
    allergens: <FormMultiSelect control={control} name="allergens" label="Alerjenler" labelAside="AB 14 listesinden seçilir" options={ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a], lang) }))} addLabel="+ alerjen seç" searchPlaceholder="Alerjen ara…" />,
    variants: <VariantEditor control={control} />,
    shippable: <FormSwitch control={control} name="shippable" label="Kargo izni" />,
    isActive: <FormSwitch control={control} name="isActive" label="Satışta (aktif)" />,
    autoPrice: <FormSwitch control={control} name="autoPrice" label="Otomatik fiyat" />,
    margin: <FormNumber control={control} name="targetMarginPercent" label="Hedef marj (%)" placeholder="ör. 42" />,
    priceNote: (
      <span className="font-ops-body text-[11px] leading-[1.5] text-ops-muted">
        Fiyatın kendisi kanala/müşteriye göre Fiyatlar ekranında çözülür — burada yalnız marj hedefi ve otomatik davranış tanımlanır.
      </span>
    ),
  };

  const headerAction = (
    <div className="flex items-center gap-2">
      {device !== 'mobile' ? (
        <span className="font-ops-display text-[10px] font-medium uppercase tracking-[0.08em] text-ops-muted">İçerik dili</span>
      ) : null}
      <LocaleTabs value={lang} onChange={setLang} />
    </div>
  );

  const footer = (
    <>
      <span className="mr-auto font-ops-body text-[11.5px]">
        {error ? <span className="text-ops-red">{error}</span> : <span className="text-ops-muted">Zorunlu: ad (TR), kategori, KDV, tarih tipi</span>}
      </span>
      <Button variant="secondary" onClick={onClose} disabled={formState.isSubmitting}>
        İptal
      </Button>
      <Button variant="primary" type="submit" form={FORM_ID} disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={device === 'mobile' ? 520 : 1180}
      title={editing ? 'Ürün düzenle' : 'Yeni ürün'}
      subtitle={editing ? (resolveLocalizedText(product.name) || 'Ürün') : 'Zorunlu alanları doldurun; beyanlar sonradan tamamlanabilir'}
      headerAction={headerAction}
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={onSubmit}>
        {device === 'mobile' ? <ProductFormMobile fields={fields} /> : <ProductFormDesktop fields={fields} />}
      </form>
    </Dialog>
  );
}
