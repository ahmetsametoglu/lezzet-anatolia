import type { ReactNode } from 'react';

/**
 * Operasyon sekme barı — Komponent Envanteri O2. Bir ekranın alt görünümleri arasında geçiş
 * (Ürünler → Kategoriler → Koleksiyonlar → Paketler; Para/Raporlar da kullanır). Alt çizgi göstergesi:
 * aktif sekme olive şerit + koyu metin. Salt sunum — seçili durum ve seçim çağırana ait.
 *
 * `action` sağa yaslı eylem alanı: sekmeye BAĞLI kontroller (arama + "+ Kategori") buraya konur.
 * Sayfa başlığında dururlarken sekme değişince sessizce anlam değiştiriyorlardı — arama her sekmede
 * ÜRÜNDE arıyordu, düğme de neyi yarattığını belirleyen sekmeden uzaktaydı. Burada neden ile sonuç
 * yan yana durur. Birden çok kontrol verilebilir (aralarını bar açar).
 */
interface TabItem<K extends string> {
  key: K;
  label: string;
}

interface TabsProps<K extends string> {
  items: TabItem<K>[];
  active: K;
  onSelect: (key: K) => void;
  /** Sağa yaslı eylem — sekmeye göre değişir. Yoksa bar yalnız sekmeleri taşır. */
  action?: ReactNode;
  className?: string;
}

export function Tabs<K extends string>({ items, active, onSelect, action, className }: TabsProps<K>) {
  return (
    <div className={['flex gap-0.5 border-b border-ops-line bg-ops-subtle px-6', className].filter(Boolean).join(' ')}>
      {items.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(t.key)}
            aria-current={on ? 'page' : undefined}
            className={[
              '-mb-px cursor-pointer border-b-2 px-3.5 py-[11px] font-ops-display text-ops-sm font-semibold transition-colors',
              on ? 'border-ops-olive text-ops-ink' : 'border-transparent text-ops-muted hover:text-ops-strong',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
      {/* Sekmeler alt çizgiye kadar UZAR (border-b-2), eylem ise dikeyde ortalanır. */}
      {action ? <span className="ml-auto flex items-center gap-2 py-[7px]">{action}</span> : null}
    </div>
  );
}
