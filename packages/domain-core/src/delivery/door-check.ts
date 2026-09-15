/**
 * Kapı doğrulaması sipariş anlık görüntüsünden okunur, adres kaydından değil: sevkiyatın sorusu siparişin çıktığı adrestir ve
 * sonradan yapılan düzeltme bir sonraki siparişi ilgilendirir. Görüntü adres satırının tam kopyası olduğu için ek sorgu gerekmez.
 */

import type { DoorCheck } from '@lezzet/types';

/**
 * Dört hâl `packages/types`ta tanımlı (`DoorCheckEnum`) — sözleşme onu taşıyor ve iki operasyon
 * yüzeyi (sevkiyat masası + kurye ekranı) aynı kelimeyi okuyor. Sertlik sırası: `elsewhere` en sert
 * (doğrusu elimizde), `unknown` hiç uyarı üretmez.
 */
export function doorCheckOf(snapshot: Record<string, unknown> | null): DoorCheck {
  if (!snapshot) return 'unknown';

  /* Düzeltme önerisi EN ÖNCE bakılır: dolu olması "servis daha iyisini buldu, müşteri kendininkini
     korudu" demek ve bu, kaba eşleşmeden daha keskin bir bilgidir. Veri kısıtı (`address_geo_alt`)
     zaten doğrulanmış kapıyla birlikte var olmasını engelliyor. */
  if (text(snapshot['geoAltLabel'])) return 'elsewhere';

  const precision = text(snapshot['geoPrecision']);
  if (precision === null) return 'unknown';
  return precision === 'housenumber' ? 'confirmed' : 'unverified';
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
