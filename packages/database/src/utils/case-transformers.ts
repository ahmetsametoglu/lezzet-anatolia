// camelCase↔snake_case dönüştürücüler. Dışa yalnız obje dönüştürücüleri (dbToApp/appToDb)
// verilir; string primitifleri (snakeToCamel/camelToSnake) iç ayrıntıdır — ihtiyaç olursa dışa açılır.

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformKeys(obj: any, transformer: (key: string) => string): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformKeys(item, transformer));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[transformer(key)] = typeof value === 'object' ? transformKeys(value, transformer) : value;
  }
  return result;
}

/** DB satırı (snake_case) → App modeli (camelCase) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToApp<T = any>(row: unknown): T {
  return transformKeys(row, snakeToCamel) as T;
}

/** App modeli (camelCase) → DB satırı (snake_case) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function appToDb<T = any>(data: unknown): T {
  return transformKeys(data, camelToSnake) as T;
}
