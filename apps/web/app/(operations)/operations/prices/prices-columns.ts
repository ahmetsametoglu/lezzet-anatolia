import type { Channel, Country } from '@lezzet/types';
import { countryColumnLabel, FOREIGN_COUNTRIES, PRICE_CHANNELS } from '@/components/operation/prices/country-prices';
import type { ColumnTrack } from '@/components/operation/ui/table-columns';

/** Ülke kolonunun anahtarı; hücre üreticisi aynı anahtarla takılır. */
export const countryColumnKey = (channel: Channel, country: Country): string => `${channel}-${country}`;

/**
 * Fiyatlar tablosunun kolon şeritleri; gerçek tablo ve rota iskeleti (`loading.tsx`) aynı ölçüyü okusun diye burada. Dosya JSX ve
 * `'use client'` taşımaz ki sunucuda çizilen iskelet istemci paketi sürüklemesin.
 */
export const PRICES_COLUMN_TRACKS: ColumnTrack[] = [
  { key: 'name', header: 'Varyant', width: 'minmax(180px,1.3fr)' },
  { key: 'b2c', header: 'B2C', width: '86px', align: 'right' },
  { key: 'b2b', header: 'B2B', width: '86px', align: 'right' },
  // Ülke başlığı tek satırdır ("B2C (DE)") ve genel kolondan 6 px geniştir ki başlık sarmasın.
  ...FOREIGN_COUNTRIES.flatMap((country) =>
    PRICE_CHANNELS.map((channel): ColumnTrack => ({
      key: countryColumnKey(channel, country),
      header: countryColumnLabel(channel, country),
      width: '92px',
      align: 'right',
    })),
  ),
  { key: 'cost', header: 'Maliyet', width: '84px', align: 'right' },
  { key: 'margin', header: 'Marj', width: '72px', align: 'right' },
  { key: 'auto', header: 'auto', width: '48px', align: 'center' },
];
