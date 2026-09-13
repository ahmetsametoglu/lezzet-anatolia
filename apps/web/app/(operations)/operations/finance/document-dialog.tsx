'use client';

import { useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ALLOWED_DOCUMENT_EXTENSIONS } from '@lezzet/domain-core';
import { toCents } from '@lezzet/helper';
import { DocumentKindEnum, MovementDirectionEnum } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { DateField } from '@/components/operation/form/date-field';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { attachDocumentFileAction, createDocumentAction, requestDocumentUploadAction } from '@/lib/finance/actions';
import { DOCUMENT_DIRECTION_LABEL, DOCUMENT_KIND_LABEL } from './finance-labels';

/*
  BELGE GİRİŞİ (12.12 · kullanıcı kararı 13.09: "para hareketi ya etiketlenebilmeli ya resmî bir
  belgeyle ilişkilendirilmeli; dosya eki de baştan").

  Fatura geldiğinde para henüz çıkmamıştır ama borç doğmuştur — bu pencere borcu kaydeder; ödeme
  sonra "Ödemesini yaz" ile hareket olarak gelir ve belgeye bağlanır.

  ── DOSYA ÜÇ ADIMDA, BELGE ÖNCE ─────────────────────────────────────────────
  Belge kaydedilir → dosya için izin istenir → istemci dosyayı DOĞRUDAN özel kovaya koyar →
  anahtar belgeye bağlanır. Sıra bu, çünkü anahtar belge kimliğinden kuruluyor (talep fotoğrafının
  deseni). Yükleme düşerse BELGE YİNE KAYITLIDIR ve pencere bunu söyler: dosyasız belge, hiç
  girilmemiş belgeden iyidir.

  ── HAM `<input type="file">` ────────────────────────────────────────────────
  Kitin dosya seçici bileşeni yok (görsel kırpma alanı fotoğrafa özel); tarayıcının kendi seçicisi
  gizli tutulup kitin düğmesiyle tetikleniyor — CLAUDE §2'nin "ham eleman son çare" hâli.
*/

const FORM_ID = 'money-document-form';

/** Seçicinin süzgeci ve ipucu MOTORUN listesinden: kabul edilen türler tek yerde yazılı. */
const ACCEPT = ALLOWED_DOCUMENT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
const ACCEPT_HINT = ALLOWED_DOCUMENT_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ');

const DocumentFormSchema = z.object({
  kind: DocumentKindEnum,
  number: z.string(),
  issuedOn: z.string(),
  counterparty: z.string(),
  /** Boş dize = tedarikçi değil (kiraya veren, çalışan, kurum). */
  supplierId: z.string(),
  direction: MovementDirectionEnum,
  /** **EURO** — kapıya `toCents` ile gider (`ManualMovementSchema` ile aynı gerekçe). */
  amount: z.number().positive().nullable(),
  /** **EURO**; `null` = belgede KDV yazmıyor. */
  vatAmount: z.number().nonnegative().nullable(),
  tags: z.array(z.string()),
  note: z.string(),
});
type DocumentForm = z.infer<typeof DocumentFormSchema>;

/** Kaydetmenin engeli, tek cümlede — "neden düğme kapalı" sorusunun cevabı. */
function documentBlock(values: DocumentForm): string | null {
  if (!values.issuedOn) return 'Belgenin tarihi seçilmeli.';
  if (!values.amount || values.amount <= 0) return 'Belge tutarı sıfırdan büyük olmalı.';
  if (values.vatAmount !== null && values.vatAmount > values.amount) return 'KDV, belge toplamını aşamaz.';
  if (!values.counterparty.trim() && !values.supplierId) return 'Karşı taraf yazılmalı ya da tedarikçi seçilmeli.';
  return null;
}

interface DocumentDialogProps {
  supplierOptions: Array<{ value: string; label: string }>;
  tagOptions: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSaved: () => void;
}

