import 'server-only';
import { PostalCodePlaceService, serviceDb } from '@lezzet/database';
import type { Country } from '@lezzet/types';

/**
 * **HARİTANIN POSTA KODU OKUMASI** (19.20) — bölge kurulumu haritadan yapılıyor.
 *
 * Ekranın ayırt etmesi gereken üç hâl var: *bu bölgenin · başka bölgede tanımlı · **boşta***.
 * İlk ikisini ekran zaten biliyor (bölge kayıtları sayfada); boştakiler hiçbir yerde listelenmiyor
 * çünkü henüz hiçbir bölgeye ait değiller. Haritanın var olma sebebi tam olarak yeni kod eklemek,
 * yani bu okuma olmadan harita yalnız zaten tanımlı olanı gösterebilirdi.
 *
 * ── NEDEN UYGULAMA KATMANINDA, SERVİSTE DEĞİL ───────────────────────────────
 * Servis satır getirir (`listInBounds`), burası **ekranın sözleşmesini kurar**: koordinatı
 * daraltır (`lat!`/`lng!` → `number`), alan kümesini ekranın ihtiyacına indirir.
 *
 * **Ad KARARI burada DEĞİL ve 15.08'de buradan çıktı** (`OB-04`). Bir dönem `placeLabel` burada
 * çağrılıyordu ve künye *"burası gösterilecek adı seçer"* diyordu; ölçüldü ki bu fazla erken bir
 * karardı — çok yerleşimli kodda `null` üretip diziyi atıyordu ve ekran adı bir daha hiç
 * göremiyordu. `placeLabel`in kendi künyesi zaten doğruyu yazıyordu: *"ne yazılacağı ekranın
 * kararıdır ve `places` onun elinde."* Artık dizi ham geçiyor; biçim ekranda (`placesLabel`).
 */

/** Adıyla dışa AÇILMIYOR: tüketicisi doğduğu gün `export` eklenir (bugün `knip` doğru işaretliyor). */
interface MapPostalCode {
  country: Country;
  postalCode: string;
  lat: number;
  lng: number;
  /**
   * Kodun yerleşim adları — **HAM liste, karar verilmemiş** (`OB-04`, 15.08).
   *
   * ── ÖNCEKİ HÂL VE NEDEN DEĞİŞTİ ─────────────────────────────────────────
   * Burada `place: string | null` vardı ve `placeLabel(row.places)` ile dolduruluyordu: tek
   * yerleşimliyse adı, çok yerleşimliyse **`null`**. Gerekçesi doğruydu ve bugün de doğru —
   * `places[0]` keyfi bir seçimdir, otorite gibi okunur (`67800` "Strasbourg" değil,
   * Bischheim/Hœnheim; kodların ~%39'u çok yerleşimli).
   *
   * **Ama seçilen alternatif fazla daraldı:** "hepsi değil hiçbiri" denince ekran çok yerleşimli
   * kodu adsız çiziyordu ve operatör haritada dolaşırken nereye baktığını göremiyordu. Kullanıcı
   * bunu arayüz testinde bildirdi (`OB-04`): hover'da adların **tamamı** yazılsın.
   *
   * Doğru yer ayrımı zaten `placeLabel` künyesinde yazılıydı: *"`null` gördüğünde ne yazılacağı …
   * ekranın kararıdır ve `places` onun elinde."* Bu okuma o diziyi ekrana hiç vermiyordu. Artık
   * ham geçiyor; biçimlendirmeyi `placesLabel` (operasyon sözlüğü) yapıyor.
   *
   * Yük: dizi tek ad yerine ortalama ~1,4 ad taşıyor ve tavan zaten 1200 nokta — ölçülebilir bir
   * fark değil. Karar veriyi kırpmak değil, doğru katmanda kırpmaktı.
   */
  places: readonly string[];
}

interface MapPostalCodes {
  points: MapPostalCode[];
  /** Tavan yüzünden kesildi mi — **ekran bunu yazmak zorunda.** */
  truncated: boolean;
}

export async function readPostalCodesForMap(input: {
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  country?: Country;
  limit?: number;
}): Promise<MapPostalCodes> {
  const { rows, truncated } = await new PostalCodePlaceService(serviceDb()).listInBounds(input);

  return {
    // Koordinatsız kayıt sorgudan zaten dönmüyor; `lat!`/`lng!` bu yüzden güvenli ve tip daralması
    // burada yapılıyor ki ekran `null` ihtimalini taşımasın — harita noktası koordinatsız olamaz.
    points: rows.map((row) => ({
      country: row.country,
      postalCode: row.postalCode,
      lat: Number(row.lat),
      lng: Number(row.lng),
      places: row.places,
    })),
    truncated,
  };
}
