'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { InputField } from '@/components/operation/form/input';
import { MoneyField, PercentField } from '@/components/operation/form/money-input';
import { Select } from '@/components/operation/form/select';
import { ToggleField } from '@/components/operation/form/toggle';
import { removeSettingExceptionAction, resetSettingAction, saveSettingAction } from './actions';
import { channelLabel, checkBounds, parseSettingValue, SCOPE_AXIS_LABELS, toEditableNumber } from './settings-labels';
import type { ExceptionScope, ScopeOptions, SettingRowView } from './settings-types';
import type { SettingValue } from './settings-catalog';

/**
 * Ayar düzenleme penceresi (09.16).
 *
 * ── ÜÇ BÖLÜM, ÜÇ AYRI SORU ──────────────────────────────────────────────────
 * 1. **Genel değer** — "normalde ne olsun". Altında fabrika değeri yazılı.
 * 2. **İstisnalar** — "nerede farklı olsun". Yalnız sözlüğün izin verdiği eksenler sunulur; izin
 *    vermeyen ayarda bölüm hiç çizilmez (boş bir "istisna ekle" düğmesi, olmayan bir yeteneği
 *    varmış gibi gösterir).
 * 3. **Etki** — geniş etkili ayarlarda uyarı. Bilinçli onay tasarımın isteği (`§3`); uyarı
 *    kaydetmeyi engellemez, kararı görünür kılar.
 *
 * ── SINIR İKİ KEZ DENETLENİR VE BU KOPYA DEĞİL ──────────────────────────────
 * Kutunun altındaki uyarı `checkBounds`'tan gelir, kaydetmedeki ret de aynı fonksiyondan (server
 * action `parseSettingValue` üzerinden çağırıyor). Tek kural, iki gösterim anı: biri yazarken
 * uyarır, öteki yürürlüğü sağlar.
 */

interface SettingDialogProps {
  row: SettingRowView;
  scopeOptions: ScopeOptions;
  propagationSeconds: number;
  onClose: () => void;
  onSaved: () => void;
}

export function SettingDialog({ row, scopeOptions, propagationSeconds, onClose, onSaved }: SettingDialogProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(row, row.value));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /** Açık istisna formu: eksen seçilince açılır. */
  const [exceptionAxis, setExceptionAxis] = useState<ExceptionScope | null>(null);
  const [exceptionTarget, setExceptionTarget] = useState('');
  const [exceptionDraft, setExceptionDraft] = useState<Draft>(() => toDraft(row, row.value));

  const liveWarning = numericWarning(row, draft);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else onSaved();
    });
  };

  const saveGeneral = () =>
    run(async () => {
      const parsed = parseSettingValue(row, draft.raw);
      if (!parsed.ok) return { error: parsed.error };
      return saveSettingAction({ key: row.key, scopeType: 'global', scopeId: null, raw: draft.raw });
    });

  const saveException = () =>
    run(async () => {
      if (!exceptionAxis || !exceptionTarget) return { error: 'İstisnanın hedefini seçin.' };
      return saveSettingAction({ key: row.key, scopeType: exceptionAxis, scopeId: exceptionTarget, raw: exceptionDraft.raw });
    });

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
          <Button variant="secondary" disabled={pending || !row.changed} onClick={() => run(() => resetSettingAction({ key: row.key }))}>
            Varsayılana dön
          </Button>
          <Button variant="primary" className="ml-auto" disabled={pending} onClick={saveGeneral}>
            {pending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <ValueEditor row={row} draft={draft} onChange={setDraft} label="Genel değer" />
          <span className="font-ops-body text-ops-micro text-ops-faint">Varsayılan: {row.fallbackDisplay}</span>
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
                  disabled={pending}
                  onClick={() => run(() => removeSettingExceptionAction({ id: ex.id, key: row.key }))}
                  className="cursor-pointer font-ops-display text-ops-base text-ops-faint transition-colors hover:text-ops-red"
                >
                  ✕
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
                <ValueEditor row={row} draft={exceptionDraft} onChange={setExceptionDraft} label="Bu kapsamdaki değer" />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => setExceptionAxis(null)}>
                    Vazgeç
                  </Button>
                  <Button size="sm" variant="primary" className="ml-auto" disabled={pending} onClick={saveException}>
                    İstisnayı kaydet
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
}

function ValueEditor({ row, draft, onChange, label }: ValueEditorProps) {
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