export function DocumentDialog({ supplierOptions, tagOptions, onClose, onSaved }: DocumentDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<DocumentForm>({
    resolver: zodResolver(DocumentFormSchema),
    defaultValues: {
      kind: 'invoice',
      number: '',
      issuedOn: new Date().toISOString().slice(0, 10),
      counterparty: '',
      supplierId: '',
      direction: 'out',
      amount: null,
      vatAmount: null,
      tags: [],
      note: '',
    },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as DocumentForm;

  const toggleTag = (slug: string) => {
    const next = watched.tags.includes(slug) ? watched.tags.filter((tag) => tag !== slug) : [...watched.tags, slug];
    form.setValue('tags', next, { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const created = await createDocumentAction({
      kind: values.kind,
      number: values.number,
      issuedOn: values.issuedOn,
      counterparty: values.counterparty,
      supplierId: values.supplierId || null,
      direction: values.direction,
      amountCents: toCents(values.amount ?? 0),
      vatAmountCents: values.vatAmount === null ? null : toCents(values.vatAmount),
      tags: values.tags,
      note: values.note,
    });
    if (created.error || !created.data) {
      setError(created.error ?? 'Belge kaydedilemedi.');
      return;
    }

    if (file) {
      const ticket = await requestDocumentUploadAction(created.data.documentId, file.name);
      if (ticket.error || !ticket.data) {
        // Belge kayıtlı, dosyası değil — söylenir, gizlenmez; pencere kapanmaz ki operatör okusun.
        setError(`Belge kaydedildi ama dosya yüklenemedi: ${ticket.error ?? 'izin alınamadı'}`);
        return;
      }
      const put = await fetch(ticket.data.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': ticket.data.contentType } });
      if (!put.ok) {
        setError('Belge kaydedildi ama dosya depoya yazılamadı — belgeyi açıp dosyayı yeniden yükleyin.');
        return;
      }
      const attached = await attachDocumentFileAction(created.data.documentId, ticket.data.key);
      if (attached.error) {
        setError(`Belge kaydedildi ama dosya bağlanamadı: ${attached.error}`);
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
      maxWidth={600}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel={file ? 'Belgeyi ve dosyayı kaydet' : 'Belgeyi kaydet'}
          blockedReason={documentBlock(watched)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <FormSelect
            control={form.control}
            name="kind"
            label="Belge türü"
            required
            options={DocumentKindEnum.options.map((kind) => ({ value: kind, label: DOCUMENT_KIND_LABEL[kind] }))}
          />
          <Controller
            control={form.control}
            name="issuedOn"
            render={({ field }) => <DateField label="Belge tarihi" required value={field.value} onChange={field.onChange} />}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormInput control={form.control} name="number" label="Belge numarası" labelAside="fişte olmayabilir" placeholder="FA-2026-0912" mono />
          <Controller
            control={form.control}
            name="direction"
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Yön</span>
                <MultiToggle
                  value={field.value}
                  onChange={field.onChange}
                  label="Belgenin yönü"
                  options={MovementDirectionEnum.options.map((direction) => ({ key: direction, label: DOCUMENT_DIRECTION_LABEL[direction] }))}
                />
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormInput control={form.control} name="counterparty" label="Karşı taraf" placeholder="SCI Rhin Immobilier · URSSAF · çalışan adı" />
          <FormSelect
            control={form.control}
            name="supplierId"
            label="Tedarikçi"
            labelAside="stok alımıysa"
            placeholder="Tedarikçi değil"
            options={supplierOptions}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormMoney control={form.control} name="amount" label="Belge toplamı" labelAside="KDV dâhil" required placeholder="0,00" />
          <FormMoney control={form.control} name="vatAmount" label="KDV tutarı" labelAside="belgede yoksa boş" placeholder="0,00" />
        </div>

        {/* Etiket sözlükten, çoklu (13.09): belgenin etiketi ödemesine de geçer ("Ödemesini yaz"
            formu bunlarla açılır) — aynı şeyi iki kez seçtirmemek için. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Etiketler (isteğe bağlı)</span>
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={watched.tags.includes(option.value)}
                onClick={() => toggleTag(option.value)}
                className={`cursor-pointer rounded-ops-chip border px-2.5 py-1 font-ops-body text-ops-xs transition-colors ${
                  watched.tags.includes(option.value)
                    ? 'border-ops-olive bg-ops-olive-bg text-ops-olive-dark'
                    : 'border-ops-line text-ops-muted hover:border-ops-line-strong hover:text-ops-ink'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <FormInput control={form.control} name="note" label="Not" placeholder="Eylül kirası · 3 taksitin ilki" />

        {/* DOSYA — PDF ya da fotoğraf. Seçici gizli, düğme kitten; seçilen ad yanında okunur. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Dosya (isteğe bağlı)</span>
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              {file ? 'Dosyayı değiştir' : 'Dosya seç'}
            </Button>
            <span className="min-w-0 truncate font-ops-body text-ops-xs text-ops-muted">{file ? file.name : ACCEPT_HINT}</span>
            {file ? (
              <button type="button" onClick={() => setFile(null)} className="cursor-pointer font-ops-body text-ops-xs text-ops-faint hover:text-ops-ink">
                Kaldır
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </Dialog>
  );
}
