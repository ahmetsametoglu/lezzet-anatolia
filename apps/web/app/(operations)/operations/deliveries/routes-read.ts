import {
  AnalyticsReportService,
  DeliveryZoneService,
  PostalCodeDemandService,
  PostalCodePlaceService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map-model';
import { buildSuggestions, type LocatedPlace } from './routes-suggest';
import type { CodeStatsView, PostalCodePick, SuggestionView } from './routes-types';

/**
 * Rota kurulumunun okuması (19.20 · 09.15) — `design/project/Depolar - Bolge Haritasi.html`.
 *
 * **Rota = bölge.** Kullanıcının tanımı (07.08): *"bir bölge tanımlamak = bir dağıtım güzergâhı
 * tanımlamak; günü gelince o rotayı dağıtıma çıkarıyoruz."* Veri modeli adı `delivery_zone` kalıyor;
 * arayüz dili tek kelimeye oturdu — bölgenin haftalık günleri taşıması zaten onu bir güzergâh yapar.
 *
 * **Depo süzgeci YOK ve olmamalı:** operatör "hangi depodan" diye değil "nereye" diye düşünüyor;
 * rotalar depoya göre GRUPLANIR ama liste bütündür. Süzgeç koymak, iki deposu olan bir kurulumda
 * komşu iki güzergâhı birbirinden gizlerdi — oysa çakışan posta kodu tam orada doğar.
 */

export interface RouteView {
  id: string;
  name: string;
  warehouseId: string;
  warehouseName: string;
  /** ISO haftalık günler (1=Pazartesi). Boşsa bu rotaya teslimat planlanmaz. */
  weekdays: number[];
  isActive: boolean;
  postalCodes: PostalCodePick[];
}

export interface RoutesData {
  routes: RouteView[];
  warehouses: { id: string; name: string; code: string; countryCode: string }[];
  /**
   * Kod → ağırlık. Anahtar YALNIZ posta kodu (ülke yok) çünkü `analytics_postal_code_orders` da
   * öyle eşliyor; `67000` hem FR hem DE'de geçerli olduğu için iki ülkenin siparişi bu sayıda
   * birleşir. Bugün tek ülkeli rotalarda görünmez, sınır deposu (Kehl) büyürse ayrışması gerekir.
   */
  stats: Record<string, CodeStatsView>;
  /**
   * Haritanın çizdiği tüm noktalar: tanımlı kodlar **+ aynı bölgelerin boştaki kodları**.
   * Hangi hâlde olduğuna ekran karar verir (`stateOf`), okuma yalnız adayları getirir.
   */
  points: ZoneMapPoint[];
  /** Güçlüden zayıfa sıralı, tavanlı. Boş dizi "aday yok" demek — sinyal yoksa öneri de yok. */
  suggestions: SuggestionView[];
}

/**
 * Bölge = posta kodunun ilk iki hanesi. Fransa'da departman (`67` = Bas-Rhin), Almanya'da
 * Leitregion. Bir dağıtım güzergâhı bu ölçekte kurulur; üç hane fazla dar (komşu kasabayı dışarıda
 * bırakır), tek hane fazla geniş (yarım ülke gelir).
 */
const REGION_PREFIX_LEN = 2;

/**
 * Bir bölge önekinin aday tavanı. Ölçüldü: iki ülke toplamında en kalabalık iki haneli önek 335
 * kod (`59`). 400 hiçbir bölgeyi kesmez — kesseydi `searchPrefix` kod sırasına göre sıralayıp
 * kuyruğu atardı ve iki ülke aynı sayı aralığını paylaştığı için atılan kodlar sessizce Fransa'dan
 * olurdu.
 */
const REGION_CODE_LIMIT = 400;

/** Talep liderlik tablosundan kaç satır okunuyor — öneri havuzunun anonim ayağı. */
const DEMAND_POOL = 50;

export async function readRoutes(): Promise<RoutesData> {
  const db = serviceDb();

  // Pasif rota da GELİR: kodlarını tutmaya devam ediyor (kural veritabanında) ve haritada görünmezse
  // operatör "boşta" sanıp eklemeye çalışır, kayıt reddedilir ve sebebi görünmez olur.
  //
  // Talep liderlik tablosu (`listTop`) burada TAM DOĞRU kapı — ve bu bir tesadüf değil, sorunun
  // yönü değişti: ağırlık rayı "şu kodun talebi kaç" diye soruyordu (kod bazında, kapı yok), öneri
  // ise "en çok sorulanlar hangileri" diye soruyor. Liderlik tablosunun cevapladığı soru bu.
  const [zones, warehouses, demands] = await Promise.all([
    new DeliveryZoneService(db).listWithCodes(),
    new WarehouseService(db).list(),
    new PostalCodeDemandService(db).listTop(DEMAND_POOL),
  ]);

  const warehouseName = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
  const allCodes = zones.flatMap((zone) => zone.postalCodes);

  const placeSvc = new PostalCodePlaceService(db);
  const definedKeys = new Set(allCodes.map((code) => `${code.country}:${code.postalCode}`));

  /**
   * **Aday kodlar — rotaların DOKUNDUĞU bölgelerden** (07.08).
   *
   * Haritanın var olma sebebi yeni kod EKLEMEK; bunun için "boşta" kodların çizilmesi gerekiyor ve
   * onlar hiçbir rotada olmadığı için hiçbir listede yoklar. İdeal okuma görüş alanına göredir
   * (`bbox`) ve o kapı açık bir taleple bekliyor — ama beklemek gerekmiyordu: **kapsam bölgeyle
   * sınırlandığında iş mevcut açık kapılarla yapılabiliyor.**
   *
   * Kural: bir rotanın kodları hangi bölgelerdeyse (ülke + posta kodunun ilk iki hanesi = Fransa'da
   * departman, Almanya'da Leitregion), aday havuzu o bölgelerdir. Ölçüldü — küme küçük: FR `67`
   * 96 kod, DE `77` 69 kod; en kalabalık iki haneli önek iki ülke toplamı 335. Yani havuz operatörün
   * kendi kurduğu rotalarla sınırlı, veriyle büyümüyor (`CLAUDE §1`) ve tek turda çekilir.
   *
   * **Bilinen sınır:** operatör haritayı hiç rotası olmayan bir bölgeye (ör. Colmar, `68`) kaydırırsa
   * orada aday çizilmez — o bölge havuzda yok. Görüş alanına göre okuma gelince bu sınır kalkar.
   * BEKLEYEN(19.20)
   *
   * Ülke süzgeci ÇAĞRIDAN SONRA: `searchPrefix` bilerek ülke almıyor (müşteri yüzeyinde ülke
   * seçilmiyor) ve `67` hem Fransa'da hem Almanya'da geçerli — süzülmeseydi Strasbourg rotasına
   * aday diye 200 km kuzeydeki Pfalz kodları çizilirdi.
   */
  const regions = new Set(allCodes.map((code) => `${code.country}:${code.postalCode.slice(0, REGION_PREFIX_LEN)}`));
  const candidateKeys = (
    await Promise.all(
      [...regions].map(async (region) => {
        const [country, prefix] = region.split(':');
        const rows = await placeSvc.searchPrefix(prefix!, REGION_CODE_LIMIT);
        return rows.filter((row) => row.country === country).map((row) => `${row.country}:${row.postalCode}`);
      }),
    )
  ).flat();

  /**
   * Talep sayacındaki kodlar bölge havuzunun DIŞINDA olabilir ve tam da bu yüzden değerliler:
   * `68000` (Colmar) hiçbir rotamızın bölgesinde değil ama 18 kez sorulmuş. Havuzla sınırlı kalsaydı
   * öneri motoru yalnız zaten baktığımız yeri önerirdi — yani hiçbir şey keşfetmezdi.
   *
   * Sayaçta ÜLKE yok (tablo yalnız kodu tutuyor, `0023`): koordinat okuması iki ülkeyi de getirir,
   * hangisinin gerçek aday olduğuna uzaklık süzgeci karar verir.
   */
  const demandCodes = new Set(demands.map((demand) => demand.postalCode));

  const regionKeys = new Set([...definedKeys, ...candidateKeys]);
  // Koordinat okuması kodla yapılıyor (ülkesiz); ülke ayrımı aşağıdaki süzgeçte yapılır.
  const uniqueCodes = [
    ...new Set([...[...regionKeys].map((key) => key.slice(key.indexOf(':') + 1)), ...demandCodes]),
  ];

  /**
   * Koordinat + ağırlık TEK turda.
   *
   * **Ağırlık ADAYLAR için de okunuyor** ve bu bilinçli: operatör boştaki bir koda tıklayıp rotaya
   * eklediğinde ağırlık rayı onun gerçek sayısını hemen gösterebilsin. Aksi hâlde yeni eklenen her
   * kod "ölçülmedi" derdi — oysa sayı elimizde. Kargo yoluyla o koda giden siparişler tam olarak
   * "burayı rotaya almalı mıyım" sorusunun kanıtıdır.
   */
  const [places, orders, waiting] = await Promise.all([
    uniqueCodes.length > 0 ? placeSvc.listByPostalCodes(uniqueCodes) : Promise.resolve([]),
    uniqueCodes.length > 0
      ? new AnalyticsReportService(db).postalCodeOrders(uniqueCodes)
      : Promise.resolve(new Map<string, { orderCount: number; revenueCents: number }>()),
    new ZoneNoticeService(db).pendingCountByPostalCode(),
  ]);

  // Siparişi olmayan kod RPC'den HİÇ DÖNMEZ — o gerçekten sıfırdır (sorgu çalıştı, kayıt yok),
  // ölçülemeyen bir değer değil. Bekleyen sayısı da aynı: harita tüm bekleyişleri taşıyor.
  const stats: Record<string, CodeStatsView> = {};
  for (const code of uniqueCodes) {
    const order = orders.get(code);
    stats[code] = {
      orderCount: order?.orderCount ?? 0,
      revenueCents: order?.revenueCents ?? 0,
      waitingCount: waiting.get(code) ?? 0,
    };
  }

  const requestOf = new Map(demands.map((demand) => [demand.postalCode, demand]));
  // Koordinatı olan ve bizi ilgilendiren her yer: bölge havuzu + talep sayacının işaret ettikleri.
  const located: LocatedPlace[] = places
    .filter(
      (place) =>
        place.lat !== null &&
        place.lng !== null &&
        (regionKeys.has(`${place.country}:${place.postalCode}`) || demandCodes.has(place.postalCode)),
    )
    .map((place) => ({
      country: place.country,
      postalCode: place.postalCode,
      places: place.places,
      lat: place.lat!,
      lng: place.lng!,
    }));

  // Uzaklık ölçüsünün referansı: rotalarda TANIMLI kodların kendisi. Depo değil — bir güzergâhın
  // ucu depodan 40 km ötede olabilir ve bir sonraki durak oraya göre yakındır, depoya göre değil.
  const routeAnchors = located.filter((place) => definedKeys.has(`${place.country}:${place.postalCode}`));

  // "Şimdi" okumanın işi, motorun değil: motor saf kalsın ve testi tarihe bağlı olmasın.
  const suggestions = buildSuggestions(located, {
    definedKeys,
    routeAnchors,
    stats,
    requestOf,
    now: Date.now(),
  });

  return {
    routes: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      warehouseId: zone.warehouseId,
      warehouseName: warehouseName.get(zone.warehouseId) ?? '—',
      weekdays: zone.weekdays,
      isActive: zone.isActive,
      postalCodes: zone.postalCodes,
    })),
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      countryCode: warehouse.countryCode,
    })),
    stats,
    suggestions,
    /**
     * Koordinatı olmayan kod ATLANIR (`located` süzgeci): haritada `(0, 0)`a düşen nokta Gine
     * Körfezi'nde durur ve operatöre "bu kod orada" der (19.18'in kendi kuralı).
     *
     * `place` TEK ad: haritanın z13 etiketi "67550 · Vendenheim" diye okunuyor (tasarım) ve bir
     * kodun kapsadığı yerleşim listesinin tamamı etikete sığmaz. İlk ad kodun taşıyıcı yerleşimidir;
     * tamamı gerektiğinde `findPlaces` zaten var.
     *
     * **Uzaktaki talep kodu haritaya ÇİZİLMEZ.** `75011` (Paris) sayaçta var ama 400 km ötede;
     * çizilseydi operatör haritayı Strasbourg'da tutarken göremeyeceği, uzaklaştırdığında ise
     * güzergâhla ilgisi olmayan bir nokta görürdü. Onun evi Depolar'daki talep tablosudur (19.21) —
     * orası "yeni depo/bölge açmalı mıyım" sorusunun ekranı, burası "bu rotaya ne ekleyeyim"in.
     */
    points: located
      .filter(
        (place) =>
          regionKeys.has(`${place.country}:${place.postalCode}`) ||
          suggestions.some((row) => row.country === place.country && row.postalCode === place.postalCode),
      )
      .map((place) => ({
        country: place.country,
        postalCode: place.postalCode,
        lat: place.lat,
        lng: place.lng,
        place: place.places[0],
      })),
  };
}
