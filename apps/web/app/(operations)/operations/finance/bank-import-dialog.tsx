'use client';

import { useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { decodeTextBytes, parseBankRows, parseCsv, sheetToRows, type ParseProfile, type RowParseFailure, type SheetCell, type SheetRows } from '@lezzet/domain-core';
import { BankAmountModeEnum, type BankImportProfile } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog, DialogFooter } from '@/components/operation/ui/dialog';
import { amount as formatAmount, dayMonth } from '@/components/operation/ui/format';
import { FormInput } from '@/components/operation/form/form-input';
import { FormSelect } from '@/components/operation/form/form-select';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { analyzeBankFileAction, importBankFileAction } from '@/lib/finance/actions';
import { DATE_FORMAT_LABEL, ROW_FAILURE_LABEL } from './finance-labels';
import type { AccountView } from './finance-types';

/*
  BANKA DOSYASI YÜKLEME (12.10) — "↑ Banka dosyası" düğmesinin penceresi. Üç adım, tek pencere:
  1. hesap + dosya → dosya TARAYICIDA okunur (CSV: kendi okuyucumuz; xlsx: `read-excel-file`) ve
     satır sözlüğü sunucuya gider — dosyanın kendisi değil (10 MB'lık ekstre bile satır olarak küçük);
  2. sütun eşlemesi: kayıtlı şablon varsa uygulanmış gelir, yoksa motorun/AI'nın önerisi — düşük
     güvenli alan işaretlenir, ilk beş satırın okunuşu ve okunamayan satır sayısı anında görünür;
  3. yazım: satırlar hesabın hareketi olur, mükerrer olan sessizce düşer ama SAYISI söylenir.

  Sütun eşlemesi HER HÂLDE onaya düşer (12.4): bakiye ↔ tutar karışıklığı bütün ekstreyi çöpe çevirir.
*/

const FORM_ID = 'bank-import-form';
const ACCEPT = '.csv,.txt,.xlsx';
const PREVIEW_ROWS = 5;

const ImportFormSchema = z.object({
  accountId: z.string().min(1),
  /** Yeni şablonun adı — kayıtlı şablon değiştirilmeden kullanılıyorsa yazılmaz. */
  profileName: z.string(),
  amountMode: BankAmountModeEnum,
  date: z.string(),
  label: z.string(),
  amount: z.string(),
  debit: z.string(),
  credit: z.string(),
  reference: z.string(),
  decimalSeparator: z.enum([',', '.']),
  dateFormat: z.enum(['dmy', 'ymd', 'mdy']),
});
type ImportForm = z.infer<typeof ImportFormSchema>;

/** Formdan okuyucu profiline — boş seçim `null`, moda uymayan sütun hiç gönderilmez. */
function profileOf(values: ImportForm): ParseProfile {
  const twoColumn = values.amountMode === 'debit_credit';
  return {
    amountMode: values.amountMode,
    mapping: {
      date: values.date,
      label: values.label,
      amount: twoColumn ? null : values.amount || null,
      debit: twoColumn ? values.debit || null : null,
      credit: twoColumn ? values.credit || null : null,
      reference: values.reference || null,
    },
    decimalSeparator: values.decimalSeparator,
    dateFormat: values.dateFormat,
  };
}

/** Kayıtlı şablon formda değişmeden duruyor mu — duruyorsa kimliğiyle kullanılır, yeni şablon açılmaz. */
function sameAsProfile(values: ImportForm, profile: BankImportProfile): boolean {
  const current = profileOf(values);
  return (
    current.amountMode === profile.amountMode &&
    current.decimalSeparator === profile.decimalSeparator &&
    current.dateFormat === profile.dateFormat &&
    (['date', 'label', 'amount', 'debit', 'credit', 'reference'] as const).every((key) => (current.mapping[key] ?? null) === (profile.mapping[key] ?? null))
  );
}

