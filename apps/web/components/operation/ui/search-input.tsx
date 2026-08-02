import { CONTROL_H, type ControlSize } from './control';
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
  /** Yükseklik kademesi — bar `md`, dar ekran `sm`. Ölçü ortak (`CONTROL_H`), kutu kendi uydurmaz. */
  size?: ControlSize;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Ara…', size = 'md', className }: SearchInputProps) {
  return (
    <label
      className={[
        'inline-flex items-center gap-2 rounded-ops-btn border border-ops-line-strong bg-ops-white px-3 text-ops-faint focus-within:border-ops-olive',
        CONTROL_H[size],
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
        className="min-w-0 flex-1 bg-transparent font-ops-body text-ops-sm text-ops-ink outline-none placeholder:text-ops-faint"
      />
    </label>
  );
}
