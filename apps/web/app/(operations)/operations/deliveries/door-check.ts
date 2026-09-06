/**
 * **Durağın kapısı doğrulandı mı** (11.11) — sipariş anlık görüntüsünden okunan SAF karar.
 *
 * Ek sorgu YOK: `addressSnapshot` adres satırının tamamının kopyası (`checkout-draft`:
 * `addressSnapshot: { ...address }`), yani koordinat künyesi ve düzeltme önerisi zaten içinde.
 *
 * ── NEDEN SİPARİŞTEN, ADRES KAYDINDAN DEĞİL ────────────────────────────────
 * Snapshot **sipariş anındaki** gerçeği taşır ve sevkiyatçının sorusu tam olarak o: *"bu sipariş
 * hangi adrese çıkıyor."* Adres kaydı sonradan düzeltilmiş olabilir — düzeltme bir sonraki siparişi
 * ilgilendirir, araca bugün yüklenen kutuyu değil.
 */

/** Sevkiyat masasının okuduğu dört hâl — sertlik sırasına göre. */
export type DoorCheck =
  /** Kapı servis tarafından doğrulandı. */
  | 'confirmed'
  /**
   * Kapı BAŞKA posta kodunda bulundu ve müşteri kendi yazdığını korudu. En sert hâl: kurye var
   * olmayan bir kapıya gidiyor ve bunu ancak orada anlayacak.
   */
  | 'elsewhere'
  /** Kapı doğrulanamadı (sokak/semt düzeyi) — yeni yapı olabilir, kesin bir hüküm değil. */
  | 'unverified'
  /**
   * Hiç sorulmadı. Eski sipariş, ya da servis o an düşüktü, ya da ülkenin sağlayıcısı yok (bugün
   * Almanya). **Uyarı ÜRETMEZ:** ölçülemeyen değer sıfır değildir — "doğrulanmadı" demek burada
   * müşteriyi hakkında hiçbir şey bilmediğimiz bir şeyle suçlamak olurdu.
   */
  | 'unknown';

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
