'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LocalizedTextSchema, resolveLocalizedText, type LocalizedText } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormMultiSelect } from '@/components/operation/form/form-multi-select';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { suggestTranslationAction } from '../../actions/translate';
import { createCatalogAction, updateCatalogAction } from './actions';
import type { CatalogKind, ProductView } from '../../products-types';

// Kategori/Koleksiyon oluşturma + düzenleme — tek dialog, `kind` ile çatallanır (no-duplication).
// `edit` verilirse düzenleme (yoksa oluşturma). Çok dilli ad FormLocalizedText'le; tek-kısa-alan
// olduğundan `layout="stacked"` (TR/FR/DE aynı anda ayrı input, hepsi görünür — tab değil). TR zorunlu;
// düzenlemede ayrıca aktif/pasif. slug oluşturmada servisçe addan türer, düzenlemede SABİT kalır (URL korunur).
// KOLEKSİYON düzenlemede ek olarak ÜYELİK: koleksiyon = adı olan ürün listesi (DOMAIN §13) → ürün
// ekleme/çıkarma burada (tasarım §2/§3). Kategoride yok — ürünün kategorisi ürün formunda seçilir.

interface CatalogEditTarget {
  id: string;
  name: LocalizedText;
  isActive: boolean;
  /** Yalnız koleksiyon: mevcut üyelik (çoklu seçim bununla ön-dolar). */
  productIds?: string[];
}

const FormSchema = z.object({ name: LocalizedTextSchema, isActive: z.boolean(), productIds: z.array(z.string()) });
type FormValues = z.infer<typeof FormSchema>;

// Yalnız metin farkı; eylemler `kind` ile tek action setine gider.
const COPY: Record<CatalogKind, { createTitle: string; editTitle: string; sub: string }> = {
  category: {
    createTitle: 'Yeni kategori',
    editTitle: 'Kategoriyi düzenle',
    sub: 'Ürünün yapısal grubu (düz, tek seviye)',
  },
  collection: {
    createTitle: 'Yeni koleksiyon',
    editTitle: 'Koleksiyonu düzenle',
    sub: 'Esnek pazarlama grubu (bir ürün birçok koleksiyonda)',
  },
};

const FORM_ID = 'catalog-form';

interface CatalogFormDialogProps {
  kind: CatalogKind;
  edit?: CatalogEditTarget;
  /** Üyelik seçimi için ürün havuzu — yalnız koleksiyon düzenlemede kullanılır. */
  products?: ProductView[];
  onClose: () => void;
}

export function CatalogFormDialog({ kind, edit, products, onClose }: CatalogFormDialogProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const isEdit = edit !== undefined;
  // Üyelik yalnız koleksiyon DÜZENLEMEDE: yeni koleksiyonun henüz id'si yok, ürünler kaydettikten
  // sonra eklenir (oluşturma sade kalır).
  const showMembers = kind === 'collection' && isEdit && products !== undefined;
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: edit?.name ?? {}, isActive: edit?.isActive ?? true, productIds: edit?.productIds ?? [] },
    mode: 'onChange',
  });

  const onSubmit = form.handleSubmit(async ({ name, isActive, productIds }) => {
    setError(null);
    const { error: actionError } = isEdit
      ? await updateCatalogAction(kind, edit.id, { name, isActive, ...(showMembers ? { productIds } : {}) })
      : await createCatalogAction(kind, name);
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
        {error ? (
          <span className="text-ops-red">{error}</span>
        ) : (
          <span className="text-ops-muted">Ad (TR) zorunlu; slug {isEdit ? 'sabit kalır' : 'otomatik'}</span>
        )}
      </span>
      <Button variant="secondary" onClick={onClose} disabled={form.formState.isSubmitting}>
        İptal
      </Button>
      <Button variant="primary" type="submit" form={FORM_ID} disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
      </Button>
    </>
  );

  return (
    <Dialog open onClose={onClose} title={isEdit ? copy.editTitle : copy.createTitle} subtitle={copy.sub} footer={footer} maxWidth={showMembers ? 560 : 460}>
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormLocalizedText
          control={form.control}
          name="name"
          label="Ad"
          required
          placeholder="Ad"
          layout="stacked"
          onAiTranslate={suggestTranslationAction}
        />
        {isEdit ? <FormSwitch control={form.control} name="isActive" label="Aktif (vitrinde görünür)" /> : null}
        {showMembers ? (
          <FormMultiSelect
            control={form.control}
            name="productIds"
            label="Ürünler"
            labelAside="bir ürün birçok koleksiyonda olabilir"
            options={products.map((p) => ({ value: p.id, label: resolveLocalizedText(p.name) }))}
            addLabel="+ ürün ekle"
            searchPlaceholder="Ürün ara…"
          />
        ) : null}
      </form>
    </Dialog>
  );
}
