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
  /**
   * Sekmenin yanındaki sayaç — YALNIZ karar bekleyen iş için. Her sekmede satır sayısı yazmak rozeti
   * dekora çevirir ve gerçek uyarı görünmez olur; rozet "burada senden bir şey bekleniyor" demektir.
   * `0` ve `null` çizilmez: boş bir rozet, olmayan bir işi varmış gibi gösterir.
   */
  badge?: number | null;
  /**
   * Sekmenin KAPSAM sayısı — "bu sekmede kaç kayıt var". Rozetten (`badge`) farkı ağırlığıdır:
   * rozet "senden bir şey bekleniyor" der ve ambere boyanır, sayı yalnız büyüklüğü söyler (aktif
   * sekmede olive, ötekilerde sönük). Sipariş ekranı gibi sekmeleri bir DURUM kümesi olan ekranlar
   * bunu ister; orada her sekmenin sayısı bilgidir, uyarı değil.
   *
   * `0` ve `null` çizilmez — boş bir sayı, sekmeyi tıklamaya değer göstermez.
   */
  count?: number | null;
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
              '-mb-px cursor-pointer border-b-2 px-3.5 py-[11px] font-ops-display text-ops-sm font-semibold outline-none transition-colors',
              on ? 'border-ops-olive text-ops-ink' : 'border-transparent text-ops-muted hover:text-ops-strong',
            ].join(' ')}
          >
            <span className="flex items-center gap-1.5">
              {t.label}
              {t.count ? (
                <span
                  className={[
                    'rounded-full px-1.5 py-px font-ops-mono text-ops-micro font-medium',
                    on ? 'bg-ops-olive-bg text-ops-olive-dark' : 'bg-ops-line-soft text-ops-muted',
                  ].join(' ')}
                >
                  {t.count}
                </span>
              ) : null}
              {t.badge ? (
                <span className="rounded-full bg-ops-amber-bg px-1.5 py-px font-ops-mono text-ops-micro font-medium text-ops-amber">
                  {t.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
      {/* Sekmeler alt çizgiye kadar UZAR (border-b-2), eylem ise dikeyde ortalanır. */}
      {action ? <span className="ml-auto flex items-center gap-2 py-[7px]">{action}</span> : null}
    </div>
  );
}
