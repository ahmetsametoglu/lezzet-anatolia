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
import { Combobox } from '@/components/operation/form/combobox';
import { DateField } from '@/components/operation/form/date-field';
import { FieldShell } from '@/components/operation/form/field-shell';
import { FormInput } from '@/components/operation/form/form-input';
import { FormMoney } from '@/components/operation/form/money-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import {
  naturesForDirection,
  type CounterpartyOption,
  type NatureOption,
  type TagOption,
} from '@/components/operation/form/movement-form/schema';
import { attachDocumentFileAction, createDocumentAction, requestDocumentUploadAction } from '@/lib/finance/actions';
import { DOCUMENT_DIRECTION_LABEL, DOCUMENT_KIND_LABEL } from './finance-labels';

/*
  BELGE GİRİŞİ (12.12 · kullanıcı kararı 13.09: "para hareketi ya etiketlenebilmeli ya resmî bir
  belgeyle ilişkilendirilmeli; dosya eki de baştan").

  Fatura geldiğinde para henüz çıkmamıştır ama borç doğmuştur — bu pencere borcu kaydeder; ödeme
  sonra "Ödemesini yaz" ile hareket olarak gelir ve belgeye bağlanır.

  ── KARŞI TARAF: CARİ YA DA TEDARİKÇİ (13.09 · ikinci karar) ─────────────────
  Karşı taraf bir tur serbest metindi ve aynı ev sahibi "SCI Rhin" / "SCI Rhin Immobilier" diye iki
  kişi olabiliyordu. Artık sözlükten seçilir: kurum, hizmet veren, çalışan → CARİ; stok alımı →
  TEDARİKÇİ. İkisi birden olmaz (şema kısıtı `money_document_party`); biri seçilince öteki boşalır.
  Carinin varsayılan türü boş türe önerilir. Belgenin TÜRÜ ödemesine de geçer.

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
  /** Cari (13.09) — boş dize = cari değil. Tedarikçiyle birlikte seçilemez. */
  counterpartyId: z.string(),
  /** Boş dize = tedarikçi değil. */
  supplierId: z.string(),
  direction: MovementDirectionEnum,
  /** Belgenin türü — boş dize = türsüz; ödemesi bağlanınca harekete de geçer. */
  nature: z.string(),
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
  if (!values.counterpartyId && !values.supplierId) return 'Karşı taraf seçilmeli — cari ya da tedarikçi.';
  return null;
}

interface DocumentDialogProps {
  supplierOptions: Array<{ value: string; label: string }>;
  /** Tür, cari ve etiket sözlükleri (13.09) — yalnız aktifler. */
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
  const fileInput = useRef<HTMLInputElement>(null);

  const form = useForm<DocumentForm>({
    resolver: zodResolver(DocumentFormSchema),
    defaultValues: {
      kind: 'invoice',
      number: '',
      issuedOn: new Date().toISOString().slice(0, 10),
      counterpartyId: '',
      supplierId: '',
      direction: 'out',
      nature: '',
      amount: null,
      vatAmount: null,
      tags: [],
      note: '',
    },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as DocumentForm;
  const natures = naturesForDirection(natureOptions, watched.direction);
  const set = (name: 'counterpartyId' | 'supplierId' | 'nature', value: string) => form.setValue(name, value, { shouldValidate: true });

  /** Cari seçilince tedarikçi boşalır (karşı taraf tektir) ve carinin varsayılan türü BOŞ türe konur. */
  const pickCounterparty = (id: string) => {
    set('counterpartyId', id);
    set('supplierId', '');
    const preset = counterpartyOptions.find((option) => option.value === id)?.defaultNature;
    if (!watched.nature && preset && natures.some((nature) => nature.value === preset)) set('nature', preset);
  };
  const pickSupplier = (id: string) => {
    set('supplierId', id);
    set('counterpartyId', '');
  };
  const createTag = async (label: string) => {
    const slug = await onCreateTag(label);
    if (slug && !watched.tags.includes(slug)) form.setValue('tags', [...watched.tags, slug], { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const created = await createDocumentAction({
      kind: values.kind,
      number: values.number,
      issuedOn: values.issuedOn,
      counterpartyId: values.counterpartyId || null,
      supplierId: values.supplierId || null,
      direction: values.direction,
      nature: values.nature || null,
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
                  onChange={(next) => {
                    field.onChange(next);
                    // Yön değişince uymayan tür boşalır — gider türü bize ödenecek belgeye konmaz.
                    if (!naturesForDirection(natureOptions, next).some((nature) => nature.value === watched.nature)) set('nature', '');
                  }}
                  label="Belgenin yönü"
                  options={MovementDirectionEnum.options.map((direction) => ({ key: direction, label: DOCUMENT_DIRECTION_LABEL[direction] }))}
                />
              </div>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Cari" labelAside="kurum · hizmet veren · çalışan">
            <Combobox
              value={watched.counterpartyId}
              onChange={pickCounterparty}
              options={counterpartyOptions.map(({ value, label }) => ({ value, label }))}
              placeholder="Cari seçin"
              searchPlaceholder="Cari ara…"
              emptyText="Cari yok — Sözlük penceresinden ekleyin"
              onClear={() => set('counterpartyId', '')}
              clearLabel="Cariyi kaldır"
            />
          </FieldShell>
          <FieldShell label="Tedarikçi" labelAside="stok alımıysa">
            <Combobox
              value={watched.supplierId}
              onChange={pickSupplier}
              options={supplierOptions}
              placeholder="Tedarikçi değil"
              searchPlaceholder="Tedarikçi ara…"
              emptyText="Aramaya uyan tedarikçi yok"
              onClear={() => set('supplierId', '')}
              clearLabel="Tedarikçiyi kaldır"
            />
          </FieldShell>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FieldShell label="Türü" labelAside="ödemesine de geçer">
            <Combobox
              value={watched.nature}
              onChange={(nature) => set('nature', nature)}
              options={natures.map(({ value, label }) => ({ value, label }))}
              placeholder="Tür seçin"
              searchPlaceholder="Tür ara…"
              emptyText="Bu yöne uyan tür yok"
              onClear={() => set('nature', '')}
              clearLabel="Türü kaldır"
            />
          </FieldShell>
          <FieldShell label="Etiketler" labelAside="isteğe bağlı">
            <MultiSelect
              options={tagOptions}
              selected={watched.tags}
              onChange={(next) => form.setValue('tags', next, { shouldValidate: true })}
              addLabel="+ etiket"
              searchPlaceholder="Etiket ara ya da yaz…"
              emptyText="Etiket yok"
              onCreate={(label) => void createTag(label)}
            />
          </FieldShell>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormMoney control={form.control} name="amount" label="Belge toplamı" labelAside="KDV dâhil" required placeholder="0,00" />
          <FormMoney control={form.control} name="vatAmount" label="KDV tutarı" labelAside="belgede yoksa boş" placeholder="0,00" />
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
