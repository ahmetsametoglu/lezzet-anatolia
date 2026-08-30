import { z } from 'zod';
import { WarehouseSchema } from '../entities/warehouse.schema';

/**
 * `/api/v1/operations/*` SÖZLEŞMESİ — operasyon KABUĞUNUN (bölümlerin değil) ortak dili.
 *
 * Bugün tek bir soru var burada: **"bu personel nerede çalışıyor, ve nerelerde çalışabilir?"**
 * Bölüm sözleşmeleri (`warehouse-api` · `money-api` · `management-api` · `sale-api`) bir bölümün
 * İŞİNİ taşır; bu dosya kabuğun kendi künyesini taşır ve dört bölümün de üstünde durur. Ayrı
 * dosya olmasının sebebi de bu: sorunun sahibi bölümlerden biri değil.
 */

/**
 * **Personelin çalışabileceği tek tesis** — kapsam listesinin satırı.
 *
 * Varlık şemasından TÜRETİLİYOR, elle yazılmıyor (CLAUDE §1): `code` ve `name` bir gün varlıkta
 * değişirse burası da değişir. Alan kümesi ekranın sorduğu kadar:
 *   · `id`   — seçicinin yazdığı ve `?warehouseId=` olarak tele giden kimlik,
 *   · `name` — üstbaşlığın kuyruğu ("Strasbourg Merkez"),
 *   · `code` — seçicideki ayırt edici kısa ad; iki tesisin adı benzediğinde ("Kehl Depo" ·
 *     "Kehl Şube") kodu görmeden seçim bir tahmindir,
 *   · `kind` — **tesis mi araç mı.** Kurye kapsamında aracı da vardır (`seed/people.ts`:
 *     `kurye` → str + colmar + van) ve araç bir DEPO SEÇİCİSİNDE seçenek olamaz; ayrımı süzen
 *     yüzeydir, ama ayrımı BİLDİREN yer burasıdır — süzgeci sunucuya gömmek, aracından satış
 *     yapan kuryeye aynı listeyi kapatırdı.
 */
export const StaffWarehouseSchema = WarehouseSchema.pick({ id: true, code: true, name: true, kind: true });
export type StaffWarehouse = z.infer<typeof StaffWarehouseSchema>;

/**
 * **Personelin depo kapsamı** — `GET /api/v1/operations/scope`.
 *
 * ── NEDEN AYRI BİR UÇ, `/me`YE EKLENMİŞ BİR ALAN DEĞİL ──────────────────────
 * `me-api.schema.ts` künyesi kararı yazıyor: `/me` MÜŞTERİYE BAKAN alanların kümesidir ve
 * `warehouseIds` (personel kapsamı) oradan BİLEREK dışarıda. Kapsamı oraya koymak o kararı "ama
 * bir alan daha" diye delmek olurdu — ve `/me` müşteri kabuğunun da okuduğu cevaptır: her
 * müşteri, işletmenin tesis listesini taşıyan bir zarf alırdı.
 *
 * ── NEDEN HER BÖLÜMÜN CEVABINA GÖMÜLMEDİ ────────────────────────────────────
 * Ölçülen alternatif: depo/satış/para/yönetim uçlarının HER yanıtına depo künyesi eklemek. Üç
 * gerekçeyle elendi. (1) Aynı ad dört sözleşmeden birden gelirdi — tek kaynak kuralının tam
 * tersi (CLAUDE §1). (2) Para ve yönetim okumaları depo boyutu TAŞIMAZ (`money.ts` künyesi:
 * *"defter işletmenin"*); oraya bir depo adı koymak, olmayan bir süzgeci varmış gibi
 * göstermekti. (3) Bu uç yalnız bir AD kaynağı değil, aynı zamanda kapsam SEÇİCİSİNİN kaynağı:
 * bölüm cevaplarına gömülen bir ad, seçim ekranını hiç doğuramazdı.
 *
 * ── LİSTE + ÇÖZÜM: İKİ AYRI SORU ────────────────────────────────────────────
 * `warehouses` *"nerelerde çalışabilirsin"*, `resolvedId` *"kapsamın tek başına neresini
 * çözüyor"*. İkincisi **kapının kendi kuralıdır** (`warehouseGuard`: *"kapsamda tek depo varsa
 * o, değilse söylenmeli"*) ve uç onu yeniden hesaplamaz, aynı yardımcıyı çağırır. Sunucudan
 * gelmesinin sebebi tam olarak bu: istemci "listede bir tane varsa odur" diye kendi kuralını
 * yazsaydı, kural iki yerde yaşar ve ayrıştığı gün üstbaşlıkta yazan ad, uçların gerçekte okuduğu
 * depo OLMAYABİLİRDİ.
 *
 * `resolvedId === null` = kapsam tek bir tesis değil (boş ya da birden çok) → **istemci seçmeli**
 * ve seçtiğini `?warehouseId=` ile göndermeli. Seçim bir ÖNERİDİR, yetki değil: kapı onu her
 * istekte kapsama karşı sınar (`403 warehouse_out_of_scope`).
 *
 * **Kapsamı BOŞ olan admin için `warehouses` aktif tesislerin tamamıdır** ve bu da kapının kendi
 * kararının aynası: admin depo-ÜSTÜdür, guard onun kapsam dışı kimliğini kabul eder. Boş liste
 * döndürseydik yöneticiye "hiçbir depoda çalışamazsın" denmiş olurdu — oysa doğrusu "hepsinde".
 */
export const StaffScopeSchema = z.object({
  warehouses: z.array(StaffWarehouseSchema),
  resolvedId: z.string().uuid().nullable(),
});
export type StaffScope = z.infer<typeof StaffScopeSchema>;
