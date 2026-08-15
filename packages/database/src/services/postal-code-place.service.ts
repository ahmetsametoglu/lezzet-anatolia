import type { SupabaseClient } from '@supabase/supabase-js';
import { PostalCodePlaceSchema, type Country, type PostalCodePlace } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import { normalizePlaceName, normalizePostalCode } from '@lezzet/helper';
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
  async search(term: string, limit = 8): Promise<PostalCodeSuggestion[]> {
    /**
     * **İKİ DAL, TEK KAPI** (`OB-03` · kullanıcının arayüz testi 14.08).
     *
     * Kapı bir dönem yalnız kod öneki arıyordu (adı da `searchPrefix`ti) ve rota kurarken bunun
     * bedeli ölçüldü: operatör posta kodunu BİLMİYOR. "Strasbourg" yazınca sıfır sonuç alıyordu,
     * yani kodu bilmeyenin hiçbir yolu yoktu.
     *
     * Dal seçimi terimin KENDİSİNDEN okunuyor, çağırandan bayrak istenmiyor: bir bayrak, onu
     * geçirmeyi unutan ilk çağrıda sessizce eski davranışa düşerdi. Ölçüt basit ve iki pazarımız
     * için kesin — FR ve DE kodları tamamen sayısaldır, dolayısıyla harf içeren bir terim asla bir
     * kod olamaz.
     *
     * Kod dalı BİREBİR eskisi gibi kaldı: önek indeksi, aynı tavan, aynı sıralama. Yani bu
     * değişiklik yalnız EKLER — sayısal terimle gelen üç çağıranın (adres formu, mobil öneri ucu,
     * rota seçicisi) davranışı değişmiyor.
     */
    const byName = /\p{L}/u.test(term);
    return byName ? this.searchByPlace(term, limit) : this.searchByCode(term, limit);
  }

  /** Kodun ilk haneleriyle arama — önek indeksi (`postal_code_place_code`) üstünde. */
  private async searchByCode(prefix: string, limit: number): Promise<PostalCodeSuggestion[]> {
    // Tek harflik önek 16.9k satırın onda birini gezdirir ve hiçbir şey ayırt etmez (ölçüldü:
    // `6%` → 11,7 ms, `672%` → 0,11 ms). Kısa öneki reddetmek başarım değil ANLAM meselesi:
    // "6" hiçbir yeri işaret etmiyor.
    const normalized = normalizePostalCode(prefix);
    if (normalized.length < 2) return [];

    return this.enrich(
      await this.getAll(undefined, {
        prefixFilters: [{ field: 'postalCode', value: normalized }],
        orderBy: 'postalCode',
        limit,
      }),
    );
  }

  /**
   * **Yerleşim adıyla arama** (`OB-03`) — `places_search` üstünde parça araması.
   *
   * Terim `normalizePlaceName` ile normalleşiyor; kolonun kendisi migration'daki
   * `place_search_text()` ile AYNI kuralla üretilmiş (`0033` künyesi). İki taraf aynı kuralı iki
   * dilde uyguluyor ve ayrışmaları sessiz bir arıza olurdu — "Hœnheim" yazan operatör kendi
   * kaydını bulamazdı. Bu yüzden TS tarafındaki kural `@lezzet/helper`a taşındı: iki paket de
   * onu okuyor.
   *
   * **Neden ÖNEK değil PARÇA:** `places_search` kodun BÜTÜN adlarını yan yana taşıyor
   * ("bischheim hoenheim"); önek araması yalnız ilkini bulur ve çok yerleşimli kodların (~%39)
   * ikinci adı aranamaz kalırdı. Trigram indeksi (`postal_code_place_places_search`) bunun için var.
   *
   * Eşik ÜÇ harf, kodun ikisine karşılık: iki harflik bir ad parçası ("st") yüzlerce yerleşime
   * uyar ve tavana takılan liste rastgele bir kesitle döner — cevap gibi görünen bir gürültü.
   * Trigram indeksinin kendi birimi de üç harftir; kısa terim indeksi zaten kullanamaz.
   */
  private async searchByPlace(term: string, limit: number): Promise<PostalCodeSuggestion[]> {
    const normalized = normalizePlaceName(term);
    if (normalized.length < 3) return [];

    return this.enrich(
      await this.getAll(undefined, {
        searchFilters: [{ field: 'placesSearch', query: normalized }],
        orderBy: 'postalCode',
        limit,
      }),
    );
  }

  /** İki dalın ORTAK kuyruğu: rota üyeliğini işaretler ve sıralar. */
  private async enrich(rows: PostalCodePlace[]): Promise<PostalCodeSuggestion[]> {
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

  /**
   * **GÖRÜNEN ALANDAKİ kodlar** (19.20) — haritanın sorusu ötekilerin tersi: üç okuma kodu BİLEREK
   * sorar, biri önek arar; bu, "şu anda ekranda ne var" der.
   *
   * ── `bbox` ZORUNLU ve bu bir başarım ayarı değil ────────────────────────────
   * Operasyon şeridi ölçtü: ülke süzgeci yükü üçte bire indiriyor (16.878 → 6.065), `bbox` bir
   * şehre. Ülkenin tamamını dönen bir dal açsaydık, hiçbir ekranın kullanmayacağı 6.000 satırlık
   * bir yol açılırdı — ve bir gün biri onu çağırırdı.
   *
   * ── KOORDİNATSIZ KAYIT KENDİLİĞİNDEN DÜŞER ─────────────────────────────────
   * `lat >= x` karşılaştırması `null` için `null`dur, yani satır süzgeci geçmez. Ayrıca bir
   * `is not null` yazmıyoruz: aynı kuralı iki kez ifade etmek, biri değiştiğinde ötekinin
   * unutulacağı yerdir. Kural zaten veride (`postal_code_place_point`: ikisi birlikte var ya da
   * birlikte yok).
   *
   * ── TAVAN AŞILDIĞINDA SESSİZ KALINMAZ ──────────────────────────────────────
   * `limit + 1` istenir; fazlası varsa çağırana `truncated` denir. Ekran bunu YAZMAK zorunda:
   * eksik çizilen bir harita, operatöre olmayan kodu "yok" diye okutur.
   *
   * Sıra `postalCode` — kesme olduğunda hangi satırların düştüğü belirli olsun diye. Sırasız bir
   * sorgu her kaydırmada başka bir küme döndürür ve harita titrer; belirlilik, kesme yanlılığından
   * daha değerli (kesme zaten çağırana bildiriliyor).
   */
  async listInBounds(input: {
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
    country?: Country;
    limit?: number;
  }): Promise<{ rows: PostalCodePlace[]; truncated: boolean }> {
    const limit = input.limit ?? 1200;
    const rows = await this.getAll(input.country ? { country: input.country } : undefined, {
      rangeFilters: [
        { field: 'lat', operator: 'gte', value: input.bbox.minLat },
        { field: 'lat', operator: 'lte', value: input.bbox.maxLat },
        { field: 'lng', operator: 'gte', value: input.bbox.minLng },
        { field: 'lng', operator: 'lte', value: input.bbox.maxLng },
      ],
      orderBy: 'postalCode',
      limit: limit + 1,
    });

    return { rows: rows.slice(0, limit), truncated: rows.length > limit };
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
