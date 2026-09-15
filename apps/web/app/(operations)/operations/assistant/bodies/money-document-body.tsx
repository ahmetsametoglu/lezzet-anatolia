'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fromCents, toCents } from '@lezzet/helper';
import type { MoneyDocumentPayload } from '@lezzet/types';
import { DocumentFormBody } from '@/components/operation/form/document-form/body';
import { DocumentFileField } from '@/components/operation/form/document-form/file-field';
import { DOCUMENT_KIND_LABEL, VAT_REGIME_LABEL } from '@/components/operation/form/document-form/labels';
import { DocumentFormSchema, type DocumentForm, type StockLinkOption } from '@/components/operation/form/document-form/schema';
import { ProposalAside, type ProposalFact, type ProposalMeta } from '@/components/operation/ui/proposal-aside';
import { money, shortDate } from '@/components/operation/ui/format';
import { documentStockLinksAction } from '@/lib/finance/actions';
import type { AssistantFormOptions } from '@/lib/assistant/form-options';
import type { ProposalSubject } from '@/lib/assistant/subject';

/**
 * BELGE ÖNERİSİ — kuyruğun içinde, Para ekranının GERÇEK belge formuyla (22.44 · kullanıcı kararı 14.09).
 *
 * Asistan faturayı okur ve alanları doldurur; patron burada düzeltir ve kaydeder. Kaydeden kapı Para
 * ekranının kendi eylemi (`createDocumentAction` + `withProposal`) — kuyruk ikinci bir yazma yolu açmaz.
 *
 * ── DOSYA BURADA BIRAKILIR ─────────────────────────────────────────────────
 * MCP araçlarının girdisi yalnız metin: asistan faturayı OKUR ama dosyanın kendisini sisteme taşıyamaz.
 * Dosya onay anında bu gövdede seçilir ve belge yazıldıktan sonra yüklenir (`uploadDocumentFile`) — Para
 * ekranının belge penceresiyle aynı sıra.
 */

/** Belge önerisinin taslağı — formun değerleri ve onayda yüklenecek dosya (dosya formun alanı değil). */
export interface DocumentDraft {
  values: DocumentForm;
  file: File | null;
}

/**
 * Dilekçe → formun açılış değerleri. Tür dilekçede sözlük slug'ı; formun yönüne uymuyorsa ya da sözlükte
 * artık yoksa form türsüz açılır ve operatör seçer — uydurma bir türle "izahlı" görünmesindense.
 */
export function documentValuesFrom(payload: MoneyDocumentPayload, natures: AssistantFormOptions['natures']): DocumentDraft {
  const natureFits =
    payload.nature !== null && natures.some((nature) => nature.value === payload.nature && (nature.direction === null || nature.direction === payload.direction));
  return {
    values: {
      kind: payload.kind,
      number: payload.number ?? '',
      issuedOn: payload.issuedOn,
      // Cari adla çözülemediyse kimlik boş gelir, ad künyede ("Karşı taraf") durur — seçimi operatör yapar.
      counterpartyId: payload.counterpartyId ?? '',
      supplierId: payload.supplierId ?? '',
      stockLink: '',
      direction: payload.direction,
      nature: natureFits ? (payload.nature ?? '') : '',
      tags: [],
      note: payload.note ?? '',
      invoice: {
        // Dilekçe CENT, form EURO — çevrim sınırda (`schema.ts` künyesi).
        amount: fromCents(payload.amountCents),
        vatAmount: payload.vatAmountCents === null ? null : fromCents(payload.vatAmountCents),
        vatRegime: payload.vatRegime,
        dueOn: payload.dueOn ?? '',
      },
    },
    file: null,
  };
}

interface MoneyDocumentBodyProps {
  payload: MoneyDocumentPayload;
  subject: ProposalSubject | null;
  options: AssistantFormOptions;
  meta: ProposalMeta;
  draft: DocumentDraft;
  onChange: (next: DocumentDraft) => void;
  disabled: boolean;
  readOnly: boolean;
}

