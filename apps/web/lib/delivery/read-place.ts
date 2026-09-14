import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { AddressService, PostalCodePlaceService, serviceDb } from '@lezzet/database';
import { findShippingWarehouse, resolvePlaceByPostalCode, type PostalCodeResolution } from '@lezzet/domain-core';
import type { Address } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';
import { describePlace } from './describe-place';
import { readDeliveryInputs } from './inputs';
import { toPlaceAddress, type PlaceAnswer, type PlaceSnapshot } from './place-types';

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
   * Girişli müşterinin VARSAYILAN adresi — yerin kaynağı olduğunda dolu (kullanıcı kararı 13.09).
   * Ziyaretçide ve adressiz müşteride `null`: o hâlde `answer` çerezden gelir.
   */
  address: Address | null;
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

const EMPTY: PlaceContext = { answer: null, resolution: null, warehouseId: null, shippingWarehouseId: null, address: null };

/**
 * Posta kodunun ülke adayları — istek başına bir kez (aynı kod birden çok bileşen tarafından
 * sorulabilir). Tablo migration'la doğar ve yılda bir yenilenir (`pnpm postal:build`), yani veri
 * bayatlamaz; burada tek istenen aynı istekte iki kez sorgu atmamak.
 */
const getPostalMatches = cache(async (postalCode: string) =>
  new PostalCodePlaceService(serviceDb()).findByPostalCode(postalCode),
);

/**
 * Girişli müşterinin varsayılan adresi — istek başına bir kez.
 *
 * ── ADRES KAZANIR (kullanıcı kararı 13.09) ───────────────────────────────────
 * `place-store.ts`in künyesi bunu ta 19.9'dan beri vaat ediyordu (*"girişli müşteride sunucu —
 * varsayılan adresin posta kodu okunur"*) ama yapan kod yoktu: çerez yalnız elle girilen kodla
 * yazılıyor, kayıtlı adresten hiç beslenmiyordu. Sonuç ölçüldü (11.09): çerezde 67000 (rota),
 * varsayılan adres 67380 (bölge dışı) — sepet "kapıya teslim ücretsiz", ödeme ekranı "kargo".
 *
 * Kayıtlı adresi olan müşteri için "adres seçilmeden önce en iyi bildiğimiz şey çerezdir"
 * gerekçesi (09.08) geçersiz: adresi zaten biliyoruz. Çerez yalnız ziyaretçide ve adressiz
 * müşteride konuşur; adres gelince susar.
 */
const readDefaultAddress = cache(async (): Promise<Address | null> => {
  const customerId = await currentCustomerId();
  if (!customerId) return null;
  const rows = await new AddressService(serviceDb()).listByCustomer(customerId);
  return rows.find((row) => row.isDefault) ?? null;
});

/**
 * İstek başına yer bağlamı. Ne adres ne çerez varsa, ya da kod çözülemiyorsa **yer bilinmiyor**
 * sayılır — hata fırlatılmaz: yerin bilinmemesi bir arıza değil, cevaplanmamış bir sorudur
 * (`place-types`).
 */
