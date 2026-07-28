'use client';

import { useRef } from 'react';
import { toggleEmphasis } from '@lezzet/helper';
import { RichText } from '@/components/text/rich-text';
import { Textarea } from './input';

/**
 * Vurgu düğmeli çok satırlı metin — yasal beyan metinleri (içindekiler, saklama) için.
 *
 * Operatör metni seçip **B**'ye basıyor; arka planda `**…**` işareti ekleniyor. İşaret sözdizimini
 * öğrenmek zorunda değil ama elle de yazabilir. Altındaki önizleme müşteri sayfasıyla AYNI çiziciyi
 * (RichText) kullanıyor → "ne görürsen o basılır", ayrı bir önizleme mantığı yok.
 *
 * Neden zengin metin editörü değil: veritabanında HTML tutmanın bedeli (her okumada temizleme, atlanırsa
 * XSS, AI çevirinin etiketleri bozması) bu tek ihtiyaç için ödenmez — gerekçe `@lezzet/helper/rich-text`.
 */
interface EmphasisTextareaProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  onBlur?: () => void;
  /** Düğmenin yanındaki kısa açıklama — alana göre değişir (alerjen vurgusu ↔ önemli uyarı). */
  hint?: string;
}

export function EmphasisTextarea({ value, onChange, rows = 4, placeholder, onBlur, hint }: EmphasisTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const apply = () => {
    const el = ref.current;
    if (!el) return;
    const next = toggleEmphasis(value, el.selectionStart, el.selectionEnd);
    if (next.text === value) return; // seçim boş — metne dokunulmadı
    onChange(next.text);
    // Değer React üzerinden döndükten SONRA seçimi geri koy: aksi hâlde imleç sona atlar ve operatör
    // arka arkaya birden çok kelimeyi işaretleyemez.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // odak textarea'da kalsın → seçim kaybolmasın
          onClick={apply}
          title="Seçili metni vurgula"
          className="grid h-[20px] w-[20px] cursor-pointer place-items-center rounded-ops-btn border border-ops-line-strong font-ops-display text-[11.5px] font-bold text-ops-strong transition-colors hover:border-ops-olive hover:text-ops-olive"
        >
          B
        </button>
        {hint ? <span className="font-ops-body text-[10.5px] text-ops-faint">{hint}</span> : null}
      </div>

      <Textarea textareaRef={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} onBlur={onBlur} />

      {value.trim() ? (
        <div className="rounded-ops-card border border-ops-line-soft bg-ops-subtle px-3 py-2">
          <span className="font-ops-display text-[9.5px] font-medium uppercase tracking-[0.08em] text-ops-faint">Müşteride görünüm</span>
          <RichText text={value} className="mt-1 font-ops-body text-[12px] leading-[1.6] text-ops-body" />
        </div>
      ) : null}
    </div>
  );
}
