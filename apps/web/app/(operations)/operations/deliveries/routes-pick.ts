import { keyOfPoint, type ZoneMapPoint } from '@/components/operation/ui/zone-map-model';

interface RouteCodes {
  id: string;
  postalCodes: readonly { country: string; postalCode: string }[];
}

/** Kodu seçili rotadan başka tutan rota; bir kod tek rotada olabilir, tek tıklama ile kutu seçimi aynı kuralı okur. */
export function routeHolding<T extends RouteCodes>(routes: readonly T[], routeId: string | null, key: string): T | undefined {
  return routes.find((route) => route.id !== routeId && route.postalCodes.some((code) => keyOfPoint(code) === key));
}

/**
 * Kutudaki noktalardan rotaya eklenecekler, koda göre sıralı. Taslakta olan ve başka rotada tanımlı olan dışarıda kalır; ikincilerin
 * sayısı onayda söylenir, çünkü operatör neden eksik eklendiğini bilmeli.
 */
export function boxPick(
  inside: readonly ZoneMapPoint[],
  draftCodes: readonly { country: string; postalCode: string }[],
  routes: readonly RouteCodes[],
  routeId: string | null,
): { add: ZoneMapPoint[]; held: number } {
  const taken = new Set(draftCodes.map(keyOfPoint));
  const add: ZoneMapPoint[] = [];
  let held = 0;
  for (const point of inside) {
    const key = keyOfPoint(point);
    if (taken.has(key)) continue;
    taken.add(key);
    if (routeHolding(routes, routeId, key)) held += 1;
    else add.push(point);
  }
  add.sort((a, b) => a.postalCode.localeCompare(b.postalCode) || a.country.localeCompare(b.country));
  return { add, held };
}
