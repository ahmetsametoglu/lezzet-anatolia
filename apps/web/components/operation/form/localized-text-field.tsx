'use client';

import { useState, useTransition, type ReactNode } from 'react';
import type { LocalizedText } from '@lezzet/types';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { suggestTranslationAction, type TranslateField } from '@/lib/ai/translate';
import { EmphasisTextarea } from './emphasis-textarea';
import { FieldShell } from './field-shell';
import { Input, Textarea } from './input';
import { LocaleTabs, filledLocales } from './locale-tabs';

/**
 * Çok dilli metin alanı (operasyon) — **form kütüphanesinden bağımsız çekirdek.**
 *
 * Değer `LocalizedText`, sahibi çağırandır: RHF formu `FormLocalizedText` ile sarar, `useState` ile
 * çalışan diyalog doğrudan bunu kullanır. Ayrım şuradan doğdu: indirim diyaloğu RHF kullanmadığı
 * için çok dilli alanı ham `Input` ile kurmuştu — alan etiketsiz kaldı, **AI çeviri düğmesi hiç
 * çizilmedi** (düğme etiketin yanında yaşıyor) ve hata yolu yoktu. Aynı alanın iki ayrı görünüşü
 * olamaz; çekirdek tek, sarmalayıcı formun türüne göre değişir.
 *
 * Üç düzen: (1) `tabs` — alanın KENDİ dil sekmesi; (2) `lang` verilirse dil DIŞARIDAN gelir (kart
 * ya da dialog başlığı yönetir), iç sekmeler gizlenir; (3) `stacked` — tüm diller aynı anda ayrı
 * girdi (tek kısa alanlı dialog). Sekme görseli paylaşılan `LocaleTabs`'tadır.
 */
export interface LocalizedTextFieldProps {
  value: LocalizedText;
  onChange: (value: LocalizedText) => void;
  label: ReactNode;
  /** Başlığın sağına düşen işaret (ör. "bu kutuyu asistan doldurdu"). AI düğmesiyle yan yana durur. */
  labelAside?: ReactNode;
  required?: boolean;
  error?: string;
  onBlur?: () => void;
  multiline?: boolean;
  rows?: number;
  /**
   * Yer tutucu. Metin verilirse dil kodu EKLENİR ("Ad (FR)…") — aynı örnek her dilde göründüğü
   * için hangi dile yazıldığını söylemek gerekir. Fonksiyon verilirse sonucu olduğu gibi kullanılır:
   * çağıran örneği zaten o dilde yazmıştır, üstüne kod eklemek aynı bilgiyi iki kez söylerdi.
   */
  placeholder?: string | ((lang: Locale) => string);
  /** Girdi başına karakter tavanı — yerleşimden doğan sınırlar için (ör. tek satırlık etiket). */
  maxLength?: number;
  /** Alanın ALTINDA duran açıklama: metin nereye çıkacak, boş bırakılırsa ne olur. */
  hint?: ReactNode;
  /**
   * Çeviri için alanın TÜRÜ — ton ve uzunluk buradan çıkar (ürün adı ile saklama talimatı aynı
   * ölçüde çevrilmez). Varsayılan `aciklama`, motorun kendi varsayılanıyla aynı.
   *
   * **Düğme prop ile AÇILMAZ, kendiliğinden çıkar** (kullanıcı kararı 12.08). Önceden her çağıran
   * `onAiTranslate={(t) => suggestTranslationAction(t, 'ad')}` yazıyordu: aynı satır YİRMİ yerde
   * tekrar ediyor, iki form gövdesi (`product-form` · `bundle-form`) bunu prop zinciriyle iç
   * alanlara dağıtıyordu ve **yazmayı unutulan alanda düğme sessizce yok oluyordu** — tarifin
   * süre/porsiyon/öğün kutuları böyle çevirisiz kalmıştı, "3–4 kişilik" Fransız müşteriye Türkçe
   * gidiyordu. Çeviri, çok dilli bir alanın kendi yeteneğidir; çağıranın hatırlaması gereken bir
   * şey değil.
   */
  field?: TranslateField;
  /** Kontrollü dil (form geneli): verilirse iç sekmeler GİZLENİR, dil dışarıdan gelir. */
  lang?: Locale;
  /** Düzen: 'tabs' (varsayılan) | 'stacked' (tüm diller ayrı girdi). `lang` verilince yok sayılır. */
  layout?: 'tabs' | 'stacked';
  /**
   * Metin içi VURGU (yasal beyan alanları): "B" düğmesi + müşteri görünümü önizlemesi. `multiline`
   * gerektirir. Değer yine DÜZ METİN kalır — yalnız `**…**` işareti taşır (gerekçe: rich-text).
   */
  emphasis?: boolean;
  /** Vurgu düğmesinin yanındaki kısa açıklama (alana özgü). */
  emphasisHint?: string;
  /**
   * Alan KİLİTLİ — girdiler ve AI çeviri düğmesi kapanır, dil sekmeleri okunur kalır.
   *
   * Kaydetme sürerken ve karar verilmiş bir öneride gerekiyor (asistan kuyruğu, 22.14): düzenlenebilir
   * görünen ama yazılmayacak bir kutu, hâlâ seçenekmiş gibi okunur. Sekmeleri kilitlemiyoruz — kilitli
   * bir alanda bile hangi dilin dolu olduğuna bakılabilmeli.
   */
  disabled?: boolean;
}