/** Dosya → hücre ızgarası → satırlar. xlsx tarayıcıda okunur; kütüphane yalnız o anda yüklenir. */
async function readBankFile(file: File): Promise<SheetRows> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) throw new Error('Eski .xls biçimi desteklenmiyor — bankadan .xlsx ya da CSV indirin.');
  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    // Bütün sayfalar okunur; ekstre ilk dolu sayfadadır (bankalar tek sayfa verir).
    const sheets = await readXlsxFile(file);
    const first = sheets.find((sheet) => sheet.data.length > 0) ?? sheets[0];
    const grid: SheetCell[][] = (first?.data ?? []).map((row) =>
      row.map((cell) => (cell instanceof Date || typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean' ? cell : null)),
    );
    return sheetToRows(grid);
  }
  return sheetToRows(parseCsv(decodeTextBytes(new Uint8Array(await file.arrayBuffer()))));
}

function importBlock(values: ImportForm, sheet: SheetRows | null, readable: number): string | null {
  if (!sheet) return 'Önce dosya seçin.';
  if (!values.date || !values.label) return 'Tarih ve açıklama sütunları seçilmeli.';
  if (values.amountMode === 'signed' ? !values.amount : !(values.debit && values.credit)) return 'Tutar sütunu (ya da borç + alacak) seçilmeli.';
  if (readable === 0) return 'Bu eşlemeyle hiçbir satır okunamıyor — sütunları kontrol edin.';
  return null;
}

interface ImportResult {
  inserted: number;
  duplicates: number;
  failures: RowParseFailure[];
}

