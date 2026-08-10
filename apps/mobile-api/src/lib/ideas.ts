import { BundleService, RecipeService } from '@lezzet/database';
import { getPackagesByIds, imageOf, listStorefrontPackages } from '@lezzet/application';
import type { PlaceWarehouses, StorefrontPackage } from '@lezzet/application';
import { splitLines } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { HomePackage, HomeRecipe, PreferredLanguage, RecipeWithItems } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import { resolvedOrNull } from './home';

/**
 * TARİF ve PAKET KARTININ okuma kapısı — "Fikirler" sekmesinin (`/recipes`, `/packages`) ve
 * vitrin şeritlerinin (`/home`) ORTAK kaynağı.
 *
 * NEDEN AYRI DOSYA: kart indirgemesi 09.08'e kadar `lib/home.ts`te yaşıyordu ve tek tüketeni
 * vitrindi. Fikirler sekmesi ikinci tüketeni doğurdu; kartı orada bırakıp listeye ikinci bir
 * indirgeme yazmak, aynı kartın iki tanımı olurdu (CLAUDE §1). Kart buraya taşındı, vitrin de
 * buradan okuyor — iki yüzey, tek kart.
 *
 * BURADA duruyor, `@lezzet/application`da DEĞİL: `lib/home.ts`in künyesindeki ölçüt aynen geçerli —
 * pakete girmenin şartı EN AZ İKİ YÜZEYİN çağırmasıdır ve bu kartları bugün yalnız mobil okuyor
 * (web'in kendi tarif/paket kart okumaları kendi yüzeyinde yaşıyor ve KOPYALANMADI). Web okuması
 * pakete terfi ettiği gün bu dosya o kapıya döner.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * TARİF kartı burada indirgenir (ad/süre/porsiyon çözümü, satır sayımı, görsel) — içerik kartıdır,
 * fiyatı ve stoğu yoktur. PAKET kartı ise 10.08'den beri hiç kurulmuyor: kapının (`@lezzet/
 * application` → `listStorefrontPackages`/`getPackagesByIds`) verdiği vitrin kartı sözleşme şekline
 * indirgeniyor, o kadar. Fiyat · tükendi · yol kararlarının hiçbiri burada değil; olsaydı web ile
 * mobil aynı pakete iki farklı cevap verebilirdi (sözleşme künyeleri: `HomeRecipeSchema` ·
 * `HomePackageSchema`).
 *
 * ── SAYFALAMA YOK, SINIR VAR (CLAUDE §1) ─────────────────────────────────────
 * İki küme de operatörün elle kurduğu editoryal seçkilerdir, veriyle büyümezler → keyset değil,
 * TEK TURDA. Aşağıdaki sayılar sayfalama değil: vitrindekiler tasarımın ızgarasından gelen seçki
 * sınırları, listedeki ise emniyet tavanı.
 */

/** "Sofradan Fikirler" şeridi — v3'te üç kart. */
export const HOME_RECIPE_LIMIT = 3;
/** Vitrin "Hazır paketler" bölümü — v3'te iki büyük kart. */
export const HOME_PACKAGE_LIMIT = 2;

/**
 * Tarif LİSTESİNİN tavanı — sayfalama değil **emniyet sınırı** (web `RECIPE_PAGE_LIMIT` emsali,
 * aynı sayı): elle kurulan bir küme de bir gün yanlışlıkla yüz satıra çıkabilir ve o sayfa ilk
 * boyada açılmazdı. Kümenin kendisi bu sayıya YAKLAŞIRSA cevap sayfalama kurmak değil, sınırı
 * gözden geçirmektir — o gün kümenin editoryal olmadığı anlaşılmış olur.
 */
export const RECIPE_LIST_LIMIT = 60;

/**
 * Tarif kartı — İÇERİK kartı: fiyat/stok okunmaz (o birleştirme tarif DETAYININ işi).
 * `duration`/`serves` SERBEST METİNDİR ("35 dk"), boş/boşluk `null` sayılır → rozet parçası düşer.
 */
function toRecipeCard(recipe: RecipeWithItems, locale: PreferredLanguage): HomeRecipe {
  const pantry = resolvedOrNull(recipe.pantry, locale);
  return {
    slug: recipe.slug,
    name: resolveLocalizedText(recipe.name, locale),
    duration: resolvedOrNull(recipe.duration, locale),
    serves: resolvedOrNull(recipe.serves, locale),
    itemCount: recipe.items.length,
    // "Evinizden" maddeleri: satır = madde (`splitLines` — tek kural, iki yüzey).
    pantryCount: pantry ? splitLines(pantry).length : 0,
    image: imageOf(recipe),
  };
}

/**
 * Paket kartı — kapının ürettiği vitrin kartını SÖZLEŞME şekline indirger.
 *
 * ── 10.08: KART ARTIK KAPIDAN GELİYOR, BURADA KURULMUYOR ────────────────────
 * Eskiden ham `BundleWithItems` satırından kuruluyordu (ad/fiyat/adet/görsel) ve stok/yol hiç
 * okunmuyordu — kart yere KÖRDÜ. Kapı (`listStorefrontPackages` → `toCard`) o kararları zaten
 * veriyor; ikinci bir kart kurgusu, `soldOut`/`route`u burada yeniden hesaplamak demekti
 * (CLAUDE §1). Bu fonksiyonun işi artık yalnız SÜZGEÇ: kapının kartı ekranın taşımadığı alanları
 * da içeriyor (KDV oranı, ağırlık, kişi sayısı, tavan, rota kilidi) ve onlar tele çıkmaz.
 */
