import 'server-only';
import { DeliveryZoneService, PostalCodePlaceService, WarehouseService, serviceDb } from '@lezzet/database';
import type { Country } from '@lezzet/types';

/**
 * **BÖLGE ÖNERİSİNİN HARİTA BAĞLAMI** (22.36) — `zone_extend` gövdesinin okuması.
 *
 * ── NEDEN AYRI BİR OKUMA, `routes-read`İN YENİDEN KULLANIMI DEĞİL ───────────
 * Rota sayfasının okuması (`readRoutes`) tam olarak bu bağlamı üretiyor ama iki sebeple buradan
 * çağrılamaz: *(1)* kardeş sayfa klasöründe yaşıyor ve oradan yalnız `*-url` ithal edilebilir
 * (`STACK §7`, `docs:check` zorluyor); *(2)* çok daha fazlasını okuyor — ağırlık istatistikleri,
 * öneri motoru, talep liderlik tablosu. Kuyruğun içindeki diyalog o yükün hiçbirini kullanmıyor.
 *
 * Bu yüzden okuma DAR: bölgeler + kodların koordinatları + deponun adı. Üç sorgu, hepsi doğal
 * tavanlı küme (`CLAUDE §1`) — bölgeler operatörün elle kurduğu bir liste, kodlar o bölgelerin
 * kendi kodları.
 *
 * ── BOŞTAKİ KODLAR BU HARİTADA YOK ve bu bilinçli ───────────────────────────
 * Rota sayfası boştaki kodları görüş alanına göre okuyor (`readMapCodesAction`, kaydırmayla
 * değişen bir istek akışı). Diyalogda o akış YAZILMADI: kuyruğun sorusu *"asistanın önerdiği
 * kodları kabul ediyor muyum"*dur, *"başka nereye gidelim"* değil. Operatör yeni bir kod keşfetmek
 * isterse rota sayfası hâlâ orada ve işi o yapıyor — diyalogda ikinci bir keşif aracı kurmak,
 * kararı genişletip önerinin kendisini gölgede bırakırdı.
 */

/** Haritanın çizeceği tek nokta + hangi bölgenin olduğu (`null` = hiçbirinin, yani boşta). */
export interface ZoneProposalPoint {
  country: Country;
  postalCode: string;
  lat: number;
  lng: number;
  places: readonly string[];
  /** Kodu bugün tutan bölgenin kimliği; `null` ise kod boşta. */
  zoneId: string | null;
}

export interface ZoneProposalContext {
  zoneId: string;
  zoneName: string;
  /** Bölgenin çıktığı depo — kararın coğrafi çıpası; adı yoksa `null` yazılır, uydurulmaz. */
  warehouseName: string | null;
  /** Bölgenin BUGÜNKÜ kodları — dilekçenin ekleyeceği kodlar bunların üstüne biner. */
  currentCodes: Array<{ country: Country; postalCode: string }>;
  points: ZoneProposalPoint[];
}

/**
 * Dilekçelerin bağlamı — bölge kimliği başına bir kayıt.
 *
 * `extraCodes` dilekçelerin ÖNERDİĞİ kodlar: onlar henüz hiçbir bölgede değil, dolayısıyla bölge
 * okumasından gelmezler; koordinatları ayrıca istenmezse haritada hiç çizilmezler — yani öneri
 * görünmez olurdu.
 */
export async function readZoneProposalContext(
  zoneIds: readonly string[],
  extraCodes: readonly string[] = [],
): Promise<Record<string, ZoneProposalContext>> {
  if (zoneIds.length === 0) return {};

  const db = serviceDb();
  // Bölgelerin TAMAMI okunuyor, yalnız istenenler değil: harita "bu kod başka rotada" hâlini
  // çizebilmeli, yoksa operatör çakışan bir kodu boşta sanıp ekler ve kayıt kısıtla reddedilir —
  // sebebi ancak kaydetmeye basınca görünen bir ret.
  const [zones, warehouses] = await Promise.all([
    new DeliveryZoneService(db).listWithCodes(),
    new WarehouseService(db).list(),
  ]);

  const wanted = new Set(zoneIds);
  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));

  const zoneOfCode = new Map<string, string>();
  for (const zone of zones) {
    for (const code of zone.postalCodes) zoneOfCode.set(`${code.country}:${code.postalCode}`, zone.id);
  }

  const codeSet = [...new Set([...zones.flatMap((z) => z.postalCodes.map((c) => c.postalCode)), ...extraCodes])];
  const places = codeSet.length > 0 ? await new PostalCodePlaceService(db).listByPostalCodes(codeSet) : [];

  // Koordinatı olmayan kod ATLANIR: haritada `(0, 0)`a düşen nokta Gine Körfezi'nde durur ve
  // operatöre "bu kod orada" der (19.18'in kendi kuralı, rota sayfası da aynısını yapıyor).
  const points: ZoneProposalPoint[] = places
    .filter((place) => place.lat !== null && place.lng !== null)
    .map((place) => ({
      country: place.country,
      postalCode: place.postalCode,
      lat: place.lat!,
      lng: place.lng!,
      // Adlar HAM (`OB-04`): kaç ad yazılacağı çizim anının kararı.
      places: place.places,
      zoneId: zoneOfCode.get(`${place.country}:${place.postalCode}`) ?? null,
    }));

  const out: Record<string, ZoneProposalContext> = {};
  for (const zone of zones) {
    if (!wanted.has(zone.id)) continue;
    out[zone.id] = {
      zoneId: zone.id,
      zoneName: zone.name,
      warehouseName: warehouseName.get(zone.warehouseId) ?? null,
      currentCodes: zone.postalCodes.map((c) => ({ country: c.country, postalCode: c.postalCode })),
      points,
    };
  }
  return out;
}
