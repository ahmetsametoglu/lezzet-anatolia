'use client';

import { useCallback, useState } from 'react';
import type { PostalCodeSuggestion } from '@lezzet/database';
import { COUNTRY_LABELS } from '@/components/operation/ui/labels';
import { MultiSelect } from '@/components/operation/form/multi-select';
import { searchPostalCodesAction } from './routes-actions';
import type { PostalCodePick } from './routes-types';
import type { Country } from '@lezzet/types';

/**
 * **Posta kodu seçicisi** — rotanın kod EKLEME yolu (19.20).
 *
 * Haritadan ekleme henüz açık değil ("boşta" kodları çizecek okuma bekliyor), o yüzden bu seçici
 * ekranın tek ekleme kapısı ve **kaldırılamaz**: kaldırılsaydı rota kurulumu kod eklenemez hâle
 * gelirdi — bir gerileme. Harita ekleme kapısı geldiğinde bu seçici ikinci yol olarak kalır (uzak bir
 * kodu aramak, haritayı oraya sürüklemekten hızlıdır).
 *
 * **Serbest metin YOK:** kodlar referans tablosundan (`postal_code_place`) seçilir. Yazım hatası
 * sınıfı böyle kapanır — haritada, yani veride olmayan bir kod sisteme hiç giremez.
 */
export function PostalCodePicker({
  codes,
  onChange,
  homeCountry,
}: {
  codes: PostalCodePick[];
  onChange: (next: PostalCodePick[]) => void;
  homeCountry: Country;
}) {
  const [results, setResults] = useState<PostalCodeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const onSearch = useCallback((term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    void searchPostalCodesAction(term)
      .then(({ data }) => setResults(data ?? []))
      .finally(() => setLoading(false));
  }, []);

  const selectedValues = codes.map(keyOf);
  const options = [
    // Seçilenler önce ve her zaman: `MultiSelect` çipin etiketini seçenek listesinden okuyor.
    ...codes.map((c) => ({ value: keyOf(c), label: labelOf(c, [], homeCountry) })),
    ...results
      .filter((r) => !selectedValues.includes(keyOf(r)))
      .map((r) => ({ value: keyOf(r), label: labelOf(r, r.places, homeCountry) })),
  ];

  return (
    <MultiSelect
      options={options}
      selected={selectedValues}
      onChange={(next) => onChange(next.map(parseKey))}
      onSearch={onSearch}
      loading={loading}
      addLabel="+ posta kodu"
      searchPlaceholder="Kodun ilk hanelerini yazın (67…)"
      emptyText="Bu önekle kod yok — referans tablosunda olmayan kod eklenemez."
    />
  );
}

/** `(ülke, kod)` ikilisinin dize anahtarı; seçim listesi tek bir dize taşıyabiliyor. */
function keyOf(c: { country: PostalCodePick['country']; postalCode: string }): string {
  return `${c.country}:${c.postalCode}`;
}

function parseKey(key: string): PostalCodePick {
  const [country, postalCode] = key.split(':');
  return { country: country as PostalCodePick['country'], postalCode: postalCode ?? '' };
}

/**
 * Seçenek etiketi. Yer adları HAM geliyor (servis bilerek etiket kurmuyor); kısaltma kararı burada:
 * ilk iki yerleşim yazılır, kalanı sayılır. Çok yerleşimli kodda tek ad yazmak yanlış olurdu —
 * `67800` "Strasbourg" değil, Bischheim/Hœnheim'dır.
 */
function labelOf(
  c: { country: PostalCodePick['country']; postalCode: string },
  places: readonly string[],
  homeCountry: PostalCodePick['country'],
): string {
  const where = places.length === 0 ? '' : places.length <= 2 ? places.join(', ') : `${places.slice(0, 2).join(', ')} +${places.length - 2}`;
  // Ülke eki yalnız deponun kendi ülkesinden farklıysa: aynı ülkede her satıra "FR" yazmak gürültü.
  const country = c.country === homeCountry ? '' : ` · ${COUNTRY_LABELS[c.country]}`;
  return where ? `${c.postalCode} · ${where}${country}` : `${c.postalCode}${country}`;
}