export function LocalizedTextField({
  value,
  onChange,
  label,
  labelAside,
  required,
  error,
  onBlur,
  multiline,
  rows = 3,
  placeholder,
  maxLength,
  hint,
  field = 'aciklama',
  lang: langProp,
  layout = 'tabs',
  emphasis,
  emphasisHint,
  disabled = false,
}: LocalizedTextFieldProps) {
  const [langState, setLangState] = useState<Locale>('tr');
  const [aiPending, startAi] = useTransition();
  const [aiNote, setAiNote] = useState<string | null>(null);
  const controlled = langProp !== undefined;
  const lang = langProp ?? langState;
  // Tüm diller aynı anda: yalnız kontrollü olmayan (form-geneli dil bağlamı olmayan) alanlarda.
  const stacked = layout === 'stacked' && !controlled;

  const setLangValue = (v: string) => onChange({ ...value, [lang]: v });

  // AI çeviri TR kaynaktan üretir. `apply` sonucu mevcut değere nasıl işleyeceğini belirler
  // (kontrollü modda tüm hedefler; stacked'te yalnız o dil). Buton yalnız hedef dillerde.
  const runAi = (apply: (s: LocalizedText) => LocalizedText) => {
    setAiNote(null);
    startAi(async () => {
      try {
        const suggestion = await suggestTranslationAction(value, field);
        onChange(apply(suggestion));
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
      disabled={aiPending || !trSource || disabled}
      onClick={onClick}
      title={aiTitle}
      className="cursor-pointer whitespace-nowrap font-ops-body text-ops-xs font-semibold text-ops-olive disabled:cursor-not-allowed disabled:opacity-60"
    >
      {aiPending ? '✦ çeviriliyor…' : '✦ AI çeviri'}
    </button>
  );

  // Alan başlığı sağı: yalnız hedef dilde AI butonu (TR kaynak olduğundan onda yok). Stacked'te
  // her dil kendi başlığını taşır → burada boş.
  // Başlığın sağı: AI düğmesi + çağıranın işareti (ör. "asistan doldurdu" rozeti). İkisi BİRLİKTE
  // durabilmeli — biri ötekini ezerse ya çeviri düğmesi kaybolur ya alanın kim tarafından
  // doldurulduğu görünmez.
  const aiAside: ReactNode = stacked || lang === 'tr' ? undefined : aiButton(() => runAi((s) => ({ ...value, ...s })));
  const aside: ReactNode =
    labelAside && aiAside ? (
      <span className="flex items-center gap-2">
        {labelAside}
        {aiAside}
      </span>
    ) : (labelAside ?? aiAside);

  const placeholderFor = (l: Locale): string | undefined => {
    if (!placeholder) return undefined;
    return typeof placeholder === 'function' ? placeholder(l) : `${placeholder} (${l.toUpperCase()})…`;
  };
  const placeholderText = placeholderFor(lang);

  return (
    <FieldShell label={label} required={required} labelAside={aside} error={error}>
      {stacked ? (
        // Tüm diller aynı anda; her dil KENDİ FieldShell'inde (aynı iskelet — kopya yok): dil kodu
        // solda, FR/DE'de sağa yaslı "✦ AI çeviri" butonu (o dili TR'den doldurur; TR'de yok).
        <div className="flex flex-col gap-2.5">
          {LOCALES.map((l) => {
            const ph = placeholderFor(l);
            const onChangeLocale = (v: string) => onChange({ ...value, [l]: v });
            const isSource = l === 'tr';
            return (
              <FieldShell
                key={l}
                label={<span className={`font-ops-display text-ops-xs font-semibold ${isSource ? 'text-ops-ink' : 'text-ops-muted'}`}>{l.toUpperCase()}</span>}
                labelAside={isSource ? undefined : aiButton(() => runAi((s) => ({ ...value, [l]: s[l] ?? value[l] })))}
              >
                {multiline ? (
                  <Textarea value={value[l] ?? ''} onChange={(e) => onChangeLocale(e.target.value)} rows={rows} placeholder={ph} onBlur={onBlur} maxLength={maxLength} disabled={disabled} />
                ) : (
                  <Input value={value[l] ?? ''} onChange={(e) => onChangeLocale(e.target.value)} placeholder={ph} onBlur={onBlur} maxLength={maxLength} disabled={disabled} />
                )}
              </FieldShell>
            );
          })}
        </div>
      ) : (
        <>
          {controlled ? null : <LocaleTabs value={lang} onChange={setLangState} filled={filledLocales(value)} />}
          {multiline && emphasis ? (
            <EmphasisTextarea value={value[lang] ?? ''} onChange={setLangValue} rows={rows} placeholder={placeholderText} onBlur={onBlur} hint={emphasisHint} disabled={disabled} />
          ) : multiline ? (
            <Textarea value={value[lang] ?? ''} onChange={(e) => setLangValue(e.target.value)} rows={rows} placeholder={placeholderText} onBlur={onBlur} maxLength={maxLength} disabled={disabled} />
          ) : (
            <Input value={value[lang] ?? ''} onChange={(e) => setLangValue(e.target.value)} placeholder={placeholderText} onBlur={onBlur} maxLength={maxLength} disabled={disabled} />
          )}
        </>
      )}
      {hint ? <span className="font-ops-body text-ops-micro leading-[1.6] text-ops-faint">{hint}</span> : null}
      {aiNote ? <span className="font-ops-body text-ops-xs text-ops-amber">{aiNote}</span> : null}
    </FieldShell>
  );
}
