'use client';

import { useState } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { FieldShell } from '@/components/operation/form/field-shell';
import { InputField } from '@/components/operation/form/input';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { Select } from '@/components/operation/form/select';
import { ToggleField } from '@/components/operation/form/toggle';
import { removeSettingExceptionAction, resetSettingAction, saveSettingAction } from './actions';
import {
  channelLabel,
  checkBounds,
  DEFAULT_TEMPLATE_OPTION,
  invoiceTemplateProblem,
  parseSettingValue,
  SCOPE_AXIS_LABELS,
  toEditableNumber,
} from './settings-labels';
import type { AccountOption, ExceptionScope, ScopeOptions, SettingRowView, SettingsData } from './settings-types';
import type { SettingValue } from './settings-catalog';
import { useDialogAction } from './use-dialog-action.hook';

/**
 * Ayar düzenleme penceresi: genel değer, izin verilen eksenlerde istisnalar ve geniş etkili ayarda uyarı; izin olmayan bölüm hiç
 * çizilmez, çünkü boş bir "istisna ekle" olmayan bir yeteneği varmış gibi gösterirdi. Yazarken görünen sınır uyarısı ile kaydetmedeki
 * ret aynı fonksiyondandır (`checkBounds`), kural yürürlüğe sunucuda girer.
 */

interface SettingDialogProps {
  row: SettingRowView;
  scopeOptions: ScopeOptions;
  /** `account` türündeki ayarın seçenekleri — yalnız aktif hesaplar (`page.tsx`). */
  accountOptions: AccountOption[];
  invoiceTemplates: SettingsData['invoiceTemplates'];
  propagationSeconds: number;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingDialog({
  row,
  scopeOptions,
  accountOptions,
  invoiceTemplates,
  propagationSeconds,
  onClose,
  onSaved,
}: SettingDialogProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(row, row.value));
  const { busy, running, error, run } = useDialogAction(onSaved);

  /** Açık istisna formu: eksen seçilince açılır. */
  const [exceptionAxis, setExceptionAxis] = useState<ExceptionScope | null>(null);
  const [exceptionTarget, setExceptionTarget] = useState('');
  const [exceptionDraft, setExceptionDraft] = useState<Draft>(() => toDraft(row, row.value));

  const liveWarning = numericWarning(row, draft);

  const saveGeneral = () =>
    void run(async () => {
      const parsed = parseSettingValue(row, draft.raw);
      if (!parsed.ok) return { error: parsed.error };
      return saveSettingAction({ key: row.key, scopeType: 'global', scopeId: null, raw: draft.raw });
    }, 'save');

  const saveException = () =>
    void run(async () => {
      if (!exceptionAxis || !exceptionTarget) return { error: 'İstisnanın hedefini seçin.' };
      return saveSettingAction({ key: row.key, scopeType: exceptionAxis, scopeId: exceptionTarget, raw: exceptionDraft.raw });
    }, 'exception');

  const axes = row.exceptionScopes;