function toPackageCard(pack: StorefrontPackage): HomePackage {
  return {
    slug: pack.slug,
    name: pack.name,
    priceCents: pack.priceCents,
    // Satır sayısı, adet toplamı DEĞİL ("5 ürün" — sözleşme künyesi).
    itemCount: pack.itemCount,
    image: pack.image,
    // İKİ EKSEN, İKİ ALAN: `soldOut` ağ geneli ("hiç var mı"), `route` yere bağlı ("bana nasıl
    // gelir") ve yer bilinmiyorsa `null` — künyesi `HomePackageSchema`da, kural burada değil.
    soldOut: pack.soldOut,
    route: pack.route,
  };
}

/**
 * Yayındaki tarifler, editoryal sırada (`sortOrder`), kart şekline indirgenmiş.
 *
 * `listActiveWithItems` kalemleri TEK sorguda getirir — kalem başına sorgu liste boyunca N+1
 * olurdu ve kalem sayısı kartın kendi alanıdır (`itemCount`). Taslak tarif taşınmaz: yayın kapısı
 * (üç dil dolmadan yayın yok) burada da geçerlidir.
 */
export async function readRecipeCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  limit: number,
): Promise<HomeRecipe[]> {
  const rows = await new RecipeService(db).listActiveWithItems(limit);
  return rows.map((recipe) => toRecipeCard(recipe, locale));
}

/**
 * Paket kartları — süzme BELLEKTE yapılır: paket kataloğu doğal tavanlı küçük bir kümedir
 * (`api/v1/packages.ts` detay ucunun aynı deseni), okuma `sortOrder` sırasında gelir.
 *
 * ── SATILABİLİRLİK ÖLÇÜTÜ DETAYLA AYNI OLMAK ZORUNDA (09.08) ────────────────
 * Süzgeç 09.08'e kadar burada elle yazılıyordu (`isActive` + kalem sayısı) çünkü ölçütün tam hâli
 * (`listSellable`: kalemi satıştan kalkmış paket de düşer) web'in `server-only` kapısındaydı.
 * Detay ucu terfi etmiş kapıya (`getPackageDetail` → `listSellable`) geçince ikisi AYRIŞACAKTI:
 * boyu pasife alınmış bir ürünün paketi listede görünür, dokununca 404 verirdi. Liste de aynı
 * servis kapısına alındı — tek ölçüt, iki uç.
 *
 * ── YER ARTIK KAPIYA GEÇİYOR (10.08) ────────────────────────────────────────
 * `place` verilmezse davranış eskisiyle aynı kalır (iki `null` = yer bilinmiyor → `route: null`),
 * ama ekran o hâlde de doğru davranır: "bilinmiyor" bir hâldir, sıfır değil.
 *
 * `isFeatured` süzgeci burada KALIYOR: YALNIZ vitrinde uygulanır (`featuredOnly`). İşaret bir
 * SEÇİMDİR ve yedeği yoktur (bant karışımının ilkesi; web'in `pickFeatured` yedeğine bilerek
 * düşülmüyor — `lib/home.ts` künyesi). Liste sayfası "hepsi" sorusunun cevabıdır, seçki değil.
 * **İki dal, TEK ölçüt:** ikisi de `listSellable` süzgecinden geçen kapıları çağırıyor
 * (`listStorefrontPackages` ve `getPackagesByIds`), yani satılabilirlik iki uçta ayrışamaz.
 *
 * `limit` VERİLMEZSE kesme yapılmaz — liste sayfası kümenin tamamını ister (doğal tavan).
 */
export async function readPackageCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  options: { featuredOnly: boolean; limit?: number; place?: PlaceWarehouses },
): Promise<HomePackage[]> {
  const place = options.place;

  if (!options.featuredOnly) {
    /* Liste sayfası: kapının kendi tam listesi. `limit` VERİLMEDEN çağrılır ki kapı `pickFeatured`e
       hiç girmesin — o yedek (işaret yoksa ilk N) WEB'in kararıdır ve mobil ona bilerek düşmüyor
       (aşağıdaki dalın künyesi). Kesme, kapı kararını verdikten SONRA burada yapılır. Kapının
       kendi sırası korunur: tükenmiş paket listeden düşmez, SONA gider (`listStorefrontPackages`
       künyesi — sosyal medyadaki link boşa düşmesin). */
    const cards = await listStorefrontPackages(db, locale, undefined, place);
    const page = options.limit === undefined ? cards : cards.slice(0, options.limit);
    return page.map(toPackageCard);
  }

  /* VİTRİN ŞERİDİ İKİ ADIMDIR ve sebebi bir ödünleşmedir: işaret süzgeci `isFeatured` alanını
     ister, kapının döndürdüğü KART ise onu taşımaz (ve taşımamalı — kart müşteriye giden şeydir,
     editoryal işaret değil). Seçimi ham satırdan yapıp seçilenleri kimlikle kapıya soruyoruz.
     Bedeli bir fazladan `listSellable` turudur; kazancı, mobilin "işaret yoksa şerit yok"
     kuralının KAPININ yedeğine (`pickFeatured`) sessizce dönüşmemesidir — o gün vitrin, operatör
     hiçbir şey işaretlememişken kendi kendine iki paket seçerdi. */
  const marked = (await new BundleService(db).listSellable()).filter((b) => b.isFeatured);
  const page = options.limit === undefined ? marked : marked.slice(0, options.limit);
  if (page.length === 0) return [];
  /* Sıra `sortOrder`dan gelir ve kapı onu korur (`getPackagesByIds` de aynı listeden süzer).
     Tükenmişi sona atma kuralı burada UYGULANMAZ: şerit iki karttır ve seçimi operatör yapmıştır —
     onun sırasını stok durumuna göre değiştirmek, işaretin anlamını zayıflatırdı. */
  return (await getPackagesByIds(db, page.map((b) => b.id), locale, place)).map(toPackageCard);
}
