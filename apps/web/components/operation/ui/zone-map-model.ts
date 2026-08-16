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
   * Noktanın KÜNYE SAYILARI — bugün yalnız önerilen kodlarda dolu.
   *
   * **Cümle değil, ikon + sayı** (kullanıcı kararı 17.08). Önce tek satırlık bir cümleydi, sonra
   * satır dizisi oldu; ikisi de okunmadı çünkü sorun uzunluk değil BİÇİMDİ — *"her şeyi metin
   * olarak yazmaya çalışıyorsun… bunu bir kart gibi düşünsen, haber bekleyenleri bir ikonla
   * gösterebilirsin."* Operatörün ipucundan istediği bir paragraf değil üç sayı: kaç kişi bekliyor,
   * kaç kez soruldu, ne kadar uzakta. İkon bu sayılara sözcük harcamadan bağlam veriyor.
   *
   * Harita **metni kurmaz, taşır**: sözcükler ekranın sözlüğünde yaşıyor (`deliveries-labels`),
   * harita yalnız hangi ikonun çizileceğini bilir.
   */
  facts?: readonly ZoneMapFact[];
}

/**
 * İpucu kartının tek künye satırı — **ikon + kısa değer**, cümle değil.
 *
 * Sözcük tamamen kalkmadı ve bu bilinçli: çıplak ikon "3" ile "47"nin hangisinin ne olduğunu
 * söylemiyor, lejant da ipucunun içinde değil. Bir-iki kelimelik ek ("bekliyor", "soru") ikonun
 * anlamını çiviliyor ve yine de bir cümle kurmuyor.
 */
export interface ZoneMapFact {
  /** Hangi ikon çizilecek — anlam haritanın DEĞİL, sözlüğün kararı; harita yalnız çizer. */
  icon: 'waiting' | 'orders' | 'asked' | 'distance' | 'age';
  /** Sayı + en fazla bir kelime: "3 bekliyor", "22 km", "1 sa". */
  label: string;
}

/**
 * Kodun haritadaki hâli. Tasarımın üç hâline (§"Kod hâlleri") **dördüncüsü eklendi (07.08,
 * kullanıcı isteği):** `suggested` — boştaki ama VERİNİN işaret ettiği kod.
 *
 * Ayrı bir hâl, `free`'nin bir alt kümesi olarak değil kendi rengiyle çiziliyor çünkü operatörün
 * gözü haritada önce oraya gitmeli: 157 boş noktanın içinde "47 kez sorulmuş" olanı aramak, aramayı
 * operatöre yıkmaktır.
 *
 * **BEŞİNCİSİ `adding` (15.08, kullanıcı ekranda gördü):** *"hangi nokta eski, hangisi yeni seçilen
 * karışıyor."* Asistan kuyruğunun bölge gövdesinde operatör bir öneriyi kabul edince nokta `mine`
 * oluyordu — yani bölgenin YILLARDIR taşıdığı kodla, bu diyalogda AZ ÖNCE eklenen kod aynı yeşil
 * noktaya dönüşüyordu. Kararın kendisi görünmez oluyordu: operatör "ne değiştirdim" sorusunu
 * haritaya soramıyordu.
 *
 * `adding` o boşluğu kapatıyor ve rengi iki aileyi birleştiriyor — **zeytin dolgu + mor çember**:
 * *"asistanın önerisiydi (mor), bu kararla bölgeye giriyor (zeytin)."* Rota kurulum ekranı bu hâli
 * hiç üretmiyor (`stateOf` orada dört daldan dönüyor), dolayısıyla lejantı da kirletmiyor: satır
 * yalnız haritada o hâlden bir nokta VARSA çiziliyor.
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
  /**
   * **Haritayı bir noktaya taşıma emri** — `center`den farkı zamanıdır: `center` açılış konumudur ve
   * yalnız harita KURULURKEN okunur, bu ise sonradan gelir.
   *
   * Her tetiklemede **yeni nesne** beklenir; emri taşıyan şey nesnenin KİMLİĞİDİR, değeri değil.
   * Sebep somut: aynı öneriye ikinci kez tıklamak da bir emirdir (operatör kaydırıp geri dönmüş
   * olabilir), ama değerler aynı olduğu için değere bakan bir karşılaştırma onu görmezdi.
   */
  focus?: { lat: number; lng: number } | null;
  className?: string;
}