  return (
    <Dialog
      open
      onClose={onClose}
      title={row.label}
      subtitle={row.help}
      maxWidth={520}
      footer={
        <div className="flex w-full items-center gap-2.5">
          {/* Dönülecek bir yer yoksa düğme HİÇ çizilmez, devre dışı da değil: devre dışı bir
              "Varsayılana dön", bir varsayılanın var olduğunu ama şu an dönülemediğini söyler. */}
          {row.fallbackDisplay === null ? null : (
            <Button
              variant="secondary"
              loading={running === 'reset'}
              disabled={running !== 'reset' && (busy || !row.changed)}
              onClick={() => void run(() => resetSettingAction({ key: row.key }), 'reset')}
            >
              {running === 'reset' ? 'Dönülüyor…' : 'Varsayılana dön'}
            </Button>
          )}
          <Button variant="primary" className="ml-auto" loading={running === 'save'} disabled={busy && running !== 'save'} onClick={saveGeneral}>
            {running === 'save' ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <ValueEditor
            row={row}
            draft={draft}
            onChange={setDraft}
            label="Genel değer"
            accountOptions={accountOptions}
            invoiceTemplates={invoiceTemplates}
          />
          {/* Fabrika değeri olmayan ayarda "Varsayılan: —" yazmak, olmayan bir normal uydurmak
              olurdu; onun yerine değerin NİYE kurulum-özgü olduğu söyleniyor. */}
          <span className="font-ops-body text-ops-micro text-ops-faint">
            {row.fallbackDisplay === null ? 'Fabrika değeri yok — bu seçim kuruluma özgüdür.' : `Varsayılan: ${row.fallbackDisplay}`}
          </span>
          {liveWarning ? <span className="font-ops-body text-ops-xs text-ops-red">{liveWarning}</span> : null}
        </section>

        {axes.length > 0 ? (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-ops-body text-ops-xs font-medium text-ops-body">İstisnalar</span>
              {exceptionAxis === null ? (
                <Select
                  variant="chip"
                  value=""
                  placeholder="+ istisna ekle"
                  options={axes.map((a) => ({ value: a, label: SCOPE_AXIS_LABELS[a] }))}
                  onChange={(v) => {
                    setExceptionAxis(v as ExceptionScope);
                    setExceptionTarget('');
                    setExceptionDraft(toDraft(row, row.value));
                  }}
                />
              ) : null}
            </div>

            {row.exceptions.map((ex) => (
              <div key={ex.id} className="flex items-center gap-2.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5">
                <Badge tone="amber" outline>
                  {ex.scopeLabel}
                </Badge>
                <span className="ml-auto font-ops-mono text-ops-sm text-ops-ink">{ex.display}</span>
                <button
                  type="button"
                  aria-label={`${ex.scopeLabel} istisnasını kaldır`}
                  disabled={busy}
                  aria-busy={running === `remove:${ex.id}` || undefined}
                  onClick={() => void run(() => removeSettingExceptionAction({ id: ex.id, key: row.key }), `remove:${ex.id}`)}
                  className="cursor-pointer font-ops-display text-ops-base text-ops-faint transition-colors hover:text-ops-red disabled:cursor-progress"
                >
                  {running === `remove:${ex.id}` ? '…' : '✕'}
                </button>
              </div>
            ))}

            {exceptionAxis ? (
              <div className="flex flex-col gap-2.5 rounded-ops-card border border-ops-line bg-ops-subtle px-3 py-3">
                <Select
                  value={exceptionTarget}
                  onChange={setExceptionTarget}
                  placeholder={`${SCOPE_AXIS_LABELS[exceptionAxis]} seçin`}
                  options={scopeOptions[exceptionAxis]}
                />
                <ValueEditor
                  row={row}
                  draft={exceptionDraft}
                  onChange={setExceptionDraft}
                  label="Bu kapsamdaki değer"
                  accountOptions={accountOptions}
                  invoiceTemplates={invoiceTemplates}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setExceptionAxis(null)}>
                    Vazgeç
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="ml-auto"
                    loading={running === 'exception'}
                    disabled={busy && running !== 'exception'}
                    onClick={saveException}
                  >
                    {running === 'exception' ? 'Kaydediliyor…' : 'İstisnayı kaydet'}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {row.impact ? (
          <p className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-3 font-ops-body text-ops-xs leading-relaxed text-ops-red">{row.impact}</p>
        ) : null}

        <p className="font-ops-body text-ops-micro leading-relaxed text-ops-faint">
          Değişiklik en geç {propagationSeconds} saniye içinde tüm süreçlerde geçerli olur. Geçmişe etki etmez: verilmiş siparişlerin sabitlenmiş rakamları
          değişmez.
        </p>

        {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}
      </div>
    </Dialog>
  );
}

// ── Değer düzenleyici ───────────────────────────────────────────────────────

/** Taslak HAM tutulur (`raw`): dönüşümü ve sınırı sunucu uygular, kutu yalnız yazılanı taşır. */
interface Draft {
  raw: string | boolean | Record<string, boolean>;
  /** Sayısal kutuların kontrollü değeri — para EURO, yüzde/sayı tam sayı. */
  numeric: number | null;
}

function toDraft(row: SettingRowView, value: SettingValue): Draft {
  if (row.kind === 'boolean') return { raw: Boolean(value), numeric: null };
  if (row.kind === 'channelFlags') return { raw: { ...((value ?? {}) as Record<string, boolean>) }, numeric: null };
  const numeric = toEditableNumber(row, value);
  if (numeric !== null) return { raw: String(numeric), numeric };
  return { raw: String(value ?? ''), numeric: null };
}

/** Yazarken görünen sınır uyarısı — kaydetmeyi beklemeden. */
function numericWarning(row: SettingRowView, draft: Draft): string | null {
  if (draft.numeric === null || row.kind === 'money') {
    // Para kutusu EURO taşıyor, sınır CENT — çeviriyi tek yerde yapmak için parse'a gidilir.
    const parsed = parseSettingValue(row, draft.raw);
    return parsed.ok ? null : parsed.error;
  }
  return checkBounds(row, draft.numeric);
}

interface ValueEditorProps {
  row: SettingRowView;
  draft: Draft;
  onChange: (draft: Draft) => void;
  label: string;
  /** `account` türü için seçenekler; başka türlerde kullanılmaz. */
  accountOptions: AccountOption[];
  /** `invoiceTemplate` türü için Pennylane'deki şablonlar; başka türlerde kullanılmaz. */
  invoiceTemplates: SettingsData['invoiceTemplates'];
}

function ValueEditor({ row, draft, onChange, label, accountOptions, invoiceTemplates }: ValueEditorProps) {
  switch (row.kind) {
    case 'money':
      return (
        <MoneyField
          label={label}
          value={draft.numeric}
          onChange={(v) => onChange({ raw: v === null ? '' : String(v), numeric: v })}
        />
      );
    case 'percent':
      return (
        <PercentField
          label={label}
          value={draft.numeric}
          onChange={(v) => onChange({ raw: v === null ? '' : String(v), numeric: v })}
        />
      );
    case 'integer':
      return (
        <InputField
          label={label}
          inputMode="numeric"
          mono
          value={typeof draft.raw === 'string' ? draft.raw : ''}
          onChange={(e) => onChange({ raw: e.target.value, numeric: Number(e.target.value) || null })}
          labelAside={row.unit ? <span className="font-ops-body text-ops-micro text-ops-faint">{row.unit}</span> : undefined}
        />
      );
    case 'time':
      return (
        <InputField
          label={label}
          mono
          placeholder="16:00"
          value={typeof draft.raw === 'string' ? draft.raw : ''}
          onChange={(e) => onChange({ raw: e.target.value, numeric: null })}
        />
      );
    case 'text':
      return (
        <InputField label={label} value={typeof draft.raw === 'string' ? draft.raw : ''} onChange={(e) => onChange({ raw: e.target.value, numeric: null })} />
      );
    // Hesap seçilir, yazılmaz: serbest kutu uuid ezberletirdi. Ayar bir hesap türü bekliyorsa yalnız o türdekiler sunulur, çünkü
    // aktarımın banka yerine ödeme sağlayıcısına yazılması kendine transfer olurdu.
    case 'account': {
      const options = accountOptions.filter((option) => !row.accountType || option.type === row.accountType);
      return (
        <FieldShell label={label}>
          <Select
            value={typeof draft.raw === 'string' ? draft.raw : ''}
            onChange={(v) => onChange({ raw: v, numeric: null })}
            placeholder={options.length > 0 ? 'Hesap seçin' : 'Bu türde açık hesap yok — önce Para › Hesaplar'}
            options={options}
          />
        </FieldShell>
      );
    }
    // Seçenekli ayar hesap seçiciyle aynı kaptadır: değer listeden seçilir, yazılmaz.
    case 'choice':
      return (
        <FieldShell label={label}>
          <Select
            value={typeof draft.raw === 'string' ? draft.raw : ''}
            onChange={(v) => onChange({ raw: v, numeric: null })}
            placeholder="Seçin"
            options={(row.choices ?? []).map((c) => ({ value: c.value, label: c.label }))}
          />
        </FieldShell>
      );
    // Liste okunamazsa seçici kapanır ve sebebi yazılır; kayıtlı seçim değişmeden kalır.
    case 'invoiceTemplate': {
      const templates = invoiceTemplates?.status === 'ok' ? invoiceTemplates.templates : null;
      return (
        <FieldShell label={label} error={invoiceTemplates?.status === 'ok' ? undefined : invoiceTemplateProblem(invoiceTemplates)}>
          <Select
            value={typeof draft.raw === 'string' ? draft.raw : ''}
            onChange={(v) => onChange({ raw: v, numeric: null })}
            placeholder={row.display}
            options={[DEFAULT_TEMPLATE_OPTION, ...(templates ?? []).map((t) => ({ value: String(t.id), label: t.name }))]}
            disabled={templates === null}
          />
        </FieldShell>
      );
    }
    case 'boolean':
      return <ToggleField label={label} on={draft.raw === true} onChange={(on) => onChange({ raw: on, numeric: null })} />;
    case 'channelFlags': {
      const flags = (draft.raw ?? {}) as Record<string, boolean>;
      return (
        <div className="flex flex-col gap-1.5">
          <span className="font-ops-body text-ops-xs font-medium text-ops-body">{label}</span>
          {Object.keys(flags).map((key) => (
            <ToggleField
              key={key}
              label={channelLabel(key)}
              on={Boolean(flags[key])}
              onChange={(on) => onChange({ raw: { ...flags, [key]: on }, numeric: null })}
            />
          ))}
        </div>
      );
    }
  }
}