export function MoneyDocumentBody({ payload, subject, options, meta, draft, onChange, disabled, readOnly }: MoneyDocumentBodyProps) {
  // RHF örneği GÖVDEDE, gerçeğin sahibi ÇERÇEVE — öteki gövdelerdeki aynı köprü.
  const form = useForm<DocumentForm>({
    resolver: zodResolver(DocumentFormSchema),
    defaultValues: draft.values,
    values: draft.values,
    mode: 'onChange',
  });
  const live = form.watch();
  useEffect(() => {
    onChange({ values: live, file: draft.file });
  }, [JSON.stringify(live)]);

  // "Neyin faturası" seçenekleri seçili tedarikçinin (Para ekranının penceresiyle aynı okuma).
  const [stockLinks, setStockLinks] = useState<StockLinkOption[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  useEffect(() => {
    if (!live.supplierId || readOnly) {
      setStockLinks([]);
      return;
    }
    let current = true;
    setLinksLoading(true);
    void documentStockLinksAction(live.supplierId).then((result) => {
      if (!current) return;
      setStockLinks(result.data ?? []);
      setLinksLoading(false);
    });
    return () => {
      current = false;
    };
  }, [live.supplierId, readOnly]);

  const supplierOptions = options.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
    country: supplier.country,
    paymentTermDays: supplier.paymentTermDays,
  }));

  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex min-w-[26rem] flex-[2] basis-0 flex-col gap-4 rounded-ops-card border border-ops-line bg-ops-subtle p-3">
        <DocumentFormBody
          control={form.control}
          setValue={form.setValue}
          values={live}
          supplierOptions={supplierOptions}
          counterpartyOptions={options.counterparties}
          natureOptions={options.natures}
          tagOptions={options.tags}
          stockLinkOptions={stockLinks}
          stockLinkLoading={linksLoading}
          disabled={disabled || readOnly}
        />
        {readOnly ? null : (
          <DocumentFileField
            file={draft.file}
            onChange={(file) => onChange({ values: live, file })}
            label="Faturanın dosyası (isteğe bağlı)"
            disabled={disabled}
          />
        )}
      </div>

      <ProposalAside subject={subject} fallbackTitle="Belge" facts={factsOf(payload, live, options)} payload={payload} meta={meta} />
    </div>
  );
}

/** Dilekçenin öne çıkan satırları — `now` verilen satır YALNIZ sapma varken çizilir (`ProposalAside` künyesi). */
function factsOf(payload: MoneyDocumentPayload, values: DocumentForm, options: AssistantFormOptions): ProposalFact[] {
  const party = values.supplierId
    ? options.suppliers.find((supplier) => supplier.id === values.supplierId)?.name
    : options.counterparties.find((counterparty) => counterparty.value === values.counterpartyId)?.label;
  const natureLabel = (slug: string | null) => (slug ? (options.natures.find((nature) => nature.value === slug)?.label ?? slug) : '—');
  const day = (iso: string | null) => (iso ? shortDate(iso) : '—');
  return [
    { label: 'Belge', value: `${DOCUMENT_KIND_LABEL[payload.kind]}${payload.number ? ` ${payload.number}` : ''}` },
    { label: 'Tutar', value: money(payload.amountCents), now: values.invoice.amount === null ? '—' : money(toCents(values.invoice.amount)) },
    { label: 'Karşı taraf', value: payload.supplierName ?? payload.counterpartyName ?? '—', now: party ?? '—' },
    { label: 'Tür', value: natureLabel(payload.nature), now: natureLabel(values.nature || null) },
    { label: 'KDV rejimi', value: VAT_REGIME_LABEL[payload.vatRegime], now: VAT_REGIME_LABEL[values.invoice.vatRegime] },
    { label: 'Vade', value: day(payload.dueOn), now: day(values.invoice.dueOn || null) },
  ];
}
