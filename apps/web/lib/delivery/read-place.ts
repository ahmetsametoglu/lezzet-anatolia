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
    // Yalnız ÇÖZÜLMÜŞ hâller depo verir. `ambiguous`/`unknown`/`unresolved` → yer bilinmiyor gibi
    // davranılır: sessizce bir depo seçmek, müşteriye başka şehrin stoğunu göstermek olurdu.
    warehouseId: resolved ? resolution.warehouseId : null,
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
 */
export async function readPlaceScope(): Promise<{ country: string | null; zoneId: string | null; warehouseId: string | null }> {
  const { answer, resolution, warehouseId } = await readPlaceContext();
  return {
    country: answer?.country ?? null,
    zoneId: resolution?.kind === 'route' ? resolution.zoneId : null,
    warehouseId,
  };
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
