import { SearchIcon } from './icons';

/**
 * Operasyon arama kutusu — Komponent Envanteri O3 (filtre & arama). İŞLEVSEL: yazıldıkça listeyi
 * süzer (salt görsel değil). Kompakt (başlık barı) ve tam-genişlik (mobil) kullanımı `className` ile.
 * Süzme mantığı çağırana ait — bu bileşen yalnız kontrollü metin girdisi + büyüteç sunar.
 */
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Ara…', className }: SearchInputProps) {
  return (
    <label
      className={[
        'inline-flex items-center gap-2 rounded-ops-btn border border-ops-line-strong bg-ops-white px-3 py-2 text-ops-faint focus-within:border-ops-olive',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <SearchIcon size={14} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent font-ops-body text-[12.5px] text-ops-ink outline-none placeholder:text-ops-faint"
      />
    </label>
  );
}
