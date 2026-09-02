import {
  AnalyticsReportService,
  DeliveryZoneService,
  PostalCodeDemandService,
  PostalCodePlaceService,
  SettingsService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map-model';
import { readDayHours, type DayHourKey, type ZoneHours } from '@/lib/settings/day-hours';
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
  /**
   * Bu rotaya YAZILI eşik saatleri — yalnız istisnalar (17.08).
   *
   * Yürürlükteki değerin tamamı DEĞİL: genel değeri de taşısaydı taslak, hiç dokunulmamış bir eşiği
   * kaydetmede rotaya özel satır olarak yazardı. Genel değerler `RoutesData.globalHours`ta, tek kez.
   */
  hours: Partial<Record<DayHourKey, string>>;
}

export interface RoutesData {
  routes: RouteView[];
  /**
   * Rota formunun depo seçicisini besleyen liste (`OB-01`). **Pasifler de GELİR ve işaretlenir**,
   * süzülmez: bir rota bugün pasif bir depoya bağlı olabilir ve o kaydı listeden düşürmek seçiciyi
   * "seçim yok" hâline sokup operatöre kendi rotasının deposunu gizlerdi. `isActive` ekranın
   * uyarabilmesi için taşınıyor — kapalı tesise güzergâh bağlamak sessizce yapılmamalı.
   */
  warehouses: { id: string; name: string; code: string; countryCode: string; isActive: boolean }[];
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
  /**
   * Eşiklerin GENEL (küresel) değerleri — istisnası olmayan şeridin gösterdiği saat.
   *
   * Rota başına tekrarlanmıyor: dördü de tüm rotalar için aynı ve rota sayısı kadar kopyalamak, aynı
   * değeri N kez taşıyıp bir gün ayrışmasına izin vermek olurdu.
   */
  globalHours: Record<DayHourKey, string>;
}