const readPlaceContext = cache(async (): Promise<PlaceContext> => {
  const address = await readDefaultAddress();
  const answer = address ? { country: address.country, postalCode: address.postalCode } : await readPlaceAnswerFromCookie();
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
    address,
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
 * Müşterinin CEVABI — çözülmeden (19.12): girişli ve adresli müşteride varsayılan adresin kodu,
 * ötekilerde çerez (bağlamın kendi sırası).
 *
 * Yalnız yerin kendisini isteyen çağıranlar için: "gelince haber ver" kaydı hangi yere ait olduğunu
 * bilmek zorunda ama depoyu bilmesine gerek yok — söz müşterinin adresi hakkındadır, bizim iç
 * coğrafyamız hakkında değil.
 */
export const readPlaceAnswer = cache(async (): Promise<PlaceAnswer | null> => (await readPlaceContext()).answer);

/**
 * **Yerin ilk karesi** — layout bunu okur ve `PlaceProvider`a başlangıç değeri olarak indirir;
 * adres yazan eylemler de aynı şekli döner (`PlaceSnapshot` künyesi).
 *
 * 19.7'nin (b) açığı buydu: istemci çerezi okuyup `resolvePlaceAction`ı yeniden çağırıyor, hap ilk
 * karede boş kalıyordu. Sunucu yeri zaten her istekte çözüyor (`readPlaceContext`); tarifini de
 * vermesi ikinci turu ortadan kaldırıyor. Tarif SAYIMSIZ (`describePlace` künyesi) — sayfa açılışı
 * bir niyet değildir, talep sayacına yazılmaz.
 */
export const readPlaceSnapshot = cache(async (): Promise<PlaceSnapshot> => {
  const { answer, resolution, address } = await readPlaceContext();
  const placeAddress = address ? toPlaceAddress(address) : null;
  if (!answer || !resolution || (resolution.kind !== 'route' && resolution.kind !== 'shipping')) {
    // Karşılanamayan yerin SEBEBİ taşınır (14.09): sepet "buraya gönderemiyoruz" diyebilsin.
    return { place: null, address: placeAddress, unresolved: resolution?.kind === 'unresolved' ? resolution.reason : null };
  }
  const [{ zones }, matches] = await Promise.all([readDeliveryInputs(), getPostalMatches(answer.postalCode)]);
  const place = await describePlace(
    answer.postalCode,
    { country: resolution.country, placeName: resolution.placeName, places: resolution.places },
    zones,
    matches,
  );
  return { place, address: placeAddress, unresolved: null };
});

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
 * ── BAĞLANDI (09.08) — ÜÇ ÇAĞIRANIN ÜÇÜ DE, AYNI TURDA ───────────────────────
 * 08.08'de "bağlandı" denmişti ve YANLIŞTI: `knip` kapının hiç çağıranı olmadığını gösterdi. Üç
 * çağıran da yalnız `readPlaceWarehouses()` yayıyordu, yani kapsamlı ayarın ülke ve bölge eksenleri
 * boştu — DE kargo tarifesi (12,90 €) ve bölge asgari sepeti hiç okunmuyor, FR/global değerler
 * kesiliyordu.
 *
 * **Tek yüzeyi bağlamak, hiçbirini bağlamamaktan KÖTÜDÜR** (`settings-scope.ts` künyesi): sepet ile
 * checkout aynı anahtarı farklı kapsamla okursa sepette "60 € eşik" yazıp checkout'ta 120 € istenir
 * ve müşteri arada ne olduğunu anlamaz. Bugün üçü de **tutarlı biçimde** yanlıştı; birini bağlamak
 * onu **tutarsız biçimde** yanlış yapardı. Bu yüzden üçü aynı turda bağlandı:
 *   `lib/cart/actions.ts` (çerezten — sepette adres henüz seçilmemiş olabilir)
 *   `lib/order/checkout-draft.ts` (ADRESTEN; `zoneId` kargo siparişinde null)
 *   `app/(customer)/…/checkout/actions.ts` (ADRESTEN — müşteri şeridi yazdı)
 *
 * ── 09.08 KARARI GERİ ALINDI (kullanıcı kararı 13.09) ─────────────────────────
 * Burada *"sepet çerezten, checkout adresten çözüyor ve bu bir kusur değil, bilginin sırası"*
 * yazıyordu. Kayıtlı adresi olan müşteri için sıra diye bir şey yoktu — adres baştan biliniyordu
 * ve sepet ona bakmıyordu. Artık üç çağıran da AYNI kaynağı okuyor: girişli ve adresli müşteride
 * varsayılan adres, ötekilerde çerez (`readDefaultAddress` künyesi). Ödeme ekranı adresi
 * DEĞİŞTİRMEZ, sepette seçileni gösterir; fark diye bir şey kalmadı.
 */
export async function readPlaceScope(): Promise<{
  country: string | null;
  zoneId: string | null;
  warehouseId: string | null;
  shippingWarehouseId: string | null;
}> {
  const { answer, resolution, warehouseId, shippingWarehouseId } = await readPlaceContext();
  return {
    country: answer?.country ?? null,
    zoneId: resolution?.kind === 'route' ? resolution.zoneId : null,
    // ── KARGO DEPOSU DA BURADAN ÇIKAR — ve bu bir DÜZELTME (09.08) ────────────
    // Kapı yazıldığında (07.15) yalnız üç alan dönüyordu ve o gün doğruydu: rota dışı müşteride
    // `warehouseId` zaten kargo deposunu taşıyordu. **19.23 o kutuyu daralttı** — artık yalnız
    // rota deposu. Kapı olduğu gibi bırakılıp sepete bağlansaydı rota dışı müşteri kargo havuzunu
    // SESSİZCE kaybederdi: `readPlaceWarehouses`ın yerine geçen bir çağrı, onun taşıdığı ikinci
    // depoyu taşımıyor olurdu. Yani düzeltmenin kendisi bir gerilemeye dönüşürdü.
    warehouseId,
    shippingWarehouseId,
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
