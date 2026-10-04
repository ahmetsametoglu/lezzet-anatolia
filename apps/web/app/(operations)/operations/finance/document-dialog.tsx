'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { parisDateOf } from '@lezzet/helper';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { DocumentFormBody } from '@/components/operation/form/document-form/body';
import { DocumentFileField, uploadDocumentFile } from '@/components/operation/form/document-form/file-field';
import {
  DocumentFormSchema,
  documentBlock,
  documentInputOf,
  emptyDocumentForm,
  type DocumentForm,
  type StockLinkOption,
  type SupplierOption,
} from '@/components/operation/form/document-form/schema';
import type { CounterpartyOption, NatureOption, TagOption } from '@/components/operation/form/movement-form/schema';
import { createDocumentAction, documentStockLinksAction } from '@/lib/finance/actions';

/*
  Belge girişi borcu kaydeder: fatura geldiğinde para henüz çıkmamıştır, ödeme sonra "Ödemesini yaz" ile hareket olarak gelir ve
  belgeye bağlanır. Alanlar asistan kuyruğuyla ortak formdadır; pencerede yalnız ona özgü iş kalır (seçenekleri okumak, dosya, kapanış).
*/

/* Belge kaydedilir, sonra dosyası yüklenir; yükleme düşerse ikinci basış belgeyi yeniden yazmaz, yalnız dosyayı yeniden dener, yoksa aynı
   borç iki kez doğardı. */

const FORM_ID = 'money-document-form';

interface DocumentDialogProps {
  /** Aktif tedarikçiler, ülkesi ve vadesiyle (rejim ve vade önerisi için). */
  supplierOptions: SupplierOption[];
  /** Tür, cari ve etiket sözlükleri, yalnız aktifler. */
  counterpartyOptions: CounterpartyOption[];
  natureOptions: NatureOption[];
  tagOptions: TagOption[];
  /** Etiket menüsünün "oluştur" satırı — yeni etiketin anahtarını döner. */
  onCreateTag: (label: string) => Promise<string | null>;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentDialog({ supplierOptions, counterpartyOptions, natureOptions, tagOptions, onCreateTag, onClose, onSaved }: DocumentDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [stockLinks, setStockLinks] = useState<StockLinkOption[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  const form = useForm<DocumentForm>({
    resolver: zodResolver(DocumentFormSchema),
    defaultValues: emptyDocumentForm(parisDateOf(new Date())),
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as DocumentForm;

  // "Neyin faturası" seçenekleri seçili tedarikçinindir; eski tedarikçinin cevabı geç gelirse yenisinin listesini ezmesin diye atılır.
  useEffect(() => {
    if (!watched.supplierId) {
      setStockLinks([]);
      return;
    }
    let current = true;
    setLinksLoading(true);
    void documentStockLinksAction(watched.supplierId).then((result) => {
      if (!current) return;
      setStockLinks(result.data ?? []);
      setLinksLoading(false);
    });
    return () => {
      current = false;
    };
  }, [watched.supplierId]);

  const createTag = async (label: string) => {
    const slug = await onCreateTag(label);
    if (slug && !watched.tags.includes(slug)) form.setValue('tags', [...watched.tags, slug], { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    let documentId = savedId;
    if (!documentId) {
      const created = await createDocumentAction(documentInputOf(values));
      if (created.error || !created.data) {
        setError(created.error ?? 'Belge kaydedilemedi.');
        return;
      }
      documentId = created.data.documentId;
      setSavedId(documentId);
    }

    if (file) {
      const uploadError = await uploadDocumentFile(documentId, file);
      if (uploadError) {
        // Belge kayıtlı, dosyası değil — söylenir, gizlenmez; pencere kapanmaz ki operatör okusun ve
        // yeniden denesin (bu kez yalnız dosya gider).
        setError(uploadError);
        return;
      }
    }
    onSaved();
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Yeni belge"
      subtitle="Fatura, fiş, bordro, sözleşme ya da dekont — borç burada doğar, ödeme sonra bağlanır"
      maxWidth={640}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel={savedId ? 'Dosyayı yeniden yükle' : file ? 'Belgeyi ve dosyayı kaydet' : 'Belgeyi kaydet'}
          blockedReason={savedId ? null : documentBlock(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <DocumentFormBody
          control={form.control}
          setValue={form.setValue}
          values={watched}
          supplierOptions={supplierOptions}
          counterpartyOptions={counterpartyOptions}
          natureOptions={natureOptions}
          tagOptions={tagOptions}
          onCreateTag={(label) => void createTag(label)}
          stockLinkOptions={stockLinks}
          stockLinkLoading={linksLoading}
          // Belge yazıldıysa alanlar kilitlenir: kalan tek iş dosya — değiştirilen alan artık hiçbir yere gitmez.
          disabled={savedId !== null}
        />
        <DocumentFileField file={file} onChange={setFile} />
      </form>
    </Dialog>
  );
}
