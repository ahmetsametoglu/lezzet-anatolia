/** Metnin okunduğu yüzey: müşteri web sitesi ya da native uygulama. */
export type Surface = 'web' | 'app';

/** Yalnız yüzey hâllerinden oluşan nesne: `{ web, app }`, `{ app }` ya da `{ web }`. */
type Variant = { readonly web: string } | { readonly app: string };

/** Yüzey hâlleri çözülmüş şekil — hâl nesnesi metne iner, geri kalan ağaç aynen kalır. */
export type SurfaceCopy<T> = T extends string
  ? T
  : T extends readonly (infer U)[]
    ? SurfaceCopy<U>[]
    : T extends Variant
      ? Exclude<keyof T, Surface> extends never
        ? string
        : { [K in keyof T]: SurfaceCopy<T[K]> }
      : T extends object
        ? { [K in keyof T]: SurfaceCopy<T[K]> }
        : T;

function isVariant(value: object): value is Partial<Record<Surface, string>> {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key === 'web' || key === 'app');
}

/**
 * Ortak metinden bir yüzeyin metnini çıkarır. İki yüzeyde farklı doğru olan cümle (çerez, bildirim, "uygulama" ↔ "site")
 * hâl nesnesi taşır; bir yüzeyde karşılığı olmayan liste öğesi o yüzeyde hiç çizilmez.
 */
export function copyForSurface<T>(value: T, surface: Surface): SurfaceCopy<T> {
  return resolve(value, surface) as SurfaceCopy<T>;
}

function resolve(value: unknown, surface: Surface): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item: unknown) => !(item !== null && typeof item === 'object' && isVariant(item) && item[surface] === undefined))
      .map((item: unknown) => resolve(item, surface));
  }
  if (value !== null && typeof value === 'object') {
    if (isVariant(value)) return value[surface];
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, surface)]));
  }
  return value;
}
