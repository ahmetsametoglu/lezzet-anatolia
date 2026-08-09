import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { PostalCodePlaceService, serviceDb } from '@lezzet/database';
import { findShippingWarehouse, resolvePlaceByPostalCode, type PostalCodeResolution } from '@lezzet/domain-core';
import { readDeliveryInputs } from './inputs';
import type { PlaceAnswer } from './place-types';

/**
 * Yerin SUNUCU tarafı (19.9) — RSC'lerin "hangi deponun stoğunu okuyacağım" sorusu.
 *
 * Katalog, anasayfa, ürün detayı ve sepet render anında depoyu bilmek zorunda. Yer tarayıcıda
 * (`localStorage`) durduğu sürece bunu bilemiyorlardı ve hepsi depo-üstü okuyordu — dört
 * `BEKLEYEN(19.7)` işareti tam olarak buydu. Çerez o boşluğu kapatıyor.
 *
 * ── ÇÖZÜM İSTEK BAŞINA BİR KEZ ───────────────────────────────────────────────
 * `cache()` React'in istek-kapsamlı belleği: aynı render'da katalog + hap + sepet üç kez sorsa da
 * tek tur çalışır. Bu bir optimizasyon değil bir TUTARLILIK aracı — aynı sayfada iki farklı depo
 * cevabı çıkması, listenin bir yerde "var" öteki yerde "yok" demesi demekti.
 */

/**
 * Yerin çözülmüş hâli + müşterinin cevabı. `answer` null ise yer hiç bilinmiyor.
 *
 * Bugün dışa AÇILMIYOR: tek tüketici `readPlaceWarehouseId` ve fazlasına ihtiyaç duyan yok.
 * `ambiguous`/`unknown` hâllerini ekranda gösterecek olan 19.7 geldiğinde `resolution` alanıyla
 * birlikte export edilir — o güne kadar açık durması ölü bir kapı olurdu.
 */
interface PlaceContext {
  answer: PlaceAnswer | null;
  resolution: PostalCodeResolution | null;
  /**
   * Okumaların kullanacağı depo — **null "yer bilinmiyor" demektir** ve bu normaldir (K1: posta
   * kodu zorunlu değil). Null'da okuma depo-üstüne düşer ve orada "var" bir vaat DEĞİL, "yok"un
   * dayanağıdır (C3).
   */
  warehouseId: string | null;
  /**
   * Müşterinin ülkesinin KARGO deposu — `warehouseId`'den ayrı bir soru (19.10).
   *
   * Rota içindeki müşteri için de doludur ve dolu olması gerekir: "bu ürün senin deponda yok ama
   * kargoyla gönderebiliriz" cevabı ancak kargo deposunun stoğu bilinerek verilebilir. Yer çözümü
   * bunu kendi içinden veremez — rota bulduğunda kargo deposunu hiç aramaz.
   *
   * `null` = yer bilinmiyor ya da o ülkeye kargo yapılmıyor.
   */
  shippingWarehouseId: string | null;
}

const EMPTY: PlaceContext = { answer: null, resolution: null, warehouseId: null, shippingWarehouseId: null };

/**
 * Posta kodunun ülke adayları — istek başına bir kez (aynı kod birden çok bileşen tarafından
 * sorulabilir). Tablo migration'la doğar ve yılda bir yenilenir (`pnpm postal:build`), yani veri
 * bayatlamaz; burada tek istenen aynı istekte iki kez sorgu atmamak.
 */
const getPostalMatches = cache(async (postalCode: string) =>
  new PostalCodePlaceService(serviceDb()).findByPostalCode(postalCode),
);

/**
 * İstek başına yer bağlamı. Çerez yoksa ya da çözülemiyorsa **yer bilinmiyor** sayılır — hata
 * fırlatılmaz: yerin bilinmemesi bir arıza değil, cevaplanmamış bir sorudur (`place-types`).
 */
