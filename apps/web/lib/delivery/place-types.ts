import type { Address, Country } from '@lezzet/types';

/*
  Teslimat yeri müşterinin "nereye getirelim" cevabıdır ve yalnız posta kodu tutulur: teslimat şeklini o belirler, sokak ve numara
  ödemenin işidir. Yer bir sözdür, filtre değil; bilinmediğinde hiçbir şey kilitlenmez ve sepete eklemeyi hiçbir hâl engellemez.
*/

/**
 * Çerez yalnız müşterinin cevabını taşır, çözümü değil: istemcinin yazabildiği depo kimliği hangi stoğun gösterileceğini
 * belirleyemez, tarih de kesim saatinde bayatlar. Ülke saklanır, çünkü iki ülkede geçerli kodda türetilemez.
 */
export interface PlaceAnswer {
  country: Country;
  postalCode: string;
}

/** Belirsiz kodda ülke değil tanınabilir bir yer gösterilir: "Bischwiller mi Bobenheim-Roxheim mi" müşteriye bir şey ifade eder. */
export interface PlaceOption {
  country: Country;
  /** Çok yerleşimli kodda `null`; o hâlde `places` kullanılır. */
  placeName: string | null;
  /** Etiketi ekran kurar; kaç ad yazılıp nerede "+X"e geçileceği veri tarafının kararı değil. */
  places: string[];
  /** Daha olası cevap olduğu için liste bunu önce gösterir. */
  inRoute: boolean;
}

/** Dört hâl ayrık taşınır ki ekran belirsizlik seçicisini hata metnini ayrıştırmadan çizebilsin; `throw` yalnız gerçek arıza için. */
export type PlaceLookup =
  | { kind: 'resolved'; place: DeliveryPlace }
  /** En az iki aday taşır; müşteri seçer. */
  | { kind: 'ambiguous'; options: PlaceOption[] }
  /** Ne bölge tablomuzda ne referansta; büyük olasılıkla yazım hatası. */
  | { kind: 'unknown' }
  /**
   * `no_shipping_warehouse` bizim yapılandırma eksiğimizdir ve müşteriye "bölge dışısınız" dedirtmemeli; `ambiguous_zone` veri
   * çakışmasıdır.
   */
  | { kind: 'unresolved'; reason: 'no_shipping_warehouse' | 'ambiguous_zone' };

export interface DeliveryPlace {
  /** Normalleştirilmiş, boşluksuz. */
  postalCode: string;
  /** Posta kodundan türer; serbest seçilen ülke KDV oranını ve Alman B2B muafiyetini etkilerdi. */
  country: Country;
  /**
   * Çok yerleşimli kodda (~%39) `null`, çünkü orada tartışmasız bir ad yoktur ve üst idari birimin adı yanlış belediyeyi gösterir.
   * `null` boş demek değildir: etiketi ekran `places`tan kurar.
   */
  placeName: string | null;
  /** Kaç adın yazılıp nereden sonra "+X" deneceği ekranın kararı. */
  places: string[];
  /** Bizim rota bölgemizin adı, coğrafi yer adı değil; yalnız rota içindeyken bilinir. */
  zoneName: string | null;
  inRoute: boolean;
  /**
   * Vaat değil bilgi: sepette stok ayrılmadığı için gün bağlayıcı değildir. Kesim saatinde değiştiği için sayfaya gömülmez,
   * istemcide çözülür.
   */
  nextDate: string | null;
  /**
   * Yalnız tarayıcıdan giden adres önerisini sıralamak için; karar girdisi değildir. Koordinatsız kayıtta `null` ve öneri ipuçsuz
   * istenir.
   */
  point: { lat: number; lng: number } | null;
}

/**
 * Girişli ve adresli müşteride yerin kaynağı varsayılan adrestir; çerez yalnız ziyaretçide ve adressiz müşteride konuşur. Tarayıcıya
 * yalnız "hangi adres, nerede, kime" alanları gider, telefon ve koordinat gitmez.
 */
export type PlaceAddress = Pick<Address, 'id' | 'label' | 'recipient' | 'line1' | 'line2' | 'postalCode' | 'city' | 'country'>;

export function toPlaceAddress(address: Address): PlaceAddress {
  return {
    id: address.id,
    label: address.label,
    recipient: address.recipient,
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    country: address.country,
  };
}

/**
 * Adres yazan her eylem de bu şekli döner ki istemci "adres değişti, yer ne oldu" sorusunu ayrı turla sormasın. `place` `null`
 * iken `address` dolu olabilir: adres seçilidir ama kodu karşılanamıyordur ve sebep `unresolved`tadır.
 */
export interface PlaceSnapshot {
  place: DeliveryPlace | null;
  address: PlaceAddress | null;
  unresolved: PlaceUnresolved | null;
}

/** Kod tanınıyor ama ne rota ne kargo karşılıyor; iki sebep de müşteriye "bölge dışısınız" dedirtmez. */
export type PlaceUnresolved = Extract<PlaceLookup, { kind: 'unresolved' }>['reason'];

/**
 * Burada durur, çünkü istemci de okuyor ve sunucu okuması `server-only`. `id` ve `weekdays` taşınmaz: panelin tek sorusu
 * "benimki listede var mı".
 */
export interface DeliveryZoneSummary {
  name: string;
  postalCodes: string[];
}

// Web'deki çağıranlar yerin sözlüğünü tek dosyadan okur.
export { elsewhereReasonOf } from '@lezzet/helper';

/**
 * Vitrin okumasının yer bağlamı; iki depo birlikte geçilir, çünkü tek başına `warehouseId` "yerelde yok = tükendi" hatasını geri
 * getirirdi. `(null, null)` yer bilinmiyor, `(rota, kargo)` rota içi, `(null, kargo)` rota dışı demektir.
 */
export interface PlaceWarehouses {
  /** Yalnız rota deposu: kargo hâlinde de dolu olsaydı rota dışındaki müşteri "ücretsiz kapı teslimi" görürdü. */
  warehouseId: string | null;
  /** `null`: yer bilinmiyor ya da o ülkeye kargo yok. */
  shippingWarehouseId: string | null;
}
