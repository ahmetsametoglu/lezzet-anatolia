import { BundleService, RecipeService } from '@lezzet/database';
import { imageOf } from '@lezzet/application';
import { splitLines, toCents } from '@lezzet/helper';
import { resolveLocalizedText } from '@lezzet/types';
import type { BundleWithItems, HomePackage, HomeRecipe, PreferredLanguage, RecipeWithItems } from '@lezzet/types';
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
 * Yaptığı iş içerik indirgemesidir: ad/süre/porsiyon çözümü (`resolveLocalizedText`), satır sayımı
 * ve görsel seçimi (`imageOf`) — hepsi paylaşılan ilkellerle. Fiyat/stok/tükendi kararı YOK: tarif
 * kartı içerik kartıdır, paket kartı ise gezinme kapısıdır ve TEK fiyatını paketin kendi alanından
 * taşır (sözleşme künyeleri: `HomeRecipeSchema` · `HomePackageSchema`).
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

/** Paket kartı — GEZİNME kapısı: ad/fiyat/içerik adedi/görsel; tükenme kararı paket detayının işi. */
function toPackageCard(bundle: BundleWithItems, locale: PreferredLanguage): HomePackage {
  return {
    slug: bundle.slug,
    name: resolveLocalizedText(bundle.name, locale),
    priceCents: toCents(bundle.totalPrice),
    // Satır sayısı, adet toplamı DEĞİL ("5 ürün" — sözleşme künyesi).
    itemCount: bundle.items.length,
    image: imageOf(bundle),
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
 * Paket kartları — `listWithItems` TEK sorgudur (üyelik gömülü) ve süzme BELLEKTE yapılır: paket
 * kataloğu doğal tavanlı küçük bir kümedir (`api/v1/packages.ts` detay ucunun aynı deseni).
 *
 * ÜÇ SÜZGEÇ ÜÇ AYRI GEREKÇEDEN:
 *   · `isActive`  — pasif paket hiçbir yüzeyde görünmez (detayı da 404).
 *   · kalem sayısı — boş kutu satılmaz; sözleşmenin `itemCount: positive` kilidinin veri tarafı.
 *   · `isFeatured` — YALNIZ vitrinde (`featuredOnly`): işaret bir SEÇİMDİR ve yedeği yoktur
 *     (bant karışımının ilkesi). Liste sayfası "hepsi" sorusunun cevabıdır, seçki değil.
 *
 * `limit` VERİLMEZSE kesme yapılmaz — liste sayfası kümenin tamamını ister (doğal tavan).
 */
export async function readPackageCards(
  db: SupabaseClient,
  locale: PreferredLanguage,
  options: { featuredOnly: boolean; limit?: number },
): Promise<HomePackage[]> {
  const bundles = await new BundleService(db).listWithItems();
  const visible = bundles.filter(
    (b) => b.isActive && b.items.length > 0 && (!options.featuredOnly || b.isFeatured),
  );
  const page = options.limit === undefined ? visible : visible.slice(0, options.limit);
  return page.map((bundle) => toPackageCard(bundle, locale));
}