interface BankImportDialogProps {
  accounts: AccountView[];
  /** Ekranda seçili hesap — dosya büyük olasılıkla onun ekstresi. */
  defaultAccountId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function BankImportDialog({ accounts, defaultAccountId, onClose, onSaved }: BankImportDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<SheetRows | null>(null);
  const [savedProfile, setSavedProfile] = useState<BankImportProfile | null>(null);
  const [lowConfidence, setLowConfidence] = useState<Set<string>>(new Set());
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const bankFirst = accounts.find((account) => account.id === defaultAccountId) ?? accounts.find((account) => account.type === 'bank') ?? accounts[0];
  const form = useForm<ImportForm>({
    resolver: zodResolver(ImportFormSchema),
    defaultValues: {
      accountId: bankFirst?.id ?? '',
      profileName: '',
      amountMode: 'signed',
      date: '',
      label: '',
      amount: '',
      debit: '',
      credit: '',
      reference: '',
      decimalSeparator: ',',
      dateFormat: 'dmy',
    },
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control }) as ImportForm;

  // Önizleme ve okunabilirlik sayımı formla birlikte değişir; okuyucu saf ve ucuz (tek geçiş).
  const parsed = useMemo(() => (sheet ? parseBankRows(sheet.rows, profileOf(watched)) : null), [sheet, watched]);
  const preview = parsed?.rows.slice(0, PREVIEW_ROWS) ?? [];
  const headerOptions = (sheet?.headers ?? []).map((header) => ({ value: header, label: header }));

  const pickFile = async (chosen: File) => {
    setError(null);
    setReading(true);
    try {
      const read = await readBankFile(chosen);
      if (read.headerRowIndex < 0) {
        setError('Dosyada başlık satırı bulunamadı — ilk satırlarda Tarih · Açıklama · Tutar gibi sütun adları olmalı.');
        return;
      }
      const { data, error: actionError } = await analyzeBankFileAction(watched.accountId, read.rows);
      if (actionError || !data) {
        setError(actionError ?? 'Dosya çözümlenemedi.');
        return;
      }
      setFile(chosen);
      setSheet(read);
      setSavedProfile(data.profile);
      const source = data.profile ?? data.suggestion;
      if (source) {
        form.setValue('amountMode', source.amountMode);
        form.setValue('date', source.mapping.date);
        form.setValue('label', source.mapping.label);
        form.setValue('amount', source.mapping.amount ?? '');
        form.setValue('debit', source.mapping.debit ?? '');
        form.setValue('credit', source.mapping.credit ?? '');
        form.setValue('reference', source.mapping.reference ?? '');
        form.setValue('decimalSeparator', source.decimalSeparator);
        form.setValue('dateFormat', source.dateFormat);
      }
      // Düşük güvenli alan işaretlenir — operatör tam oraya bakar (motorun künyesi).
      const low = new Set<string>();
      if (data.suggestion) {
        for (const [field, score] of Object.entries(data.suggestion.confidence)) if (score < 0.6) low.add(field);
      }
      setLowConfidence(low);
      const account = accounts.find((a) => a.id === watched.accountId);
      form.setValue('profileName', `${account?.name ?? 'Banka'} — ${chosen.name.split('.').pop()?.toUpperCase() ?? 'dosya'}`);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : 'Dosya okunamadı.');
    } finally {
      setReading(false);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!sheet || !file) return;
    setError(null);
    const unchanged = savedProfile ? sameAsProfile(values, savedProfile) : false;
    const { data, error: actionError } = await importBankFileAction({
      accountId: values.accountId,
      fileName: file.name,
      rows: sheet.rows,
      profileId: unchanged && savedProfile ? savedProfile.id : null,
      profileName: values.profileName,
      profile: profileOf(values),
    });
    if (actionError || !data) {
      setError(actionError ?? 'Dosya yüklenemedi.');
      return;
    }
    setResult(data);
  });

  const aside = (field: string) => (lowConfidence.has(field) ? <span className="text-ops-amber">düşük güven — kontrol edin</span> : undefined);

  if (result) {
    const reasons = new Map<RowParseFailure['reason'], number>();
    for (const failure of result.failures) reasons.set(failure.reason, (reasons.get(failure.reason) ?? 0) + 1);
    return (
      <Dialog
        open
        onClose={onSaved}
        title="Banka dosyası yüklendi"
        subtitle={file?.name}
        maxWidth={520}
        footer={
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={onSaved}>
              Kuyruğa git
            </Button>
          </div>
        }
      >
        <ul className="flex flex-col gap-2 font-ops-body text-ops-sm text-ops-ink">
          <li>
            <span className="font-ops-mono">{result.inserted}</span> satır hesabın hareketi oldu — eşleştirme kuyruğunda.
          </li>
          {result.duplicates > 0 ? (
            <li className="text-ops-muted">
              <span className="font-ops-mono">{result.duplicates}</span> satır zaten vardı, atlandı (mükerrer koruması).
            </li>
          ) : null}
          {result.failures.length > 0 ? (
            <li className="text-ops-amber">
              <span className="font-ops-mono">{result.failures.length}</span> satır okunamadı:{' '}
              {[...reasons.entries()].map(([reason, count]) => `${count} × ${ROW_FAILURE_LABEL[reason]}`).join(' · ')}
            </li>
          ) : null}
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Banka dosyası yükle"
      subtitle="CSV ya da Excel ekstresi — satırlar hesabın hareketi olur, sonra eşleştirilir"
      maxWidth={680}
      footer={
        <DialogFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitting={form.formState.isSubmitting}
          error={error}
          submitLabel={parsed ? `${parsed.rows.length} satırı yükle` : 'Yükle'}
          blockedReason={importBlock(watched, sheet, parsed?.rows.length ?? 0)}
        />
      }
    >
      <form id={FORM_ID} onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 items-end gap-3">
          <FormSelect
            control={form.control}
            name="accountId"
            label="Hesap"
            required
            disabled={!!sheet}
            options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          />
          {/* Dosya seçici gizli, düğme kitten (belge penceresinin deseni). Hesap dosyadan ÖNCE
              seçilir: şablon hesaba özeldir. */}
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                event.target.value = '';
                if (chosen) void pickFile(chosen);
              }}
            />
            <Button type="button" variant="secondary" size="sm" disabled={reading || !watched.accountId} onClick={() => fileInput.current?.click()}>
              {reading ? 'Okunuyor…' : file ? 'Dosyayı değiştir' : 'Dosya seç'}
            </Button>
            <span className="min-w-0 truncate font-ops-body text-ops-xs text-ops-muted">{file ? file.name : 'CSV, TXT ya da XLSX'}</span>
          </div>
        </div>

        {sheet ? (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-sm bg-ops-surface-sunken px-2.5 py-2 font-ops-body text-ops-xs text-ops-muted">
              <span>
                <span className="font-ops-mono text-ops-ink">{sheet.rows.length}</span> satır · başlık {sheet.headerRowIndex + 1}. satırda
                {sheet.blankRows > 0 ? ` · ${sheet.blankRows} boş satır atlandı` : ''}
              </span>
              {savedProfile ? (
                <Badge tone="olive" outline>
                  kayıtlı şablon: {savedProfile.name}
                </Badge>
              ) : (
                <Badge tone="amber" outline>
                  yeni şablon — eşlemeyi onaylayın
                </Badge>
              )}
            </div>

            <Controller
              control={form.control}
              name="amountMode"
              render={({ field }) => (
                <div className="flex flex-col gap-1.5">
                  <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Tutar geleneği</span>
                  <MultiToggle
                    value={field.value}
                    onChange={field.onChange}
                    label="Tutarın dosyada nasıl durduğu"
                    options={[
                      { key: 'signed', label: 'Tek işaretli sütun (−45,90)' },
                      { key: 'debit_credit', label: 'Ayrı borç / alacak sütunları' },
                    ]}
                  />
                </div>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormSelect control={form.control} name="date" label="Tarih sütunu" required labelAside={aside('date')} placeholder="Seçin" options={headerOptions} />
              <FormSelect control={form.control} name="label" label="Açıklama sütunu" required labelAside={aside('label')} placeholder="Seçin" options={headerOptions} />
              {watched.amountMode === 'signed' ? (
                <FormSelect control={form.control} name="amount" label="Tutar sütunu" required labelAside={aside('amount')} placeholder="Seçin" options={headerOptions} />
              ) : (
                <>
                  <FormSelect control={form.control} name="debit" label="Borç (çıkış) sütunu" required labelAside={aside('debit')} placeholder="Seçin" options={headerOptions} />
                  <FormSelect control={form.control} name="credit" label="Alacak (giriş) sütunu" required labelAside={aside('credit')} placeholder="Seçin" options={headerOptions} />
                </>
              )}
              <FormSelect control={form.control} name="reference" label="Referans sütunu" labelAside="varsa" placeholder="Yok" options={headerOptions} />
              <FormSelect
                control={form.control}
                name="decimalSeparator"
                label="Ondalık ayırıcı"
                options={[
                  { value: ',', label: 'Virgül (1 234,56)' },
                  { value: '.', label: 'Nokta (1,234.56)' },
                ]}
              />
              <FormSelect
                control={form.control}
                name="dateFormat"
                label="Tarih düzeni"
                options={(['dmy', 'ymd', 'mdy'] as const).map((format) => ({ value: format, label: DATE_FORMAT_LABEL[format] }))}
              />
            </div>

            {/* Şablon adı yalnız YENİ şablonda sorulur; kayıtlı şablon değiştirilirse de yeni bir
                şablon doğar (eskisi silinmez — önceki yüklemelerin izi onda). */}
            {!savedProfile || !sameAsProfile(watched, savedProfile) ? (
              <FormInput control={form.control} name="profileName" label="Şablon adı" labelAside="sonraki dosyalarda otomatik uygulanır" placeholder="Crédit Mutuel — CSV" />
            ) : null}

            {/* ÖNİZLEME: eşleme değiştikçe ilk beş satırın okunuşu ve okunamayan sayısı — yanlış
                sütun seçildiğinde "0 satır okunuyor" anında görünür, dosya yüklendikten sonra değil. */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">Okunuş (ilk {PREVIEW_ROWS})</span>
                <span className="font-ops-body text-ops-micro text-ops-faint">
                  {parsed ? `${parsed.rows.length} okunuyor` : ''}
                  {parsed && parsed.failures.length > 0 ? ` · ${parsed.failures.length} okunamıyor` : ''}
                </span>
              </div>
              {preview.length === 0 ? (
                <span className="font-ops-body text-ops-xs text-ops-amber">Bu eşlemeyle hiçbir satır okunamıyor.</span>
              ) : (
                <ul className="flex flex-col divide-y divide-ops-line rounded-ops-card border border-ops-line">
                  {preview.map((row, index) => (
                    <li key={index} className="flex items-baseline gap-3 px-3 py-1.5 font-ops-body text-ops-xs">
                      <span className="w-14 shrink-0 font-ops-mono text-ops-muted">{dayMonth(row.valueDate)}</span>
                      <span className="min-w-0 flex-1 truncate text-ops-ink">{row.label}</span>
                      <span className={`shrink-0 font-ops-mono ${row.direction === 'in' ? 'text-ops-olive-dark' : 'text-ops-ink'}`}>
                        {row.direction === 'in' ? '+' : '−'}
                        {formatAmount(Math.round(row.amount * 100))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </form>
    </Dialog>
  );
}
