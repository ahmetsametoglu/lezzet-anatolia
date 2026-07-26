'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ALLERGEN_LABELS, ProductAllergenEnum, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { FormNumber } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { FormSegment } from '@/components/operation/form/form-segment';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { createProductAction, suggestTranslationAction, updateProductAction } from '../actions/actions';
import { ImageUploadButton } from './image-upload-button';
import { VariantEditor } from './variant-editor';
import { ProductFormSchema, buildDefaults, toActionPayload, type ProductFormValues } from './product-form-schema';
import type { CategoryView, ProductView } from '../products-types';

// Ürün oluştur/düzenle formu (Envanter O9) — RHF + zodResolver, tüm alanlar paylaşılan operasyon
// Form* adaptörleriyle (customer deseninin ikizi). Çok dilli ad/açıklama FormLocalizedText (TR/FR/DE
// + AI); alerjen FormMultiSelect; varyantlar VariantEditor (field-array). Kaydetme action'a bağlı.

const SECTION = 'font-ops-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ops-muted';
const FORM_ID = 'product-form';
const ALLERGEN_OPTIONS = ProductAllergenEnum.options.map((a) => ({ value: a, label: resolveLocalizedText(ALLERGEN_LABELS[a], 'tr') }));

interface ProductFormDialogProps {
  mode: 'create' | 'edit';
  product: ProductView | null;
  categories: CategoryView[];
  onClose: () => void;
}

export function ProductFormDialog({ mode, product, categories, onClose }: ProductFormDialogProps) {
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
      title={editing ? 'Ürün düzenle' : 'Yeni ürün'}
      subtitle={editing ? (resolveLocalizedText(product.name) || 'Ürün') : 'Zorunlu alanları doldurun; beyanlar sonradan tamamlanabilir'}
      footer={footer}
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Görsel (yalnız düzenlemede) */}
        {editing ? (
          <section className="flex items-center gap-3">
            <Thumbnail src={product.imageUrl} alt={resolveLocalizedText(product.name)} size={64} iconSize={24} />
            <div className="flex flex-col items-start gap-1">
              <ImageUploadButton
                productId={product.id}
                className="cursor-pointer rounded-ops-btn border border-ops-line-strong px-3 py-2 font-ops-display text-[12px] font-semibold text-ops-strong hover:border-ops-olive disabled:opacity-60"
              >
                {product.imageUrl ? 'Görsel değiştir' : 'Görsel yükle'}
              </ImageUploadButton>
              <span className="font-ops-body text-[10.5px] text-ops-faint">JPG/PNG · R2&apos;ye yüklenir</span>
            </div>
          </section>
        ) : null}

        {/* Temel */}
        <section className="flex flex-col gap-[11px]">
          <span className={SECTION}>Temel</span>
          <FormLocalizedText control={control} name="name" label="Ürün adı" required placeholder="Ürün adı" onAiTranslate={aiTranslate} />
          <div className="grid grid-cols-2 gap-2.5">
            <FormSelect control={control} name="categoryId" label="Kategori" required placeholder="Kategori seç" options={categories.map((c) => ({ value: c.id, label: resolveLocalizedText(c.name) }))} />
            <FormSegment control={control} name="vatRate" label="KDV" required options={[{ key: '5.5', label: '%5,5' }, { key: '20', label: '%20' }]} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <FormSegment control={control} name="dateType" label="Son tarih tipi" required options={[{ key: 'DLC', label: 'DLC · güvenlik' }, { key: 'DDM', label: 'DDM · kalite' }]} />
            <FormNumber control={control} name="shelfLifeDays" label="Toplam raf ömrü (gün)" integer placeholder="ör. 180" />
          </div>
          <div className="flex gap-2.5">
            <FormSwitch control={control} name="shippable" label="Kargo izni" />
            <FormSwitch control={control} name="isActive" label="Satışta (aktif)" />
          </div>
        </section>

        {/* İçerik */}
        <section className="flex flex-col gap-[11px]">
          <span className={SECTION}>Açıklama</span>
          <FormLocalizedText control={control} name="description" label="Ürün açıklaması" multiline placeholder="Açıklama" onAiTranslate={aiTranslate} />
        </section>

        {/* Yasal beyan */}
        <section className="flex flex-col gap-[11px]">
          <span className={SECTION}>Yasal beyan</span>
          <FormMultiSelect
            control={control}
            name="allergens"
            label="Alerjenler"
            labelAside="AB 14 listesinden seçilir"
            options={ALLERGEN_OPTIONS}
            addLabel="+ alerjen seç"
            searchPlaceholder="Alerjen ara…"
          />
        </section>

        <VariantEditor control={control} />

        {/* Fiyatlandırma tanımı */}
        <section className="flex flex-col gap-2.5">
          <span className={SECTION}>Fiyatlandırma tanımı</span>
          <div className="flex items-end gap-2.5">
            <FormNumber control={control} name="targetMarginPercent" label="Hedef marj (%)" placeholder="ör. 42" fieldClassName="flex-1" />
            <FormSwitch control={control} name="autoPrice" label="Otomatik fiyat" />
          </div>
          <span className="font-ops-body text-[11px] text-ops-muted">
            Fiyatın kendisi kanala/müşteriye göre Fiyatlar ekranında çözülür — burada yalnız marj hedefi ve otomatik davranış tanımlanır.
          </span>
        </section>
      </form>
    </Dialog>
  );
}