const readPlaceContext = cache(async (): Promise<PlaceContext> => {
  const answer = await readPlaceAnswerFromCookie();
  if (!answer) return EMPTY;

  const [{ zones, warehouses }, matches] = await Promise.all([readDeliveryInputs(), getPostalMatches(answer.postalCode)]);

  // Müşterinin cevabındaki ülke SÜZGEÇ olarak uygulanır: `ambiguous` hâlini bir kez çözüp cevabı
  // sakladık, her istekte yeniden sormuyoruz. Kod o ülkede geçerli değilse (çerez elle
  // düzenlenmiş ya da veri değişmiş) süzgeç boşalır ve çözüm doğal olarak `unknown`'a düşer.
  const scoped = matches.filter((m) => m.country === answer.country);
  const resolution = resolvePlaceByPostalCode(answer.postalCode, scoped, zones, warehouses);

  const resolved = resolution.kind === 'route' || resolution.kind === 'shipping';
  return {
    answer,
    resolution,
    /**
     * **YALNIZ ROTA DEPOSU** (09.08 · kullanıcı bildirimi, denetim+müşteri şeridi ölçtü).
     *
     * ── ÖNCEKİ HÂL VE BEDELİ ──────────────────────────────────────────────────
     * Burası `resolution.warehouseId`i olduğu gibi yayıyordu. Ama çözüm `shipping` hâlinde o alana
     * **kargo deposunun** kimliğini koyuyor (`warehouse-resolve.ts:96`) — yani tek kutu iki ayrı
     * şey taşıyordu: rota hâlinde "aracın çıktığı depo", kargo hâlinde "kargonun çıktığı depo".
     * Okuyan taraf ayırt edemiyor ve hepsini birincisi sanıyordu.
     *
     * Ölçüldü (aynı 12 ürün, `stockStatusOf`):
     *   67000 rota içi            → available 12
     *   75011 ROTA DIŞI           → available 12   ← Strasbourg'daymış gibi
     *   KEHL (rota içi, yerelde yok) → shipping 5 · available 5 · elsewhere 2   ← doğru çalışıyor
     *
     * Yani dört hâl motoru SAĞLAM; bozuk olan girdiydi. Rota dışındaki müşteriye "ücretsiz kapı
     * teslimi" işareti veriliyor, kargo grubu hiç doğmuyor ve iki-checkout akışı tetiklenmiyordu.
     *
     * ── ÜÇ HÂL ARTIK AYIRT EDİLEBİLİR, ÜÇÜNCÜ BİR ALANA GEREK YOK ─────────────
     *   (null, null)   → yer bilinmiyor        → okuma ağ-geneline düşer (C3)
     *   (rota, kargo)  → rota içi              → yerel havuz o deponun stoğu
     *   (null, kargo)  → ROTA DIŞI             → yerel havuz BOŞ, yalnız kargo
     *
     * `mode` diye bir alan eklemedim bilerek: türetilebilen bir şeyi ayrıca taşımak, iki kaynağın
     * bir gün ayrışması demektir. Alanların KENDİSİ artık tek anlam taşıyor — kök sebep buydu.
     */
    warehouseId: resolution.kind === 'route' ? resolution.warehouseId : null,
    // Kargo deposu ÜLKEDEN türer, rotadan değil: rota içindeki müşteri de kargo dolgusu alabilir.
    shippingWarehouseId: resolved ? (findShippingWarehouse(resolution.country, warehouses)?.id ?? null) : null,
  };
});

/**
 * Okumaların ihtiyacı: yerel depo + kargo deposu. İKİSİ BİRLİKTE döner çünkü vitrin kararı ikisini
 * de ister — "yerelde yok" tek başına "tükendi" demek DEĞİLDİR (C3), kargo deposunda varsa ürün
 * hâlâ satılabilir. Ayrı ayrı okunsalardı bir çağıran ikincisini unutur ve sistem müşteriyi
 * tanıdıkça daha az satardı.
 */
export async function readPlaceWarehouses(): Promise<{ warehouseId: string | null; shippingWarehouseId: string | null }> {
  const { warehouseId, shippingWarehouseId } = await readPlaceContext();
  return { warehouseId, shippingWarehouseId };
}

/**
 * Müşterinin CEVABI — çerezden, çözülmeden (19.12).
 *
 * Yalnız yerin kendisini isteyen çağıranlar için: "gelince haber ver" kaydı hangi yere ait olduğunu
 * bilmek zorunda ama depoyu bilmesine gerek yok — söz müşterinin adresi hakkındadır, bizim iç
 * coğrafyamız hakkında değil.
 */
export const readPlaceAnswer = cache(readPlaceAnswerFromCookie);

