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
//
// **Tarandı (04.08):** ne migration'larda `_<rakam>` içeren bir kolon adı var, ne şemalarda ters
// yönü kıracak bir alan (`[a-z]+[0-9][A-Z]`), ne de canlı şemada. Yani bugün YALNIZ bu künye var,
// sessizce yanlış okunan bir alan yok — tuzak kayıtlı, örneği yok.

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * ── DÖNÜŞÜM SATIR DÜZEYİNDE KALIR; jsonb İÇERİĞİNE İNMEZ (kullanıcı kararı 15.08) ────────────
 *
 * **Neden.** Kolon adı şemanın SÖZLÜĞÜDÜR — `unit_price_cents` ↔ `unitPriceCents` bir adlandırma
 * köprüsüdür ve çevrilmesi meşrudur. jsonb anahtarı ise uygulamanın yazdığı **VERİDİR**. Veriyi
 * çevirmek başka bir iştir: `assistant_proposal.payload` diskte ne Zod şemasına, ne onu yazan MCP
 * aracının çıktısına, ne de ekrana benziyordu — ve `CLAUDE.md §0` teşhisin veritabanından
 * ölçülerek yapılacağını söylüyor, yani her teşhis zihinden bir geri çevirme taşıyordu.
 *
 * Kural zaten `CLAUDE.md §1`de ve `STACK.md:211`de yazılıydı (*"dönüştürücünün jsonb değerini
 * çevirmemesi sağlanır"*) ama **koda hiç geçmemişti**. Fark edilmemesinin sebebi de kayıtlı:
 * kural `LocalizedText` için yazılmıştı ve `tr`/`fr`/`de` anahtarlarında ne alt tire ne büyük harf
 * var — dönüştürücü onlara iki yönde de dokunmuyor. Yani koruma, yazıldığı durumda zaten gereksizdi;
 * gerekli olduğu durumlar (serbest anahtarlı ve dış kaynaklı jsonb) sonradan geldi.
 *
 * **Yukarıdaki rakam tuzağı da bu değişiklikle payload'ın İÇİNDE yapısal olarak imkânsızlaştı.**
 * Tuzak kolon adları için taranmıştı (*"örneği yok"*); jsonb içeriği hiç taranmamıştı ve oraya bir
 * gün `line_1`/`step_2` girse hata şema doğrulamasında, sebebinden uzakta patlayacaktı.
 *
 * ── VARSAYILAN TERS ÇEVRİLDİ: inmemek esas, inmek BEYAN ─────────────────────────────────────
 * Alternatif kurgu *"servisler jsonb alanlarını bildirsin, çevirici oraya girmesin"*di. Ters
 * seçildi ve gerekçe **arızanın sesi**: jsonb beyanı unutulursa veri SESSİZCE bozulur; gömülü
 * ilişki beyanı unutulursa iç satır alt tireli kalır ve Zod o sorguda **anında** patlar. Üstelik
 * beyan, elle yazılmış `select` dizesinin yanında durur — görünür yerdedir; jsonb kolonu ise çağrı
 * yerinde hiç görünmez.
 *
 * **Gömülü ilişki alt ağacı TAM çevrilir** (`transformDeep`): orası başka bir tablonun satırıdır ve
 * iki katlı gömme var (`stock` → `variant` → `product`). Alt ağaçtaki bir jsonb da çevrilir — bugün
 * seçilenler ya skaler ya `LocalizedText` (etkisiz), ama bir gün gömülü seçime serbest anahtarlı
 * bir jsonb girerse onu projeksiyondan çıkarın.
 */

/** Alt ağacı bütünüyle çevirir — YALNIZ gömülü ilişki satırları için. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformDeep(obj: any, transformer: (key: string) => string): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformDeep(item, transformer));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[transformer(key)] = typeof value === 'object' ? transformDeep(value, transformer) : value;
  }
  return result;
}

/**
 * Satır düzeyi dönüşüm: anahtarlar çevrilir, DEĞERLER olduğu gibi kalır.
 *
 * `embeds` yalnız okuma yönünde anlamlı ve **çevrilmiş (app tarafı) adla** karşılaştırılır —
 * `moneyFields` ile aynı yazım, ki beyan eden kişi iki farklı ad düzeni taşımasın. Örnek:
 * `order_item!inner(...)` gömmesi için beyan `orderItem`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformRow(obj: any, transformer: (key: string) => string, embeds: ReadonlySet<string>): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => transformRow(item, transformer, embeds));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const outKey = transformer(key);
    result[outKey] = embeds.has(outKey) ? transformDeep(value, transformer) : value;
  }
  return result;
}

const NO_EMBEDS: ReadonlySet<string> = new Set();

/**
 * DB satırı (snake_case) → App modeli (camelCase).
 *
 * `embeds`: bu sorgunun gömülü ilişki takma adları (`alias:tablo(...)`), app tarafı yazımıyla.
 * Verilmezse hiçbir değere inilmez — jsonb içeriği olduğu gibi döner.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbToApp<T = any>(row: unknown, embeds: ReadonlySet<string> = NO_EMBEDS): T {
  return transformRow(row, snakeToCamel, embeds) as T;
}

/**
 * App modeli (camelCase) → DB satırı (snake_case).
 *
 * **Hiçbir zaman inmez.** Yazma yolunda gömülü ilişki diye bir şey yok (ilişki satırı yazılmaz) ve
 * inen tek şey jsonb içeriği olurdu — yani bu fonksiyonun derinliği yalnız zarar veriyordu.
 * RPC gövdeleri etkilenmez: `executeRpc` parametreleri hiç çevirmiyor, `appToDb` ile çevrilen tek
 * yer (`stock-intake.service.ts`) DÜZ satır nesneleri geçiriyor — üst düzey dönüşüm sürüyor.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function appToDb<T = any>(data: unknown): T {
  return transformRow(data, camelToSnake, NO_EMBEDS) as T;
}
