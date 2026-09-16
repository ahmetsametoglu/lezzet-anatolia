'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { iconHitClass } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';

/**
 * Arama alanı — site başlığındaki ürün araması; gerçek bir form, gönderim kataloğa yönlendirir.
 *
 * **Sorgu URL'de yaşar** (`?q=`) çünkü aranan liste paylaşılabilir olmalı, geri tuşu çalışmalı ve
 * ilk boya sunucudan tam gelmeli; buradaki state yalnız yazarkenki metni tutar, gerçek kaynak adres.
 *
 * Masaüstünde sabit genişlikli hap, mobilde tam genişlik — tek komponent, iki yerleşim (`fullWidth`).
 */
interface SearchFieldProps {
  placeholder: string;
  /** Temizle düğmesinin erişilebilir adı — komponent metin taşımaz, çerçeveden gelir. */
  clearLabel: string;
  fullWidth?: boolean;
  /** Adresteki güncel sorgu — kutu ne arandığını göstersin (katalogda dolu gelir). */
  defaultValue?: string;
}

export function SearchField({ placeholder, clearLabel, fullWidth = false, defaultValue = '' }: SearchFieldProps) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  const search = (next: string) => {
    const q = next.trim();
    // Boş arama süzgeci KALDIRIR (tüm katalog) — boş `q` ile adres kirletilmez.
    router.push({ pathname: '/catalog', query: q ? { q } : {} });
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        search(value);
      }}
      className={[
        'flex items-center gap-2 rounded-pill border border-sand-300 bg-card font-sans text-body-sm transition-colors focus-within:border-olive hover:border-olive-line',
        // 288 = tasarımın 250px İÇERİK genişliği + 36 ped + 2 çerçeve. Tasarım `content-box`,
        // Tailwind `border-box` — 250'yi olduğu gibi yazmak alanı 38 px dar bırakıyordu.
        fullWidth ? 'w-full px-4 py-2.25' : 'w-[288px] px-4.5 py-2.25',
      ].join(' ')}
    >
      <Icon name="search" size={16} strokeWidth={2.1} className="text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        // Tarayıcının kendi temizle düğmesi kapatıldı: hap içinde hizası bozuk duruyor ve
        // temizlemenin ARAMAYI da sıfırlaması gerekiyor (yalnız kutuyu boşaltmak yetmez).
        className="w-full bg-transparent text-ink outline-none placeholder:text-sand-600 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => {
            setValue('');
            search('');
          }}
          className={`${iconHitClass} -my-2 text-sand-600 hover:text-ink`}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </form>
  );
}
