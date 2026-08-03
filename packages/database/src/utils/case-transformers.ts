// camelCase↔snake_case dönüştürücüler. Dışa yalnız obje dönüştürücüleri (dbToApp/appToDb)
// verilir; string primitifleri (snakeToCamel/camelToSnake) iç ayrıntıdır — ihtiyaç olursa dışa açılır.
//
// ⚠ **KOLON ADINDA `_<rakam>` KULLANMAYIN** (yaşandı 04.08). Dönüşüm rakamı görmüyor:
// `rating_1_count` → `rating_1Count` çıkar, `rating1Count` değil — şema alanı bulamaz ve satır
// `Required` hatasıyla düşer. Hata okuma anında ve şemada patladığı için sebebi uzakta görünür.
//
// **Düzeltilmedi ve düzeltilmemeli:** regex'i rakam görecek hâle getirmek ters yönü kırar —
// `camelToSnake('line1')` bugün `line1` veriyor (doğru, `address.line1`), rakama duyarlı bir
// sürüm `line_1` üretir ve adres tablosu kırılır. Bir tarafı düzeltmek ötekini bozuyor.
//
// Çare ADLANDIRMADA: rakamı ayıran alt çizgi kullanmayın. Birden çok sayı taşınacaksa tek bir
// dizi/jsonb kolonu (`rating_breakdown int[]`) hem bu tuzağı hem "biri güncellendi öteki unutuldu"
// sınıfını birden kapatır.

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
