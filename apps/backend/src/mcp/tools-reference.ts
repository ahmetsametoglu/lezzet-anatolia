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
import { distanceKm, routeFitOf } from '@lezzet/domain-core';
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
 * kodları kapsıyor ③ kapsanmayan talep kodları — ve her biri için **hangi hatta uyduğu**.
 *
 * Üçüncüsü ilk yazımda "en yakın bölge" idi; kullanıcı düzeltti (09.08) ve ölçüt **mesafeden
 * güzergâha** döndü: *"araba ana yol üzerinde ilerlerken sağındaki solundaki kodlara dağıtım
 * yapabilir, ama ters yöndeki bir noktaya gidip de dağıtım yapamaz."* Artık her aday hat için
 * motorun kararı geliyor (`routeFitOf`) — hattın üzerinde mi, uzantısında mı, sapma mı, ters yön
 * mü. Sayılar kuş uçuşudur ve yaklaşıktır: bir ELEME girdisi, bir rota hesabı değil.
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
  // DEPO kodları da listede: hattın başlangıcı deponun konumudur, o çözülmezse güzergâh uyumu
  // hiç hesaplanamaz (ilk yazımda unutulmuştu — araç sessizce boş aday listesi dönüyordu).
  const warehouseCodes = warehouses.flatMap((w) => { const c = postalOf(w.address); return c ? [c] : []; });
  const wantedCodes = [...new Set([...covered, ...demand.map((d) => d.postalCode), ...warehouseCodes])];
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
      /** Deponun konumu — hattın BAŞLANGICI. Adresin posta kodundan çözülür; yoksa uyum hesaplanamaz. */
      warehousePoint: pointOfWarehouse(warehouse?.address, pointByCode),
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
      postalCode: postalOf(w.address),
      isActive: w.isActive,
    })),
    zones: zoneRows,
    /**
     * Kapsanmayan talep kodları — `demand_signals`in ham sayısının KARAR HÂLİ.
     *
     * ── MESAFE DEĞİL GÜZERGÂH (kullanıcı düzeltmesi 09.08) ────────────────────
     * İlk yazımda yalnız "en yakın bölge" vardı. Kullanıcı düzeltti: *"araba ana yol üzerinde
     * ilerlerken sağındaki solundaki kodlara dağıtım yapabilir, ama ters yöndeki bir noktaya
     * gidip de dağıtım yapamaz."* Mesafe yanıltıyor — hattın 5 km ötesindeki ters yön, hattın
     * üzerindeki 15 km'den pahalıdır, çünkü araç zaten oraya gidiyor.
     *
     * Her aday bölge için motorun kararı geliyor (`routeFitOf`): `on_route` · `extends_route` ·
     * `detour` · `opposite`. Adaylar **uyum sırasına** göre dizili, mesafeye göre değil.
     */
    uncoveredDemand: demand
      .filter((d) => !covered.has(d.postalCode))
      .map((d) => {
        const target = pointByCode.get(d.postalCode) ?? null;
        const candidates = zoneRows.flatMap((z) => {
          const origin = z.warehousePoint;
          // Hattın "ucu": depodan EN UZAK kapsanan kod. Hattın istikametini o belirler; merkez
          // alsaydık uzun bir hattın yönü kısalır ve ötesindeki kod "sapma" görünürdü.
          const end = nearestFarthest(origin, z.postalCodes.map((c) => pointByCode.get(c) ?? null));
          if (!origin || !end || !target) return [];
          const fit = routeFitOf({ origin, routeEnd: end, target });
          // Yön ölçülemeyen bölge (bütün kodları deponun üstünde) LİSTEDEN DÜŞMEZ, aşağıdaki ayrı
          // kovaya gider: elemek, o bölgeyi asistanın gözünden tamamen silerdi.
          if (!fit) return [];
          return [{ zoneName: z.zoneName, warehouseCode: z.warehouseCode, weekdays: z.weekdays, ...fit }];
        });

        /**
         * Yönü ölçülemeyen bölgeler — yalnız mesafeyle. Merkez bölgeleri böyledir: kodları deponun
         * üstünde durduğu için hattın istikameti yoktur. **"Uymuyor" DEĞİL, "yön bilinmiyor"** —
         * karar yine patronun, ama asistan bu bölgeyi hiç görmemiş olmasın.
         */
        const withoutDirection = zoneRows.flatMap((z) => {
          const origin = z.warehousePoint;
          const end = nearestFarthest(origin, z.postalCodes.map((c) => pointByCode.get(c) ?? null));
          if (!origin || !end || !target) return [];
          if (routeFitOf({ origin, routeEnd: end, target })) return [];
          const km = distanceKm(origin, target);
          return km === null ? [] : [{ zoneName: z.zoneName, warehouseCode: z.warehouseCode, approxDistanceKm: Math.round(km * 10) / 10 }];
        });

        const rank: Record<string, number> = { on_route: 0, extends_route: 1, detour: 2, opposite: 3 };
        candidates.sort((a, b) => rank[a.fit]! - rank[b.fit]! || a.crossKm - b.crossKm);

        return {
          postalCode: d.postalCode,
          requestCount: d.requestCount,
          waitingCustomers: notices.get(d.postalCode) ?? 0,
          /**
           * En uygun ÜÇ aday. Boş dizi "koordinat bilinmiyor" demektir (referans tablosunda nokta
           * yok) — "hiçbir hatta uymuyor" DEĞİL.
           */
          zoneCandidates: candidates.slice(0, 3),
          zonesWithoutDirection: withoutDirection,
        };
      }),
  };
}

/**
 * Deponun posta kodu — `address` serbest bir jsonb (`z.record(z.unknown())`), yani tip güvencesi
 * YOK. Boş/eksik hâlde `null` döner ve güzergâh uyumu o depo için hiç hesaplanmaz; uydurma bir
 * başlangıç noktası, bütün yön hesabını sessizce yanlış yapardı.
 */
function postalOf(address: Record<string, unknown> | null | undefined): string | null {
  const raw = address?.postalCode ?? address?.postal_code;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function pointOfWarehouse(
  address: Record<string, unknown> | null | undefined,
  points: Map<string, { lat: number; lng: number } | null>,
) {
  const code = postalOf(address);
  return code ? (points.get(code) ?? null) : null;
}

/** Bir kümedeki, kaynağa EN UZAK nokta — hattın istikametini veren uç. */
function nearestFarthest(origin: { lat: number; lng: number } | null, points: ({ lat: number; lng: number } | null)[]) {
  if (!origin) return null;
  let best: { lat: number; lng: number } | null = null;
  let bestKm = -1;
  for (const p of points) {
    const km = distanceKm(origin, p);
    if (km === null) continue;
    if (km > bestKm) {
      bestKm = km;
      best = p;
    }
  }
  return best;
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
