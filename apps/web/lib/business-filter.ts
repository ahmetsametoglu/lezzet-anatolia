import type { Business } from '@lezzet/types';
import { oneOf } from '@/lib/url-params';

/** Ekran süzgecindeki iş; `all` iki işi birlikte okur. */
export type BusinessFilter = Business | 'all';

/** Seçenek sırası Lezzet önce; enum sırası (`qualite`, `lezzet`) bir veri kararıdır, ekranı bağlamaz. */
export const BUSINESS_FILTERS = ['all', 'lezzet', 'qualite'] as const satisfies readonly BusinessFilter[];

/** Adresteki `business` parametresi; tanınmayan değer `all`a düşer, bozuk bağlantı ekranı kırmaz. */
export function parseBusinessFilter(raw: string | string[] | undefined): BusinessFilter {
  return oneOf(raw, BUSINESS_FILTERS, 'all');
}
