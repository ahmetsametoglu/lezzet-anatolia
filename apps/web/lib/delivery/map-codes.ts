import 'server-only';
import { PostalCodePlaceService, serviceDb } from '@lezzet/database';
import { placeLabel } from '@lezzet/domain-core';
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
 * Servis satır getirir (`listInBounds`), burası **gösterilecek adı seçer**. Ad bir karardır ve
 * kararı veren motor `domain-core`'dadır (`placeLabel`); `database` motoru bilmez (`STACK §4`).
 * İkisini birleştiren yer burasıdır.
 */

/** Adıyla dışa AÇILMIYOR: tüketicisi doğduğu gün `export` eklenir (bugün `knip` doğru işaretliyor). */
interface MapPostalCode {
  country: Country;
  postalCode: string;
  lat: number;
  lng: number;
  /**
   * Etikette basılacak ad — **tek yerleşimliyse adı, çok yerleşimliyse `null`.**
   *
   * Talep `places[0]` demişti; öyle yapılmadı ve sebebi kayda değer. Bu tablo bir kez tek ad
   * tutuyordu ve çok yerleşimli kodda üst idari birime çıkıyordu; üretilen ad geçerli bir belediye
   * adı gibi okunduğu için **yanlışlığı görünmüyordu** — `67800` "Strasbourg" yazıyordu, orası
   * Bischheim / Hœnheim. Kodların ~%39'unu etkiliyordu (`0033` künyesi).
   *
   * `places[0]` o hatanın aynısını geri getirirdi: keyfi bir seçim, otorite gibi okunur. Alternatif
   * "hepsi" değil **hiçbiri**: etiket yalnız kodu gösterir (`67800`), ki bu dürüsttür. Tamamı
   * gerektiğinde `findPlaces` zaten var.
   */
  place: string | null;
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
      place: placeLabel(row.places),
    })),
    truncated,
  };
}
