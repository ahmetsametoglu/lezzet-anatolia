import type { SupabaseClient } from '@supabase/supabase-js';
import { PostalCodePlaceSchema, type Country, type PostalCodePlace } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { normalizePostalCode } from '@lezzet/helper';
import { DeliveryZonePostalCodeService } from './delivery-zone.service';

/**
 * Posta kodu referansı servisi (19.8) — salt okunur.
 *
 * Tablo migration'la doğar ve uygulama ona **yazmaz** (`never, never`): veri GeoNames dökümünden
 * üretilir, yılda bir yenilenir (`pnpm postal:build`). Bir kaydı elle düzeltmek, bir sonraki
 * üretimde sessizce geri alınacak bir düzeltmedir — o yüzden yazma kapısı hiç açılmıyor.
 *
 * **Karar vermez, satır getirir** (`STACK §4`): "bu kod hangi depoya düşer", "belirsiz mi" kararları
 * `domain-core/delivery/warehouse-resolve` motorundadır. Burası yalnız kodun hangi ülkelerde
 * geçerli olduğunu söyler.
 */
export class PostalCodePlaceService extends BaseDbService<PostalCodePlace, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'postal_code_place',
      PostalCodePlaceSchema,
      PostalCodePlaceSchema as never,
      PostalCodePlaceSchema as never,
      false,
    );
  }

  /**
   * Bir posta kodunun geçerli olduğu ülkeler + yer adları.
   *
   * Dönüş **0, 1 ya da 2 satırdır**: 0 = hiçbir ülkede geçerli değil (yazım hatası), 1 = normal hâl,
   * 2 = kod iki ülkede birden geçerli. Sonuncusu nadir değil — FR 6.065 + DE 10.813 kodun 610'u
   * öyle, yani her on Fransız kodundan biri.
   *
   * Sayfalama YOK ve olmamalı: dönüş kümesi hizmet verilen ülke sayısıyla sınırlı (bugün en fazla
   * iki satır), veriyle büyümüyor (`CLAUDE.md §1`).
   */
  async findByPostalCode(postalCode: string): Promise<PostalCodePlace[]> {
    return this.getAll({ postalCode }, { orderBy: 'country' });
  }

  /**
   * `(ülke, kod)` ikilisinin kapsadığı yerleşimler (19.17) — adres tutarlılığının kapısı.
   *
   * `findByPostalCode`'dan AYRI: o "bu kod hangi ülkelerde geçerli" sorusunun cevabıdır ve ülkeyi
   * bilmez; bu ise ülke zaten çözülmüşken sorulur ("67000 + LINGOLSHEIM tutarlı mı").
   *
   * **Boş dizi "uyuşmuyor" DEĞİL "bilinmiyor" demektir:** kod referansta olmayabilir ama yine de
   * bizim bölge tablomuzda olabilir (19.16a). Kararı çağıran değil `cityMatchesPlaces` verir ve o
   * boş listede engellemez — ölçülemeyen değer sıfır değildir (`CLAUDE.md §1`).
   */
  async findPlaces(country: Country, postalCode: string): Promise<string[]> {
    const rows = await this.getAll({ country, postalCode });
    return rows[0]?.places ?? [];
  }

  /**
   * Birden çok kodun satırları TEK turda — liste ekranlarının kapısı (19.19).
   *
   * `findPlaces` tek adres içindir; bir sipariş listesindeki elli adres için elli kez çağrılsaydı
   * elli gidiş-dönüş olurdu. Küme çağıranın elindeki sayfadır, sınırsız büyümez.
   */
  listByPostalCodes(postalCodes: readonly string[]): Promise<PostalCodePlace[]> {
    if (postalCodes.length === 0) return Promise.resolve([]);
    return this.getAll({ postalCode: [...new Set(postalCodes)] });
  }

  /**
   * **Önek araması** (19.19 · müşteri şeridinin talebi §7) — posta kodu alanının autocomplete'i.
   *
   * Bu uç **tuş yolundadır** ve tasarımı o gerçeğe göre: tek sorgu, sabit tavan, önek indeksi.
   *
   * **Neden ayrı bir kapı, `resolvePlaceAction`'a bayrak değil:** o kapının içinde `recordDemand`
   * var ve her tuşlanan kodu "bölge dışı talep" sayacına yazardı — bölge açma kararını besleyen
   * sayaç. 19.7'nin kayıtlı kararı bunu açıkça uyarıyor: *"kapıya bayrak eklemek yetmez, o bayrağı
   * unutan ilk çağrı sayacı yine kirletir."* Ayrı fonksiyon bunu **yapısal olarak** imkânsız kılar:
   * öneri bir OKUMA, onay bir NİYET; sayaç niyete bağlı kalır.
   *
   * **`inRoute` taşınır ve sıralamada öne alınır, ama SEÇİLMEZ.** Müşterinin aradığı büyük
   * olasılıkla hizmet verdiğimiz yerdir; doğru cevabı listenin dibine koymak onu saklamaktır. Öne
   * almak bir sıralama kararıdır — otomatik seçmek ise bir teslimat kararı ve iki adayın farkı
   * yalnız teslimat yolu değil **KDV oranıdır** (19.8).
   *
   * **Etiket kurulmaz, ham veri döner:** kaç ad yazılıp nereden sonra "+4" deneceği görsel bir
   * karardır (`CLAUDE.md §3`) ve hazır bir dize üç dilde çalışmaz.
   *
   * **Ülke süzgeci alınmaz:** müşteri ülke seçmiyor (19.16b); önek hangi ülkeye düşerse gelsin,
   * ayrımı yer adı ve ülke ile müşteri yapar.
   */
  async searchPrefix(prefix: string, limit = 8): Promise<PostalCodeSuggestion[]> {
    // Tek harflik önek 16.9k satırın onda birini gezdirir ve hiçbir şey ayırt etmez (ölçüldü:
    // `6%` → 11,7 ms, `672%` → 0,11 ms). Kısa öneki reddetmek başarım değil ANLAM meselesi:
    // "6" hiçbir yeri işaret etmiyor.
    const normalized = normalizePostalCode(prefix);
    if (normalized.length < 2) return [];

    const rows = await this.getAll(undefined, {
      prefixFilters: [{ field: 'postalCode', value: normalized }],
      orderBy: 'postalCode',
      limit,
    });
    if (rows.length === 0) return [];

    // İkinci tur YALNIZ bulunan kodlar için (en çok `limit` tane) — kod başına sorgu N+1 olurdu.
    const served = await new DeliveryZonePostalCodeService(this.supabase).listByCodes(rows.map((row) => row.postalCode));
    const inRoute = new Set(served.map((row) => `${row.country}:${row.postalCode}`));

    return rows
      .map((row) => ({
        country: row.country,
        postalCode: row.postalCode,
        places: row.places,
        inRoute: inRoute.has(`${row.country}:${row.postalCode}`),
      }))
      // Sıralama BELLEKTE: küme en çok `limit` satır ve ölçüt iki tabloya birden bakıyor.
      // Rota adayı önce, sonra kodun kendi sırası — eşitlikte ülke, ki sıra belirleyici olsun.
      .sort((a, b) =>
        a.inRoute === b.inRoute
          ? a.postalCode.localeCompare(b.postalCode) || a.country.localeCompare(b.country)
          : Number(b.inRoute) - Number(a.inRoute),
      );
  }
}

/** Autocomplete satırı — ekran etiketi buradan KURAR, burada kurulmaz. */
export interface PostalCodeSuggestion {
  country: Country;
  postalCode: string;
  /** Kodun kapsadığı TÜM yerleşimler, ham. Kısaltma (“+4”) ekranın kararı. */
  places: string[];
  /** Kod bizim bir teslimat bölgemizde mi — sıralamayı belirler, seçimi DEĞİL. */
  inRoute: boolean;
}