/**
 * **Bölge öneki havuzu KALDIRILDI (07.08, aynı gün).**
 *
 * Bir süre boştaki kodlar "rotaların dokunduğu bölgelerin" (kodun ilk iki hanesi) kodlarından
 * çiziliyordu — `bbox` okuması yokken işi yürüten bir çözümdü ve bilinen bir sınırı vardı: hiç
 * rotası olmayan bir bölgeye kaydırınca hiçbir şey görünmüyordu. Kullanıcı bunu ekranda gördü
 * (*"Paris tarafına gittiğim zaman herhangi bir şey görünmüyor, bu normal mi?"*).
 *
 * Aynı gün arka uç şeridi `readPostalCodesForMap({bbox})` kapısını teslim etti; havuz artık görüş
 * alanının kendisi. Sayfa okumasından dört sorgu düştü ve sınır kalktı.
 */

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
    // **YALNIZ TESİSLER** — rotanın çıkış deposu bir adrestir, araç değil. Kural veritabanında
    // zaten yazılı (`delivery_zone_warehouse_is_facility` tetikleyicisi) ama seçici araçları da
    // gösteriyordu: operatör "Çıkış deposu"nda VAN-1'i seçebiliyor, kaydetmeye basınca tetikleyici
    // reddediyordu — sebebi ancak kayıt anında görünen bir ret (ölçüldü 02.09). Aktiflik süzgeci
    // BURADA YOK ve bu bilinçli: pasif tesis "— pasif" etiketiyle listede durur (aşağıdaki uyarı
    // satırı ona bağlı), araç ise hiç durmaz. İkisi ayrı sorular.
    new WarehouseService(db).list({ kind: 'facility' }),
    new PostalCodeDemandService(db).listTop(DEMAND_POOL),
  ]);

  const warehouseName = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name]));
  const allCodes = zones.flatMap((zone) => zone.postalCodes);

  const placeSvc = new PostalCodePlaceService(db);
  const definedKeys = new Set(allCodes.map((code) => `${code.country}:${code.postalCode}`));

  /**
   * Öneri havuzu: TANIMLI kodlar + talep sayacının işaret ettikleri.
   *
   * Sayaçtaki kodlar haritanın o anki görüş alanının dışında olabilir ve tam da bu yüzden
   * değerliler: `68000` (Colmar) ekranda hiç görünmese bile 18 kez sorulmuş, 1 kişi bekliyor.
   * Öneri operatörün BAKMADIĞI yeri de göstermeli, yoksa yalnız zaten baktığı yeri önerir.
   *
   * Sayaçta ÜLKE yok (tablo yalnız kodu tutuyor, `0023`): koordinat okuması iki ülkeyi de getirir,
   * ikisi de aday olarak listelenir — ayrımı yer adı ve haritadaki yeri yapar.
   */
  const demandCodes = new Set(demands.map((demand) => demand.postalCode));
  const uniqueCodes = [...new Set([...allCodes.map((code) => code.postalCode), ...demandCodes])];

  /**
   * Koordinat + ağırlık TEK turda.
   *
   * **Ağırlık ADAYLAR için de okunuyor** ve bu bilinçli: operatör boştaki bir koda tıklayıp rotaya
   * eklediğinde ağırlık rayı onun gerçek sayısını hemen gösterebilsin. Aksi hâlde yeni eklenen her
   * kod "ölçülmedi" derdi — oysa sayı elimizde. Kargo yoluyla o koda giden siparişler tam olarak
   * "burayı rotaya almalı mıyım" sorusunun kanıtıdır.
   */
  const [places, orders, waiting, hours] = await Promise.all([
    uniqueCodes.length > 0 ? placeSvc.listByPostalCodes(uniqueCodes) : Promise.resolve([]),
    uniqueCodes.length > 0
      ? new AnalyticsReportService(db).postalCodeOrders(uniqueCodes)
      : Promise.resolve(new Map<string, { orderCount: number; revenueCents: number }>()),
    new ZoneNoticeService(db).pendingCountByPostalCode(),
    // Eşik saatleri: anahtar başına tek sorgu, rota sayısıyla ÇARPMAZ (`readDayHours` künyesi).
    readDayHours(
      new SettingsService(db),
      zones.map((zone) => zone.id),
    ),
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
  // Koordinatı olmayan kod ATLANIR: haritada `(0, 0)`a düşen nokta Gine Körfezi'nde durur ve
  // operatöre "bu kod orada" der (19.18'in kendi kuralı).
  const located: LocatedPlace[] = places
    .filter((place) => place.lat !== null && place.lng !== null)
    .map((place) => ({
      country: place.country,
      postalCode: place.postalCode,
      places: place.places,
      lat: place.lat!,
      lng: place.lng!,
    }));

  // "Şimdi" okumanın işi, motorun değil: motor saf kalsın ve testi tarihe bağlı olmasın.
  // Uzaklık BURADA hesaplanmıyor: gösterilen mesafe DÜZENLENEN rotaya göredir ve o seçim
  // istemcide değişiyor (`routes.desktop`) — sunucuda hesaplansaydı rota değişince bayatlardı.
  const suggestions = buildSuggestions(located, { definedKeys, stats, requestOf, now: Date.now() });

  return {
    routes: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      warehouseId: zone.warehouseId,
      warehouseName: warehouseName.get(zone.warehouseId) ?? '—',
      weekdays: zone.weekdays,
      isActive: zone.isActive,
      postalCodes: zone.postalCodes,
      hours: exceptionsOf(hours.byZone.get(zone.id)),
    })),
    globalHours: hours.global,
    warehouses: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      code: warehouse.code,
      countryCode: warehouse.countryCode,
      isActive: warehouse.isActive,
    })),
    stats,
    suggestions,
    /**
     * Sayfanın getirdiği noktalar: TANIMLI kodlar + önerilenler. Boştakiler burada YOK — onları
     * haritanın kendi görüş alanı okuması getiriyor (`readMapCodesAction`), çünkü hangi kutuya
     * bakıldığı kaydırmayla değişiyor ve her kaydırmada sayfayı yeniden çizdirmek gerekmiyor.
     *
     * Öneriler BURADA çünkü onlar görüş alanına bağlı DEĞİL: `68000` ekranda görünmese bile
     * önerilir — öneri operatörün bakmadığı yeri de göstermeli.
     */
    points: located
      .filter(
        (place) =>
          definedKeys.has(`${place.country}:${place.postalCode}`) ||
          suggestions.some((row) => row.country === place.country && row.postalCode === place.postalCode),
      )
      .map((place) => ({
        country: place.country,
        postalCode: place.postalCode,
        lat: place.lat,
        lng: place.lng,
        /**
         * Adlar HAM geçiyor (`OB-04`, 15.08). Burada bir dönem `placeLabel(place.places)` vardı ve
         * çok yerleşimli kodda `undefined` üretiyordu — gerekçesi doğruydu (`places[0]` keyfidir,
         * `67800` "Strasbourg" değil Bischheim/Hœnheim) ama sonucu fazla sessizdi: kodların ~%39'u
         * haritada adsız çiziliyordu. Karar ekranın (`placesLabel`), veri buradan tam gider.
         */
        places: place.places,
      })),
  };
}

/**
 * Yürürlükteki saatlerden **yalnız istisnaları** süzer.
 *
 * Rota ekranının taslağı operatörün KARARINI taşımalı, sistemin o an uyguladığı değeri değil: genel
 * değer de taslağa girseydi, hiçbir saate dokunmadan "Kaydet"e basmak dört eşiği birden bu rotaya
 * istisna olarak yazardı — sonra genel değer değiştiğinde bu rota sessizce eski saatte kalırdı.
 */
function exceptionsOf(zoneHours: ZoneHours | undefined): Partial<Record<DayHourKey, string>> {
  if (!zoneHours) return {};
  const pairs = Object.entries(zoneHours).filter(([, value]) => value.isException);
  return Object.fromEntries(pairs.map(([key, value]) => [key, value.time])) as Partial<Record<DayHourKey, string>>;
}
