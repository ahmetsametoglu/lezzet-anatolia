'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LocalizedTextSchema, type LocalizedText } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FormLocalizedText } from '@/components/operation/form/form-localized-text';
import { FormSwitch } from '@/components/operation/form/form-switch';
import { suggestTranslationAction } from '../../actions/translate';
import { createCatalogAction, updateCatalogAction } from './actions';
import type { CatalogKind } from '../../products-types';

// Kategori/Koleksiyon oluşturma + düzenleme — tek dialog, `kind` ile çatallanır (no-duplication).
// `edit` verilirse düzenleme (yoksa oluşturma). Çok dilli ad FormLocalizedText'le; tek-kısa-alan
// olduğundan `layout="stacked"` (TR/FR/DE aynı anda ayrı input, hepsi görünür — tab değil). TR zorunlu;
// düzenlemede ayrıca aktif/pasif. slug oluşturmada servisçe addan türer, düzenlemede SABİT kalır (URL korunur).

interface CatalogEditTarget {
  id: string;
  name: LocalizedText;
  isActive: boolean;
}

const FormSchema = z.object({ name: LocalizedTextSchema, isActive: z.boolean() });
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

export function CatalogFormDialog({ kind, edit, onClose }: { kind: CatalogKind; edit?: CatalogEditTarget; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const isEdit = edit !== undefined;
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: edit?.name ?? {}, isActive: edit?.isActive ?? true },
    mode: 'onChange',
  });

  const onSubmit = form.handleSubmit(async ({ name, isActive }) => {
    setError(null);
    const { error: actionError } = isEdit
      ? await updateCatalogAction(kind, edit.id, { name, isActive })
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
    <Dialog open onClose={onClose} title={isEdit ? copy.editTitle : copy.createTitle} subtitle={copy.sub} footer={footer} maxWidth={460}>
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
      </form>
    </Dialog>
  );
}