/**
 * **Ayar kapsamının yer ekseni** (07.15) — ülke + bölge + depo, tek okumadan.
 *
 * `readPlaceWarehouses` yetmiyordu: kapsamlı ayar `zone` ve `country` eksenlerini de sorabiliyor
 * (bölge asgari sepeti, DE kargo tarifesi) ve o iki değer bu çözümün İÇİNDE zaten duruyordu —
 * dışarı verilmediği için kimse okuyamıyordu.
 *
 * **Bölge kimliği ÇÖZÜMDEN gelir, çerezten değil** ve bu bir güvenlik sınırı: çerezi istemci
 * yazabilir; çözülmüş bölge kimliğini oradan okusaydık uydurulmuş bir çerez hangi asgari sepetin
 * uygulanacağını belirlerdi. Aynı gerekçe `warehouseId` için de yazılı (bu dosyanın künyesi).
 *
 * ── BEKLEYEN(07.15): HENÜZ ÇAĞIRANI YOK — ve YARISI BAĞLANMAYACAK ────────────
 * Ölçüldü (08.08, `knip`): bu kapı yazıldı ama `getCartView`'a `country`/`zoneId` geçiren tek
 * çağıran yok — üç çağıran da yalnız `readPlaceWarehouses()` yayıyor. Yani kapsamlı ayarın ülke ve
 * bölge eksenleri hâlâ boş: DE kargo tarifesi ve bölge asgari sepeti okunmuyor.
 *
 * **Tek yüzeyi bağlamak, hiçbirini bağlamamaktan KÖTÜDÜR** (`settings-scope.ts` künyesi): sepet ile
 * checkout aynı anahtarı farklı kapsamla okursa sepette "13 € eşik" yazıp checkout'ta 0 € uygulanır
 * ve müşteri arada ne olduğunu anlamaz. Bu yüzden bağlama üç çağıranın hepsinde AYNI turda yapılır
 * (`lib/cart/actions.ts` · `lib/order/checkout-draft.ts` · `app/(customer)/…/checkout/actions.ts` —
 * sonuncusu müşteri şeridinin dosyası). 07.15'in kalan ayağı; `knip` o güne dek bu satırı gösterir.
 */
export async function readPlaceScope(): Promise<{ country: string | null; zoneId: string | null; warehouseId: string | null }> {
  const { answer, resolution, warehouseId } = await readPlaceContext();
  return {
    country: answer?.country ?? null,
    zoneId: resolution?.kind === 'route' ? resolution.zoneId : null,
    warehouseId,
  };
}

/**
 * **Yerin TESLİMAT KİPİ** — "adresime gönderilebilir" çipinin dayanağı (08.27).
 *
 * Üç hâl ve üçü de ekranda farklı davranış gerektiriyor:
 *   `unknown`  — posta kodu yok ya da çözülemedi. **Ortada "adresim" YOK.**
 *   `route`    — bölge içi: rota aracı gidiyor, yani soğuk zincir dâhil HER ŞEY ulaşabiliyor.
 *   `shipping` — bölge dışı: yalnız kargolanabilir kalemler ulaşabiliyor.
 *
 * **Neden ayrı bir kapı:** `readPlaceWarehouses` iki depo kimliği veriyor ve ekran onlardan kipi
 * TÜRETEMEZ — `warehouseId` dolu olması "rota" demek değil (kargo çözümü de depo verir). Türetmeyi
 * ekrana bırakmak, aynı üç hâlin her sayfada yeniden ve biraz farklı hesaplanması olurdu.
 *
 * Kip ÇÖZÜMDEN okunur, çerezten değil — `readPlaceScope`'un künyesindeki güvenlik sınırının aynısı:
 * çerezi istemci yazabilir, uydurulmuş bir çerez katalogun neyi göstereceğini belirlememeli.
 */
export type PlaceMode = 'unknown' | 'route' | 'shipping';

export async function readPlaceMode(): Promise<PlaceMode> {
  const { resolution } = await readPlaceContext();
  if (resolution?.kind === 'route') return 'route';
  if (resolution?.kind === 'shipping') return 'shipping';
  return 'unknown';
}

async function readPlaceAnswerFromCookie(): Promise<PlaceAnswer | null> {
  const raw = (await cookies()).get('lezzet.place.v2')?.value;
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const row = parsed as Record<string, unknown>;
    // İstemciden gelen her şey şüphelidir. Ülke kümesi kapalı, kod biçimi sabit — uymayan çerez
    // yok sayılır (istisna fırlatılmaz: bozuk çerez yüzünden sayfa çökmemeli).
    if (typeof row.postalCode !== 'string' || !/^\d{5}$/.test(row.postalCode)) return null;
    if (row.country !== 'FR' && row.country !== 'DE') return null;
    return { country: row.country, postalCode: row.postalCode };
  } catch {
    return null;
  }
}
