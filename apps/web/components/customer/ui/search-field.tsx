'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * K4 · Arama Alanı — site başlığındaki ürün araması.
 *
 * GERÇEK bir form: gönderim kataloğa yönlendirir, sorgu URL'de yaşar (`?q=`). Uzun süre `<div>`
 * olarak durdu — arama kutusuna benziyor ama içine yazılamıyordu; oysa arka uç hazırdı (ad araması
 * üç dilde birden, SQL'de). "Görünüyor ama çalışmıyor" en pahalı hâldir: kullanıcı denemesini
 * kendinde arar.
 *
 * Sorgu neden URL'de: aranan liste PAYLAŞILABİLİR olmalı, geri tuşu çalışmalı ve ilk boya sunucudan
 * tam gelmeli. Bu yüzden state burada sadece yazarkenki metni tutar; gerçek kaynak adrestir.
 *
 * Masaüstünde sabit genişlikli hap, mobilde başlığın altında tam genişlik — aynı komponent, iki
 * yerleşim (`fullWidth`). İki yerde ayrı ayrı yazılmaz.
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
        fullWidth ? 'w-full px-4 py-2.25' : 'w-[250px] px-4.5 py-2.25',
      ].join(' ')}
    >
      <span aria-hidden>🔍</span>
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
          className="cursor-pointer text-sand-600 transition-colors hover:text-ink"
        >
          ✕
        </button>
      )}
    </form>
  );
}
