import { DeliveryZoneService, PostalCodePlaceService, type Db } from '@lezzet/database';
import { CountryEnum, type Country, type DeliveryAreaList } from '@lezzet/types';

/**
 * Aracın uğradığı posta kodları, bölge dışı müşterinin "siz nereye gidiyorsunuz?" sorusunun cevabı: bölge adı değil kod gösterilir,
 * çünkü müşterinin elindeki tek ölçü kendi kodudur. Liste ülke ve yer adı öbeğinde, belirlenimci sırada ve tek turda kurulur; yalnız aktif
 * bölgeler girer, adı bilinmeyen kod `name: null` öbeğinde kalır.
 */
export async function listPublicDeliveryAreas(db: Db): Promise<DeliveryAreaList> {
  const zones = await new DeliveryZoneService(db).listWithCodes({ activeOnly: true });

  const codeKey = (country: Country, postalCode: string) => `${country}:${postalCode}`;

  const served = new Map<string, { country: Country; postalCode: string }>();
  for (const zone of zones) {
    for (const code of zone.postalCodes) served.set(codeKey(code.country, code.postalCode), code);
  }
  if (served.size === 0) return { areas: [] };

  const rows = await new PostalCodePlaceService(db).listByPostalCodes(
    [...served.values()].map((code) => code.postalCode),
  );
  const nameByCode = new Map<string, string>();
  for (const row of rows) {
    const name = row.places[0];
    if (name) nameByCode.set(codeKey(row.country, row.postalCode), name);
  }

  // İki katmanlı öbek: ülke → yer adı. Adsız kodlar ülkenin tek bir `null` öbeğinde toplanır.
  const byCountry = new Map<Country, Map<string | null, string[]>>();
  for (const code of served.values()) {
    const byName = byCountry.get(code.country) ?? new Map<string | null, string[]>();
    const name = nameByCode.get(codeKey(code.country, code.postalCode)) ?? null;
    byName.set(name, [...(byName.get(name) ?? []), code.postalCode]);
    byCountry.set(code.country, byName);
  }

  const areas = [];
  for (const country of CountryEnum.options) {
    const byName = byCountry.get(country);
    if (!byName) continue;

    const places = [...byName]
      .sort(([left], [right]) => {
        if (left === right) return 0;
        // Adsız öbek daima sonda; iki adlı öbek arasında Fransızca harmanlama.
        if (left === null) return 1;
        if (right === null) return -1;
        return left.localeCompare(right, 'fr');
      })
      .map(([name, codes]) => ({ name, codes: [...codes].sort() }));
    areas.push({ country, places });
  }
  return { areas };
}
