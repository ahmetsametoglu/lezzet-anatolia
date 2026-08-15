import type { Country } from '@lezzet/types';

/**
 * Rota haritasının **saf** sözleşmesi — tip, sabit, anahtar. Leaflet BURAYA GİRMEZ ve ayrımın sebebi
 * ölçülmüş bir arızadır (07.08): `leaflet` modül düzeyinde `window`a dokunuyor, Next ise istemci
 * komponentlerini de sunucuda bir kez çiziyor. Tek dosyada toplandığında sayfanın kendisi
 * **500** dönüyordu (`Error: window is not defined`) — ekran istemcide toparladığı için gözle
 * görünmüyordu ama sunucu çizimi her istekte düşüyordu.
 *
 * Bu dosya sunucudan da güvenle okunur (`routes-read` noktaları buradan tipliyor); haritanın kendisi
 * `zone-map.tsx` üzerinden yalnız tarayıcıda yükleniyor.
 */

/**
 * Haritanın çizdiği tek nokta.
 */
export interface ZoneMapPoint {
  /**
   * Ülke `string` DEĞİL, domain enum'u (`CLAUDE.md §1`): tıklanan nokta doğrudan rotanın kod
   * kümesine giriyor ve o küme `Country` bekliyor. Gevşetmek, her tıklamada bir dönüştürme
   * (ve dönüştürmenin başarısız olabileceği bir dal) demekti.
   */
  country: Country;
  postalCode: string;
  lat: number;
  lng: number;
  /**
   * Kodun yerleşim adları — **HAM liste** (`OB-04`, 15.08).
   *
   * Eskiden `place?: string` idi (tek ad) ve künyesi *"TÜM yerleşim listesini yüzlerce noktada
   * taşımak, hiç görünmeyecek bir yükü ağdan geçirmek olurdu"* diyordu. Yük gerekçesi ölçülünce
   * tutmadı: kod başına ortalama ~1,4 ad var ve nokta tavanı 1200 — fark okunacak bir sayı değil.
   * Bedeli ise ağırdı: çok yerleşimli kodlar (~%39) haritada **adsız** çiziliyordu, çünkü tek adı
   * üreten motor (`placeLabel`) onlarda `null` döner. Operatör en kalabalık bölgelerde tam olarak
   * nereye baktığını göremiyordu.
   *
   * Kırpma kararı ÇİZİM anında veriliyor (`placesLabel`): kalıcı etiket dar, üzerine gelince
   * açılan ipucu tam. Veriyi kaynağında kırpmak o iki farklı ihtiyacı tek cevaba mahkûm ediyordu.
   *
   * Boş dizi = ad bilinmiyor; etiket yalnız kodu yazar.
   */
  places?: readonly string[];
  /**
   * Etikete eklenen GEREKÇE — bugün yalnız önerilen kodlarda dolu ("3 kişi bekliyor · 47 kez
   * soruldu"). Harita metni KURMAZ, taşır: gerekçenin dili ekranın sözlüğünde yaşıyor
   * (`deliveries-labels`), tıpkı servislerin ham veri döndürüp etiket kurmaması gibi.
   */
  note?: string;
}

/**
 * Kodun haritadaki hâli. Tasarımın üç hâline (§"Kod hâlleri") **dördüncüsü eklendi (07.08,
 * kullanıcı isteği):** `suggested` — boştaki ama VERİNİN işaret ettiği kod.
 *
 * Ayrı bir hâl, `free`'nin bir alt kümesi olarak değil kendi rengiyle çiziliyor çünkü operatörün
 * gözü haritada önce oraya gitmeli: 157 boş noktanın içinde "47 kez sorulmuş" olanı aramak, aramayı
 * operatöre yıkmaktır.
 */
export type ZoneCodeState = 'mine' | 'taken' | 'suggested' | 'free';

/** Görünen alan — "boşta" kod okumasının girdisi. */
export interface MapViewport {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  zoom: number;
}

/**
 * **Boşta kodların çizilmeye başladığı yakınlık.** Bir tercih değil, ÖLÇÜLMÜŞ bir eşik (07.08).
 *
 * Komşu iki posta kodu arası ortanca mesafe 0,039° (Alsace ölçümü, ~4,4 km). Bir zoom kademesinde
 * ekranda kaç piksele denk düştüğü ve görüş alanına kaç kod girdiği:
 *
 * | zoom | komşu nokta arası | görüş alanındaki kod (en yoğun: Ruhr) |
 * |------|-------------------|----------------------------------------|
 * | 13   | 229 px            | ~14                                    |
 * | 11   |  57 px            | 278                                    |
 * | 10   |  29 px            | **661**                                |
 * |  9   |  14 px            | 1.293                                  |
 * |  8   |   7 px            | 3.828                                  |
 * |  6   |   1,8 px          | 16.596 (neredeyse tamamı)              |
 *
 * Nokta çapı 13–16 px. z=9'da noktalar birbirine değiyor, z=8'de tek bir lekeye dönüşüyor —
 * yani eşiğin altında sorun ÇİZİM MALİYETİ değil, **tıklanacak noktanın ayırt edilememesi**.
 * 3.828 noktayı tuval üstünde çizmek tarayıcıyı yormaz; hiçbirini doğru tıklayamamak ekranı işe
 * yaramaz kılar. z=10 hem ayrık (29 px) hem sınırlı (661) olan ilk kademe.
 */
export const FREE_CODE_MIN_ZOOM = 10;

/** Nokta anahtarı: `67000` iki ülkede geçerli — ülkesiz anahtar eksik bir sorudur. */
export function keyOfPoint(point: { country: string; postalCode: string }): string {
  return `${point.country}:${point.postalCode}`;
}

export interface ZoneMapProps {
  points: readonly ZoneMapPoint[];
  /** Kod → hâl. */
  stateOf: (point: ZoneMapPoint) => ZoneCodeState;
  /** Tıklanan nokta — çağıran ekler ya da çıkarır; harita karar vermez, bildirir. */
  onPick: (point: ZoneMapPoint) => void;
  /** Görünen alan oturunca (kaydırma/yakınlaşma bitince). "Boşta" kod okumasının tetiği. */
  onViewport?: (viewport: MapViewport) => void;
  /** Lejantın altındaki DEĞİŞKEN satır: kaç boşta kod var, yakınlaşmak gerekiyor mu. */
  note?: string;
  /** Kısa geri bildirim şeridi (tasarımın `hint` kutusu) — 2,6 sn sonra söner. */
  hint?: string | null;
  center?: { lat: number; lng: number };
  className?: string;
}
