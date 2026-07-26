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
import type { ActionResult } from '@/lib/error';
import { createCategoryAction, createCollectionAction } from '../actions/actions';

// Kategori/Koleksiyon oluşturma — tek dialog, `kind` ile çatallanır (no-duplication). Çok dilli ad
// FormLocalizedText'le (TR/FR/DE, TR zorunlu). RHF + zodResolver. slug servis addan türetir.

type Kind = 'category' | 'collection';

const CreateSchema = z.object({ name: LocalizedTextSchema });
type CreateValues = z.infer<typeof CreateSchema>;

const COPY: Record<Kind, { title: string; sub: string; action: (n: LocalizedText) => Promise<ActionResult> }> = {
  category: { title: 'Yeni kategori', sub: 'Ürünün yapısal grubu (düz, tek seviye)', action: createCategoryAction },
  collection: { title: 'Yeni koleksiyon', sub: 'Esnek pazarlama grubu (bir ürün birçok koleksiyonda)', action: createCollectionAction },
};

const FORM_ID = 'catalog-create';

export function CatalogCreateDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[kind];
  const form = useForm<CreateValues>({ resolver: zodResolver(CreateSchema), defaultValues: { name: {} }, mode: 'onChange' });

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setError(null);
    const { error: actionError } = await copy.action(name);
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
        {error ? <span className="text-ops-red">{error}</span> : <span className="text-ops-muted">Ad (TR) zorunlu; slug otomatik</span>}
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
    <Dialog open onClose={onClose} title={copy.title} subtitle={copy.sub} footer={footer} maxWidth={460}>
      <form id={FORM_ID} onSubmit={onSubmit}>
        <FormLocalizedText control={form.control} name="name" label="Ad" required placeholder="Ad" />
      </form>
    </Dialog>
  );
}
