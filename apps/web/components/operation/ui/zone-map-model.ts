import type { Country } from '@lezzet/types';

/**
 * Rota haritasının saf sözleşmesi: tip, sabit, anahtar. Leaflet buraya girmez, çünkü modül düzeyinde `window`a dokunuyor ve
 * sunucudan okunan dosyalar (`routes-read`) bu dosyayı ithal ediyor; harita yalnız `zone-map.tsx` üzerinden tarayıcıda yüklenir.
 */

/**
 * Haritanın çizdiği tek nokta.
 */
export interface ZoneMapPoint {
  /** Ülke domain enum'u, çünkü tıklanan nokta doğrudan rotanın `Country` bekleyen kod kümesine giriyor. */
  country: Country;
  postalCode: string;
  lat: number;
  lng: number;
  /**
   * Kodun yerleşim adları, ham liste: kırpma çizim anında verilir (kalıcı etiket dar, ipucu tam). Tek ad taşımak çok yerleşimli
   * kodları haritada adsız bırakıyordu; boş dizi = ad bilinmiyor, etiket yalnız kodu yazar.
   */
  places?: readonly string[];
  /**
   * Noktanın künye sayıları, bugün yalnız önerilen kodlarda dolu: cümle değil ikon + sayı, çünkü operatör ipucundan üç sayı ister.
   * Harita metni kurmaz, taşır: sözcükler ekranın sözlüğünde (`deliveries-labels`).
   */
  facts?: readonly ZoneMapFact[];
}

/**
 * İpucu kartının tek künye satırı — ikon + kısa değer. Bir-iki kelimelik ek kalır, çünkü çıplak ikon "3" ile "47"nin ne olduğunu
 * söylemez.
 */
export interface ZoneMapFact {
  /** Hangi ikon çizilecek — anlam haritanın DEĞİL, sözlüğün kararı; harita yalnız çizer. */
  icon: 'waiting' | 'orders' | 'asked' | 'distance' | 'age';
  /** Sayı + en fazla bir kelime: "3 bekliyor", "22 km", "1 sa". */
  label: string;
}

/**
 * Kodun haritadaki hâli. `suggested` boştaki ama verinin işaret ettiği koddur ve kendi rengiyle çizilir, ki göz önce oraya gitsin;
 * `adding` bu kararla eklenen koddur, yoksa operatör "ne değiştirdim" sorusunu haritaya soramazdı.
 */
export type ZoneCodeState = 'mine' | 'taken' | 'suggested' | 'adding' | 'free';

/** Görünen alan — "boşta" kod okumasının girdisi. */
export interface MapViewport {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  zoom: number;
}

/**
 * Boşta kodların çizilmeye başladığı yakınlık: komşu kodlar arası ortanca mesafe ~4,4 km ve z=10 noktaların ayrık (29 px) ve
 * sayıca sınırlı (en yoğun bölgede ~661) olduğu ilk kademe. Altında sorun çizim maliyeti değil, noktaların tıklanamaması.
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
  /**
   * Haritayı bir noktaya taşıma emri; `center` yalnız kurulurken okunur, bu sonradan gelir. Emri nesnenin kimliği taşır, değeri
   * değil: aynı öneriye ikinci kez tıklamak da bir emirdir.
   */
  focus?: { lat: number; lng: number } | null;
  className?: string;
}
