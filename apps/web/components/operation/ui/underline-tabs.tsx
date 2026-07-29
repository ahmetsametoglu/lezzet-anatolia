'use client';

import type { ReactNode } from 'react';

/**
 * Alt-çizgi sekmeleri — hafif, çerçevesiz geçiş: aktif sekme olive şerit + koyu metin, diğerleri sönük.
 * Dil sekmeleri (TR/FR/DE) ve diyalog içi bölüm sekmeleri (Ürün ↔ Beyan) AYNI görseli paylaşır; desen
 * tek yerde durur (no-duplication). Raylı `MultiToggle`'dan farkı ağırlık: bu bir GEÇİŞ, seçenek değil —
 * ray "bir değer seçtim" der, sekme "başka bir bölüme baktım" der.
 *
 * Salt sunum: seçili durum çağıranda. Sayfa üstü sekme barı (`Tabs`) kendi kabını taşıdığı için ayrı.
 */
interface UnderlineTabItem<K extends string> {
  key: K;
  label: ReactNode;
  title?: string;
}

interface UnderlineTabsProps<K extends string> {
  items: UnderlineTabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

export function UnderlineTabs<K extends string>({ items, value, onChange, className }: UnderlineTabsProps<K>) {
  return (
    <div className={['flex gap-1.5', className].filter(Boolean).join(' ')}>
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            title={t.title}
            aria-current={on ? 'true' : undefined}
            className={[
              'cursor-pointer px-2.5 py-[5px] font-ops-display text-ops-sm font-semibold outline-none transition-colors',
              on ? 'border-b-2 border-ops-olive text-ops-ink' : 'text-ops-muted hover:text-ops-strong',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
