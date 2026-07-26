'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { LocalizedText } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { FieldShell } from './field-shell';
import { Input, Textarea } from './input';

/**
 * RHF çok dilli metin alanı (operasyon) — TR/FR/DE sekmeleri + tek satır/çok satır kontrol + opsiyonel
 * AI çeviri butonu. Değer `LocalizedText`. Ad ve açıklama (modal + kategori/koleksiyon dialog) aynı
 * komponenti paylaşır (no-duplication). Aktif dil UI durumu; alan değeri RHF'te. `onAiTranslate`
 * verilirse "✦ AI çeviri" butonu görünür ve dönüşü eksik dilleri doldurur (arka uç çağırana ait).
 */
interface FormLocalizedTextProps<T extends FieldValues> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<T, any, any>;
  name: FieldPath<T>;
  label: ReactNode;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  /** Yer tutucu (dil kodu eklenir). */
  placeholder?: string;
  /** Verilirse AI çeviri butonu; TR metinden FR/DE önerir ve alanı günceller. */
  onAiTranslate?: (text: LocalizedText) => Promise<LocalizedText>;
}

export function FormLocalizedText<T extends FieldValues>({ control, name, label, required, multiline, rows = 3, placeholder, onAiTranslate }: FormLocalizedTextProps<T>) {
  const [lang, setLang] = useState<Locale>('tr');
  const [aiPending, startAi] = useTransition();
  const [aiNote, setAiNote] = useState<string | null>(null);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const value: LocalizedText = field.value ?? {};
        const setLangValue = (v: string) => field.onChange({ ...value, [lang]: v });

        const aside = onAiTranslate ? (
          <button
            type="button"
            disabled={aiPending}
            onClick={() => {
              setAiNote(null);
              startAi(async () => {
                try {
                  const suggestion = await onAiTranslate(value);
                  field.onChange({ ...value, ...suggestion });
                } catch (e) {
                  setAiNote(e instanceof Error ? e.message : 'AI çeviri başarısız.');
                }
              });
            }}
            className="cursor-pointer font-ops-body text-[11px] font-semibold text-ops-olive disabled:opacity-60"
          >
            {aiPending ? '✦ çeviriliyor…' : '✦ AI çeviri'}
          </button>
        ) : undefined;

        const placeholderText = placeholder ? `${placeholder} (${lang.toUpperCase()})…` : undefined;

        return (
          <FieldShell label={label} required={required} labelAside={aside} error={fieldState.error?.message}>
            <div className="flex gap-1.5">
              {LOCALES.map((l) => {
                const on = l === lang;
                const filled = Boolean(value[l]?.trim());
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={['cursor-pointer px-2.5 py-[5px] font-ops-display text-[12px] font-semibold transition-colors', on ? 'border-b-2 border-ops-olive text-ops-ink' : 'text-ops-muted hover:text-ops-strong'].join(' ')}
                  >
                    {l.toUpperCase()} {!filled && l !== 'tr' ? <span className="text-ops-amber">öneri</span> : null}
                  </button>
                );
              })}
            </div>
            {multiline ? (
              <Textarea value={value[lang] ?? ''} onChange={(e) => setLangValue(e.target.value)} rows={rows} placeholder={placeholderText} onBlur={field.onBlur} />
            ) : (
              <Input value={value[lang] ?? ''} onChange={(e) => setLangValue(e.target.value)} placeholder={placeholderText} onBlur={field.onBlur} />
            )}
            {aiNote ? <span className="font-ops-body text-[11px] text-ops-amber">{aiNote}</span> : null}
          </FieldShell>
        );
      }}
    />
  );
}
