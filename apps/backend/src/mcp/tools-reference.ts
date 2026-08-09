import {
  AccountService,
  CategoryService,
  CollectionService,
  DeliveryZoneService,
  PostalCodeDemandService,
  PostalCodePlaceService,
  SettingsService,
  SupplierService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import { nearestOf } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * REFERANS OKUMALARI (22.7) — asistanın "kör dene, hatadan öğren"den kurtulduğu yer.
 *
 * ── BULUNAN DESEN ───────────────────────────────────────────────────────────
 * Öneri araçlarının çoğu bir kaydı ADLA ya da KODLA seçtiriyor (depo kodu, bölge adı, hesap adı,
 * kategori, koleksiyon, tedarikçi) — ama o adların listesini okuyabildiği tek yer HATA MESAJIYDI:
 * *"Bölge bulunamadı: 'X'. Mevcutlar: …"*. Sekiz ayrı yerde aynı desen, üstelik tutarsız (bazısı
 * mevcutları sayıyor, bazısı saymıyor).
 *
 * Görünmeyen zararı daha büyüktü: **model hiç denemediği şeyi öneremez.** *"Şu koleksiyonu vitrine
 * çıkaralım"* cümlesi hiç kurulmuyordu, çünkü o koleksiyonun varlığından haberi yoktu. Boşluğun
 * ölçülemeyen kısmı yapılmayan önerilerdi.
 *
 * ── AYARLAR BEYAZ LİSTEYLE ──────────────────────────────────────────────────
 * `settings` tablosunda iş parametreleriyle birlikte **`analytics_session_salt`** duruyor: oturum
 * anonimleştirmesinin dayanağı. Kara liste yazsaydık yarın eklenen hassas bir ayar sessizce
 * sızardı; beyaz listede ise yeni ayar sessizce GÖRÜNMEZ — ikinci hata ucuz, birincisi geri
 * alınamaz.
 */

/**
 * Asistanın görmesi ANLAMLI olan ayarlar. Liste iş parametreleriyle sınırlı: eşikler, oranlar,
 * süreler. Kimlik taşıyanlar (hesap uuid'leri), tuz/anahtar cinsinden değerler ve büyük türetilmiş
 * JSON'lar (haftalık içgörü) bilerek dışarıda.
 */
const VISIBLE_SETTING_KEYS = [
  'min_basket_cents',
  'free_shipping_threshold_cents',
  'shipping_fee_cents',
  'cod_max_cents',
  'cash_legal_limit_cents',
  'order_cutoff_time',
  'near_expiry_percent',
  'near_expiry_discount_percent',
  'mlor_percent',
  'reservation_ttl_minutes',
  'feedback_delay_days',
  'payment_term_days',
  'packaging_unit_cost_cents',
  'route_delivery_unit_cost_cents',
  'assistant_proposal_ttl_hours',
] as const;

/**
 * Teslimat haritası — **bölge önerisinin dayanağı** (kullanıcı sorusu 09.08: *"hangi depo hangi
 * bölgeye tavsiyede bulunacağı ile ilgili bir yol haritası var mı, mevcut bölgeleri ve posta
 * kodlarını veriyor muyuz?"*). Cevap hayırdı; bu araç onu kapatıyor.
 *
 * Üç şeyi birlikte verir çünkü karar üçünü birden ister:
 * ① hangi depolar var (ve nerede) ② hangi bölge hangi depoya bağlı, hangi günler gidiyor, hangi
 * kodları kapsıyor ③ kapsanmayan talep kodları — ve her birinin **EN YAKIN mevcut bölgesi**.
 *
 * Üçüncüsü olmadan asistan yalnız "67500 çok soruldu" diyebiliyordu; artık "67500 Kuzey hattının
 * en yakın kodundan 8 km" diyebilir. Mesafe kuş uçuşudur (`domain-core/delivery/distance`) ve
 * yaklaşıktır — bir sıralama girdisi, bir karar değil.
 */
export async function deliveryMap(demandLimit: number) {
  const clamped = Math.max(1, Math.min(50, Math.floor(demandLimit)));
  const db = serviceDb();

  const [warehouses, zones, demand, notices] = await Promise.all([
    new WarehouseService(db).list({}),
    new DeliveryZoneService(db).listWithCodes({}),
    new PostalCodeDemandService(db).listTop(clamped),
    new ZoneNoticeService(db).pendingCountByPostalCode(),
  ]);

  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const covered = new Set(zones.flatMap((z) => z.postalCodes.map((c) => c.postalCode)));

  // Koordinatlar TEK turda: hem bölge kodları hem talep kodları için (referans tablosu 16 binden
  // fazla satır — kod kod sorgu atmak bu aracı yavaşlatırdı).
  const wantedCodes = [...new Set([...covered, ...demand.map((d) => d.postalCode)])];
  const places = new PostalCodePlaceService(db);
  const pointByCode = new Map<string, { lat: number; lng: number } | null>();
  await Promise.all(
    wantedCodes.map(async (code) => {
      const rows = await places.findByPostalCode(code);
      const withPoint = rows.find((r) => r.lat !== null && r.lng !== null);
      pointByCode.set(code, withPoint ? { lat: Number(withPoint.lat), lng: Number(withPoint.lng) } : null);
    }),
  );

  const zoneRows = zones.map((z) => {
    const warehouse = warehouseById.get(z.warehouseId);
    return {
      zoneId: z.id,
      zoneName: z.name,
      isActive: z.isActive,
      warehouseCode: warehouse?.code ?? '?',
      warehouseName: warehouse?.name ?? null,
      /** Haftanın günleri — 1 = Pazartesi (ISO). Boş dizi "gün atanmamış" demek, "her gün" değil. */
      weekdays: z.weekdays,
      postalCodes: z.postalCodes.map((c) => c.postalCode),
    };
  });

  return {
    warehouses: warehouses.map((w) => ({
      code: w.code,
      name: w.name,
      city: w.address?.city ?? null,
      postalCode: w.address?.postalCode ?? null,
      isActive: w.isActive,
    })),
    zones: zoneRows,
    /**
     * Kapsanmayan talep kodları — `demand_signals`in verdiği ham sayının KARAR HÂLİ: her koda en
     * yakın bölge ve mesafesi eklenmiş. `nearestZone` null ise koordinat bilinmiyor demektir
     * (referans tablosunda nokta yok) — "hiçbir bölgeye yakın değil" DEĞİL.
     */
    uncoveredDemand: demand
      .filter((d) => !covered.has(d.postalCode))
      .map((d) => {
        const target = pointByCode.get(d.postalCode) ?? null;
        const nearest = nearestOf(
          target,
          zoneRows.flatMap((z) =>
            z.postalCodes.map((code) => ({ item: { zoneName: z.zoneName, warehouseCode: z.warehouseCode, viaCode: code }, point: pointByCode.get(code) ?? null })),
          ),
        );
        return {
          postalCode: d.postalCode,
          requestCount: d.requestCount,
          waitingCustomers: notices.get(d.postalCode) ?? 0,
          nearestZone: nearest
            ? { ...nearest.item, approxDistanceKm: Math.round(nearest.distanceKm * 10) / 10 }
            : null,
        };
      }),
  };
}

/**
 * Kurulum referansı — öneri araçlarının ADLA seçtirdiği her şeyin listesi.
 *
 * Tek araçta toplanmaları bilinçli: hepsi küçük ve veriyle büyümeyen kümeler (operatörün elle
 * kurduğu kayıtlar — `CLAUDE §1` sayfalama ölçütü). Ayrı ayrı araç olsalardı model dört çağrı
 * yapıp bağlamını harcardı.
 */
export async function referenceData() {
  const db = serviceDb();
  const [accounts, categories, collections, suppliers] = await Promise.all([
    new AccountService(db).list({ activeOnly: true }),
    new CategoryService(db).list({ activeOnly: true }),
    new CollectionService(db).list({ activeOnly: true }),
    new SupplierService(db).list({ activeOnly: true }),
  ]);

  const settings = new SettingsService(db);
  const values = await Promise.all(VISIBLE_SETTING_KEYS.map(async (key) => [key, await settings.get<unknown>(key, null)] as const));

  return {
    accounts: accounts.map((a) => ({ name: a.name, type: a.type })),
    categories: categories.map((c) => ({ name: resolveLocalizedText(c.name, 'tr'), isFeatured: c.isFeatured })),
    collections: collections.map((c) => ({ name: resolveLocalizedText(c.name, 'tr'), isFeatured: c.isFeatured })),
    suppliers: suppliers.map((s) => ({ name: s.name })),
    /**
     * İş parametreleri — BEYAZ listeyle (künye yukarıda). `null` = ayar hiç girilmemiş, yani kod
     * kendi varsayılanını kullanıyor; sıfır YAZILMAZ.
     */
    settings: Object.fromEntries(values),
  };
}
