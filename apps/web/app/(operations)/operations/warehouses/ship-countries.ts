import { COUNTRY_LABELS, CountryEnum, type Country, type WarehouseAddress, type WarehouseShipCountryEntry } from '@lezzet/types';
import { locative } from '@/components/operation/ui/suffix';
import { addressForClipboard } from './warehouses-labels';
import type { ShipCountryField, WarehouseRowView } from './warehouses-types';

// Kargo ülkelerinin kuralları: künye penceresinin alanları, kapının yazdığı satırlar ve kartın cümleleri tek yerde, ki pencerenin
// gösterdiği ile kapının yazdığı ayrışmasın.

const BLANK_ADDRESS: WarehouseAddress = { line1: '', postalCode: '', city: '' };

/** Deponun kendi ülkesi önce, öteki ülkeler sabit sırada; rozet, çip ve kart aynı sırayla sayar. */
export function orderedShipCountries<T extends { country: Country }>(rows: readonly T[], home: Country): T[] {
  const rank = (country: Country) => (country === home ? -1 : CountryEnum.options.indexOf(country));
  return [...rows].sort((a, b) => rank(a.country) - rank(b.country));
}

/** Rozet ve çip metni: "Fransa, Almanya". */
export function shipCountriesLabel(row: Pick<WarehouseRowView, 'shipCountries' | 'countryCode'>): string {
  return orderedShipCountries(row.shipCountries, row.countryCode)
    .map((entry) => COUNTRY_LABELS[entry.country])
    .join(', ');
}

/** Pencerenin alanları, her ülke için bir satır; yazılmış teslim noktası alanlara dolar, yoksa alanlar boş açılır. */
export function shipCountryFields(editing: Pick<WarehouseRowView, 'shipCountries'> | null): ShipCountryField[] {
  return CountryEnum.options.map((country) => {
    const entry = editing?.shipCountries.find((row) => row.country === country);
    return { country, enabled: entry !== undefined, handover: entry?.handover ?? BLANK_ADDRESS };
  });
}

/**
 * Alanlardan gönderim ülkesi satırları. Boş teslim noktası paketin depodan verildiği demektir (`null`); yarım adres reddedilir, çünkü
 * taşıyıcı eksik adrese gelemez. Deponun kendi ülkesinde teslim noktası sorulmaz.
 */
export function shipCountryEntries(
  fields: readonly ShipCountryField[],
  home: Country,
): { entries: WarehouseShipCountryEntry[]; error: null } | { entries: null; error: string } {
  const entries: WarehouseShipCountryEntry[] = [];
  for (const field of fields.filter((row) => row.enabled)) {
    const handover = { line1: field.handover.line1.trim(), postalCode: field.handover.postalCode.trim(), city: field.handover.city.trim() };
    const filled = Object.values(handover).filter((part) => part.length > 0).length;
    if (field.country === home || filled === 0) {
      entries.push({ country: field.country, handover: null });
      continue;
    }
    if (filled < 3) {
      return { entries: null, error: `${COUNTRY_LABELS[field.country]} teslim noktasının adresi, posta kodu ve şehri birlikte girilir.` };
    }
    entries.push({ country: field.country, handover });
  }
  return { entries, error: null };
}

/** İşaretli ülkeye bugün kargo yapan başka aktif depo; kural veritabanındadır, pencere reddi kaydetmeden önce söyler. */
export function shipConflicts(
  fields: readonly ShipCountryField[],
  takenBy: readonly Pick<WarehouseRowView, 'id' | 'code' | 'name' | 'shipsTo'>[],
  editingId: string | null,
): Map<Country, Pick<WarehouseRowView, 'code' | 'name'>> {
  const conflicts = new Map<Country, Pick<WarehouseRowView, 'code' | 'name'>>();
  for (const field of fields.filter((row) => row.enabled)) {
    const holder = takenBy.find((row) => row.id !== editingId && row.shipsTo.includes(field.country));
    if (holder) conflicts.set(field.country, holder);
  }
  return conflicts;
}

const addressText = (address: WarehouseAddress): string => `${address.line1} · ${address.postalCode} ${address.city}`;

export interface ShipCountryLine {
  country: Country;
  sentence: string;
  /** Paketin taşıyıcıya verildiği yer; depo adresi girilmemişse `null`. */
  place: string | null;
  /** Teslim noktası panoya adres biçiminde gider; paket depodan veriliyorsa `null`. */
  clipboard: string | null;
}

/** Kartın satırları: her ülke, paketin taşıyıcıya verildiği yer ve tarife tek cümlede. */
export function shipCountryLines(row: Pick<WarehouseRowView, 'countryCode' | 'address' | 'shipCountries'>): ShipCountryLine[] {
  return orderedShipCountries(row.shipCountries, row.countryCode).map(({ country, handover }) => {
    const name = COUNTRY_LABELS[country];
    if (handover === null) {
      const tariff = country === row.countryCode ? ` Tarife yurt içi ${name}.` : '';
      return {
        country,
        sentence: `Paket depodan taşıyıcıya verilir.${tariff}`,
        place: row.address ? addressText(row.address) : null,
        clipboard: null,
      };
    }
    const from = row.address?.city ? `${row.address.city}${locative(row.address.city)}` : 'depoda';
    return {
      country,
      sentence: `Paket ${from} hazırlanır, ${handover.city}${locative(handover.city)}ki teslim noktasında taşıyıcıya verilir. Tarife yurt içi ${name}.`,
      place: `Teslim noktası: ${addressText(handover)}`,
      clipboard: addressForClipboard(handover, country),
    };
  });
}
