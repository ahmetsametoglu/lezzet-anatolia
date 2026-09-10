import type { StockStatus } from '@lezzet/types';
import type { ChatPlace } from '../cart/chat-place';
import { deliversHere } from '../catalog/map';
import type { PlaceWarehouses, StorefrontProduct } from '../catalog/storefront-types';

/*
  ÜRÜN BU YERE GİDER Mİ (10.09 · kullanıcı sorusu) — ajanın ürün araçlarının (`urun_ara`, `urun_karti`,
  `urun_karuseli`; `support-tools.ts`) yere göre ayıklaması. Saf: DB'siz, birim testli.

  ── NEDEN ─────────────────────────────────────────────────────────────────────
  Arama her ürünün yanına "bu adrese gider mi" cümlesini yazıyordu ama listeyi ona göre KURMUYORDU.
  Kategori sorusunda ilk 20 ürün geliyordu; kargo bölgesindeki müşteride bunların bir kısmı soğuk
  zincir ürünüydü ve kargoyla gidebilenler kesilen kısımda kalabiliyordu. Kart ve karusel de
  gidemeyen ürünü gösteriyordu: müşteri düğmeye basınca ajan "gönderilemez" diyordu.

  ── KURAL ─────────────────────────────────────────────────────────────────────
  Yer BİLİNİYORSA listede ve kartta yalnız o yere giden ürün (ve boy) durur; gidemeyenler adı ve
  sebebiyle AYRI söylenir — "yok" demek yanlış olurdu, ürün var ama o adrese gitmiyor. Koda hiç hizmet
  yoksa hiçbir şey gitmez. Yer BİLİNMİYORSA (kod yok, yazım hatası, iki ülkeli kod) ayıklama yapılmaz:
  stok depo-üstü okunur, "bu adrese" cümlesi kurulmaz; sepete yazmak zaten posta kodu ister.
*/

/**
 * Stok hâlinin modele söylenen karşılığı — yer BİLİNİRKEN, dört hâl dört ayrı cümle (19.10).
 *
 * `Record` kilit: enum büyüdüğünde derleme durur. Cümleler bilerek KOŞULLU değil AÇIK — "elsewhere"
 * için "yok" demek yanlış olurdu (mal var, ama müşterinin deposunda değil) ve model o farkı ancak
 * kendisine söylenirse bilir.
 */
const STOK_SOZLUGU: Record<StockStatus, string> = {
  available: 'stokta — bu adrese teslim edilebilir',
  shipping: 'stokta — bu adrese kargoyla gider',
  elsewhere: 'başka depoda var; bu adrese bugün verilemiyor',
  out_of_stock: 'tükendi',
};

/**
 * Yer BİLİNMEDEN okunan stok — depo-üstü, yalnız "hiç var mı" (10.09). "Bu adrese" denemez: hangi adres
 * olduğu belli değil, ve eski cümle ("bu adrese teslim edilebilir") hizmet vermediğimiz bir koda bile
 * söyleniyordu. Bu hâlde yalnız iki cevap doğar (yerel havuz ağ toplamıdır); `Record` yine dördünü
 * ister ki enum büyüyünce derleme dursun.
 */
const STOK_YERSIZ: Record<StockStatus, string> = {
  available: 'stokta',
  shipping: 'stokta',
  elsewhere: 'stokta',
  out_of_stock: 'tükendi',
};

/** Ürünün durum cümlesi — yer biliniyorsa o adrese göre, bilinmiyorsa depo-üstü. */
export function stokCumlesi(status: StockStatus, yer: Pick<ChatPlace, 'durum'>): string {
  return (yer.durum === 'biliniyor' ? STOK_SOZLUGU : STOK_YERSIZ)[status];
}

/**
 * Kargo bölgesi — rota deposu yok, kargo deposu çözülmüş (`resolvePlaceWarehouses`). Burada soğuk
 * zincir ürünü hiçbir yoldan gitmez: araç gelmiyor, kargo taşıyamıyor.
 */
export function kargoYalniz(place: PlaceWarehouses): boolean {
  return place.warehouseId === null && place.shippingWarehouseId !== null;
}

/**
 * Bu stok hâli müşterinin yerine gider mi. Karar `deliversHere`in (katalogun tek kuralı); burada
 * yalnız yerin hâli eklenir: bilinmeyen yerde AYIKLANMAZ, hizmet olmayan koda hiçbir şey gitmez.
 */
export function yereGider(status: StockStatus, yer: Pick<ChatPlace, 'durum'>): boolean {
  if (yer.durum === 'hizmet-yok') return false;
  return yer.durum !== 'biliniyor' || deliversHere(status);
}

/** Gidemeyen ürünün sebebi — modele tek cümle: "yok" DEĞİL, neden bu adrese gitmediği. */
export function gitmemeSebebi(
  urun: Pick<StorefrontProduct, 'stockStatus' | 'shippable'>,
  yer: Pick<ChatPlace, 'durum' | 'place'>,
): string {
  if (yer.durum === 'hizmet-yok') return 'bu posta koduna teslimat yok';
  if (urun.stockStatus === 'out_of_stock') return STOK_SOZLUGU.out_of_stock;
  // Kargo bölgesinde soğuk zincir ürünü, stok nerede durursa dursun bu adrese gelemez; "başka depoda"
  // demek, mal gelince gönderileceği izlenimini verirdi.
  if (!urun.shippable && kargoYalniz(yer.place)) return 'soğuk zincir — kargoya verilemez, bu adres kapıya teslim bölgemizin dışında';
  return STOK_SOZLUGU.elsewhere;
}

/**
 * Listeyi yere göre ikiye ayırır; sıra korunur (arama sırası = ilgi sırası). Gidemeyen, modele gidecek
 * hâliyle döner — "Ad — sebep": başka biçimde okunduğu bir yer yok.
 */
export function yereGoreAyir<T extends Pick<StorefrontProduct, 'name' | 'stockStatus' | 'shippable'>>(
  urunler: readonly T[],
  yer: Pick<ChatPlace, 'durum' | 'place'>,
): { gidenler: T[]; gitmeyenler: string[] } {
  const gidenler: T[] = [];
  const gitmeyenler: string[] = [];
  for (const urun of urunler) {
    if (yereGider(urun.stockStatus, yer)) gidenler.push(urun);
    else gitmeyenler.push(`${urun.name} — ${gitmemeSebebi(urun, yer)}`);
  }
  return { gidenler, gitmeyenler };
}

/**
 * Gidemeyenlerin modele giden alanı — boşsa HİÇ yok (boş dizi "önemsiz" okunur). Ad listesi tavanlı,
 * sayı tam: kırpma sessiz olmaz (`urun_ara`nın 07.09 kuralı).
 */
export function gitmeyenAlani(gitmeyenler: readonly string[], tavan: number): Record<string, unknown> {
  if (gitmeyenler.length === 0) return {};
  return {
    buAdreseGitmeyenler: {
      sayi: gitmeyenler.length,
      urunler: gitmeyenler.slice(0, tavan),
      not: 'Bunlar müşterinin posta koduna GÖNDERİLEMİYOR: ÖNERME, karusele ya da karta koyma. Müşteri adıyla sorarsa var olduğunu ve neden gönderilemediğini söyle; gidebilen bir alternatif öner.',
    },
  };
}
