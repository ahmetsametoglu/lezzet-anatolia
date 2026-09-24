import {
  AccountService,
  BundleService,
  CategoryService,
  CollectionService,
  DeliveryZoneService,
  MovementNatureService,
  PostalCodeDemandService,
  PostalCodePlaceService,
  SettingsService,
  WarehouseService,
  ZoneNoticeService,
  serviceDb,
} from '@lezzet/database';
import { distanceKm, routeFitOf, warehousePoint, warehousePostalCode } from '@lezzet/domain-core';
import { resolveLocalizedText } from '@lezzet/types';

/**
 * Referans okumaları: öneri araçları kaydı adla ya da kodla seçtirir ve model hiç görmediği kaydı öneremez, bu yüzden adların listesi
 * hata mesajından değil buradan okunur. Ayarlar beyaz listeyle verilir, çünkü tabloda oturum tuzu gibi hassas satırlar da durur ve kara
 * liste yeni hassas ayarı sessizce sızdırırdı.
 */

/** Asistanın görmesi anlamlı olan iş parametreleri (eşikler, oranlar, süreler); kimlik, tuz/anahtar ve büyük türetilmiş JSON bilerek dışarıda. */
const VISIBLE_SETTING_KEYS = [
  'min_basket_cents',
  'free_shipping_threshold_cents',
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
 * Teslimat haritası, bölge önerisinin dayanağı: depolar, bölgelerin depo, gün ve kodları ile kapsanmayan talep kodlarının her aday hatta
 * uyumu birlikte verilir, çünkü karar üçünü birden ister. Ölçüt mesafe değil güzergâhtır (`routeFitOf`); sayılar kuş uçuşu ve yaklaşıktır.
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

  // Koordinatlar tek turda okunur (referans tablosu 16 binden fazla satır); depo kodları da listede, çünkü hattın başlangıcı deponun
  // konumudur ve o çözülmezse güzergâh uyumu hesaplanamaz.
  const warehouseCodes = warehouses.flatMap((w) => { const c = warehousePostalCode(w.address); return c ? [c] : []; });
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
      warehousePoint: warehousePoint({ ...warehouse, centroidOf: (code) => pointByCode.get(code) }),
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
      postalCode: warehousePostalCode(w.address),
      isActive: w.isActive,
    })),
    zones: zoneRows,
    /**
     * Kapsanmayan talep kodları, `demand_signals`in karar hâli: her aday bölge için motorun güzergâh kararı gelir (`on_route` ·
     * `extends_route` · `detour` · `opposite`) ve adaylar uyuma göre dizilir, çünkü ters yöndeki yakın kod hattın üzerindeki uzak koddan pahalıdır.
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
         * Yönü ölçülemeyen bölgeler (kodları deponun üstünde duran merkez bölgeleri) yalnız mesafeyle verilir: "uymuyor" değil "yön
         * bilinmiyor"dur ve asistan bu bölgeyi yine görmelidir.
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
 * Kurulum referansı: öneri araçlarının adla seçtirdiği küçük, veriyle büyümeyen kümeler tek araçta verilir ki model birkaç çağrıda
 * bağlamını harcamasın. Tedarikçi ve cari hariçtir, çünkü kritik kayıt toplu verilmez, faturadaki kimlikle nokta atışı bulunur.
 */
export async function referenceData() {
  const db = serviceDb();
  const [accounts, categories, collections, natures, bundles] = await Promise.all([
    new AccountService(db).list({ activeOnly: true }),
    new CategoryService(db).list({ activeOnly: true }),
    new CollectionService(db).list({ activeOnly: true }),
    // Tür sözlüğü: `propose_money_movement.nature` buradaki slug ya da adı ister ve model onu başka yerden göremez.
    new MovementNatureService(db).list({ activeOnly: true }),
    // Paketler de vitrine çıkarılabilir; `propose_featured_flag`ın `bundle` hedefi paketin adını buradan okur.
    new BundleService(db).listAll({ activeOnly: true }),
  ]);

  const settings = new SettingsService(db);
  const values = await Promise.all(VISIBLE_SETTING_KEYS.map(async (key) => [key, await settings.get<unknown>(key, null)] as const));

  return {
    accounts: accounts.map((a) => ({ name: a.name, type: a.type })),
    // Her ad bir `propose_*` girdisine birebir verilebilir; kimlik yazılmaz, çünkü uuid modelin bağlamında yer kaplar ve yanlış
    // hatırlandığında panelde "(silinmiş kayıt)" diye çizilecek bir kalem doğurur.
    categories: categories.map((c) => ({ name: resolveLocalizedText(c.name, 'tr'), isFeatured: c.isFeatured })),
    collections: collections.map((c) => ({ name: resolveLocalizedText(c.name, 'tr'), isFeatured: c.isFeatured })),
    bundles: bundles.map((b) => ({ name: resolveLocalizedText(b.name, 'tr'), isFeatured: b.isFeatured })),
    natures: natures.map((n) => ({ slug: n.slug, label: n.label, direction: n.direction })),
    /**
     * İş parametreleri — BEYAZ listeyle (künye yukarıda). `null` = ayar hiç girilmemiş, yani kod
     * kendi varsayılanını kullanıyor; sıfır YAZILMAZ.
     */
    settings: Object.fromEntries(values),
  };
}
