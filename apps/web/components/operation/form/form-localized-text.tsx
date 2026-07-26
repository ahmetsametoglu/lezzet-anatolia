'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { LocalizedText } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { FieldShell } from './field-shell';
import { Input, Textarea } from './input';
import { LocaleTabs, filledLocales } from './locale-tabs';

/**
 * RHF çok dilli metin alanı (operasyon) — tek satır/çok satır + opsiyonel "✦ AI çeviri". Değer
 * `LocalizedText`. Üç düzen: (1) 'tabs' — alanın KENDİ dil sekmesi (uncontrolled); (2) `lang` verilirse
 * form GENELİNDEN kontrollü, iç sekmeler gizlenir, dialog header'ı yönetir → tüm alanlar tek dil
 * bağlamı (çok alanlı ürün formu); (3) 'stacked' — tüm diller aynı anda ayrı input (tek kısa alanlı
 * dialog, ör. kategori/koleksiyon adı; hepsi görünür, tıklama yok). no-duplication: sekme görseli
 * LocaleTabs'ta tek kaynak.
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
  /** Kontrollü dil (form geneli): verilirse iç sekmeler GİZLENİR, dil dışarıdan gelir. */
  lang?: Locale;
  /** Düzen: 'tabs' (varsayılan, dil sekmesi) | 'stacked' (tüm diller ayrı input). `lang` verilince yok sayılır. */
  layout?: 'tabs' | 'stacked';
}

export function FormLocalizedText<T extends FieldValues>({ control, name, label, required, multiline, rows = 3, placeholder, onAiTranslate, lang: langProp, layout = 'tabs' }: FormLocalizedTextProps<T>) {
  const [langState, setLangState] = useState<Locale>('tr');
  const [aiPending, startAi] = useTransition();
  const [aiNote, setAiNote] = useState<string | null>(null);
  const controlled = langProp !== undefined;
  const lang = langProp ?? langState;
  // Tüm diller aynı anda: yalnız kontrollü olmayan (form-geneli dil bağlamı olmayan) alanlarda.
  const stacked = layout === 'stacked' && !controlled;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const value: LocalizedText = field.value ?? {};
        const setLangValue = (v: string) => field.onChange({ ...value, [lang]: v });

        // AI çeviri TR kaynaktan üretir. `apply` sonucu mevcut değere nasıl işleyeceğini belirler
        // (kontrollü modda tüm hedefler; stacked'te yalnız o dil). Buton yalnız hedef dillerde.
        const runAi = (apply: (s: LocalizedText) => LocalizedText) => {
          if (!onAiTranslate) return;
          setAiNote(null);
          startAi(async () => {
            try {
              const suggestion = await onAiTranslate(value);
              field.onChange(apply(suggestion));
            } catch (e) {
              setAiNote(e instanceof Error ? e.message : 'AI çeviri başarısız.');
            }
          });
        };
        // Çevirinin TR'den geldiği ETİKETLE değil butonun ipucuyla anlatılır: ipucu kaynak metni gösterir.
        // TR boşsa çevirecek bir şey yok → buton kilitli, ipucu ne yapılacağını söyler.
        const trSource = value.tr?.trim() ?? '';
        const aiTitle = trSource
          ? `Türkçeden çevir: “${trSource.length > 80 ? `${trSource.slice(0, 80)}…` : trSource}”`
          : 'Çeviri için önce TR metnini girin';
        const aiButton = (onClick: () => void) => (
          <button
            type="button"
            disabled={aiPending || !trSource}
            onClick={onClick}
            title={aiTitle}
            className="cursor-pointer whitespace-nowrap font-ops-body text-[11px] font-semibold text-ops-olive disabled:cursor-not-allowed disabled:opacity-60"
          >
            {aiPending ? '✦ çeviriliyor…' : '✦ AI çeviri'}
          </button>
        );

        // Alan başlığı sağı: yalnız hedef dilde AI butonu (TR kaynak olduğundan onda yok). Stacked'te
        // her dil kendi başlığını taşır → burada boş.
        const aside: ReactNode = stacked || lang === 'tr' || !onAiTranslate ? undefined : aiButton(() => runAi((s) => ({ ...value, ...s })));

        const placeholderText = placeholder ? `${placeholder} (${lang.toUpperCase()})…` : undefined;

        return (
          <FieldShell label={label} required={required} labelAside={aside} error={fieldState.error?.message}>
            {stacked ? (
              // Tüm diller aynı anda; her dil KENDİ FieldShell'inde (aynı iskelet — kopya yok): dil kodu
              // solda, FR/DE'de sağa yaslı "✦ AI çeviri" butonu (o dili TR'den doldurur; TR'de yok).
              // Ürün formundaki label-sağı buton yerleşiminin aynısı.
              <div className="flex flex-col gap-2.5">
                {LOCALES.map((l) => {
                  const ph = placeholder ? `${placeholder} (${l.toUpperCase()})…` : undefined;
                  const onChangeLocale = (v: string) => field.onChange({ ...value, [l]: v });
                  const isSource = l === 'tr';
                  return (
                    <FieldShell
                      key={l}
                      label={<span className={`font-ops-display text-[11px] font-semibold ${isSource ? 'text-ops-ink' : 'text-ops-muted'}`}>{l.toUpperCase()}</span>}
                      labelAside={isSource || !onAiTranslate ? undefined : aiButton(() => runAi((s) => ({ ...value, [l]: s[l] ?? value[l] })))}
                    >
                      {multiline ? (
                        <Textarea value={value[l] ?? ''} onChange={(e) => onChangeLocale(e.target.value)} rows={rows} placeholder={ph} onBlur={field.onBlur} />
                      ) : (
                        <Input value={value[l] ?? ''} onChange={(e) => onChangeLocale(e.target.value)} placeholder={ph} onBlur={field.onBlur} />
                      )}
                    </FieldShell>
                  );
                })}
              </div>
            ) : (
              <>
                {controlled ? null : <LocaleTabs value={lang} onChange={setLangState} filled={filledLocales(value)} />}
                {multiline ? (
                  <Textarea value={value[lang] ?? ''} onChange={(e) => setLangValue(e.target.value)} rows={rows} placeholder={placeholderText} onBlur={field.onBlur} />
                ) : (
                  <Input value={value[lang] ?? ''} onChange={(e) => setLangValue(e.target.value)} placeholder={placeholderText} onBlur={field.onBlur} />
                )}
              </>
            )}
            {aiNote ? <span className="font-ops-body text-[11px] text-ops-amber">{aiNote}</span> : null}
          </FieldShell>
        );
      }}
    />
  );
}
