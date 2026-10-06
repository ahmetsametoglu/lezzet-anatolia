import { ProductFeedbackService, ProductService } from '@lezzet/database';
import { initialFeedbackStatus } from '@lezzet/domain-core';
import { resolveLocalizedText, type DiscoverReward, type FeedbackVote, type PreferredLanguage, type ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from '../catalog/map';
import type { StorefrontImage } from '../catalog/storefront-types';
import { readPointsRules } from '../customer/points';
import { awardFeedbackPoints, getPointsBalance } from './points';

/*
  Keşif turu: deste okuması, kaydırmanın yazımı ve ziyaretçi turunun hesaba bağlanması. Kart vitrin ürünü değildir, çünkü aday
  ürün satılamaz; tekilleştirme yalnız girişlide yapılır, ziyaretçide kimlik tutmamanın bedeli aynı kartları yeniden görmektir.
*/

/** Turun tek kartı — fiyat/stok/varyant YOK ve olmayacak. */
export interface DiscoverCard {
  productId: string;
  name: string;
  /** Kısa tanıtım; yoksa kart yalnız ad ve görselle durur (uydurma metin yazılmaz). */
  description: string | null;
  image: StorefrontImage;
}

/** Deste boyu; keşif bir liste değil bir tur, bitmeyen deste bitişi hiç göstermezdi. */
const DECK_SIZE = 20;

/**
 * **Turun destesi.** Girişli müşteride daha önce oyladığı kartlar elenir; ziyaretçide elenecek bir
 * geçmiş yok ve okuma HİÇ YAPILMAZ — boşuna bir sorgu, ziyaretçinin ilk kartını geciktirirdi.
 */
export async function openDiscoverDeck(
  db: SupabaseClient,
  locale: PreferredLanguage,
  customerId: string | null,
): Promise<DiscoverCard[]> {
  return (await remainingCandidates(db, customerId)).map((p) => ({
      productId: p.id,
      name: resolveLocalizedText(p.name, locale),
      // Boş/boşluk metin YOK sayılır — boş bir paragraf kartın altında açıklanmamış bir boşluk bırakır.
      description: p.description ? textOrNull(resolveLocalizedText(p.description, locale)) : null,
      image: imageOf(p),
    }));
}

/**
 * Turun kalan kartları, desteyi kuran tek kural: hem deste hem "kaç kart kaldı" buradan çıkar ki vitrin açıldığında boş çıkan bir
 * tura davet etmesin.
 */
async function remainingCandidates(db: SupabaseClient, customerId: string | null) {
  const candidates = await new ProductService(db).listCandidates();
  if (candidates.length === 0) return [];

  const seen = customerId ? await votedProductIds(db, customerId) : new Set<string>();
  return candidates.filter((p) => !seen.has(p.id)).slice(0, DECK_SIZE);
}

/** Keşfin kart başına puanı ve puanın cent karşılığı; ayar okunamazsa `null`, sıfır değil. */
export async function readDiscoverReward(db: SupabaseClient): Promise<DiscoverReward | null> {
  const rules = await readPointsRules(db);
  const way = rules.earnWays.find((earn) => earn.key === 'feedback_candidate');
  return way ? { pointsPerCard: way.points, centValue: rules.centValue } : null;
}

/** Vitrinin sorusu, tur açılırsa kart çıkar mı; sayı döner, çünkü karar için kartın kendisi gereksiz. */
export async function countDiscoverDeck(db: SupabaseClient, customerId: string | null): Promise<number> {
  return (await remainingCandidates(db, customerId)).length;
}

/** Müşterinin daha önce kaydırdığı aday ürünler. */
async function votedProductIds(db: SupabaseClient, customerId: string): Promise<Set<string>> {
  const rows = await new ProductFeedbackService(db).listByCustomer(customerId);
  return new Set(rows.filter((r) => r.context === 'candidate').map((r) => r.productId));
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Kaydırmanın sonucu — adlı retlerle (`addCustomerAddress` · `updateCustomerPreferences` emsali).
 *
 * `not_candidate` motorun iç ayrımıdır ve müşteriye anlatılacak bir şey değildir; ayrı taşınıyor
 * çünkü TAŞIMA katmanının kararı olmalı: uç ikisini de tek anahtara indirir, ama sözleşme ona bu
 * seçeneği bırakır (`MePointsRedeemErrorEnum` künyesindeki aynı ilke).
 */
export type DiscoverSwipeOutcome =
  | { status: 'ok'; swipe: DiscoverSwipeRecord }
  | { status: 'not_found' | 'not_candidate' };

export interface DiscoverSwipeRecord {
  /**
   * Kaydırma satırının kimliği — **yalnız KİMLİKSİZ kaydırmada dolu.**
   *
   * Ziyaretçi bu kimlikleri cihazında saklar ve giriş dönüşünde talep kapısına getirir
   * (`claimDiscoverSwipes`). Girişli müşteride `null`: satır zaten sahibinin üstünde ve talep kapısı
   * kimlikli satırı kabul ETMİYOR — dönseydi istemci hiçbir zaman kullanılamayacak bir liste
   * biriktirirdi ve o listeyi bir gün kapıya götürüp sessizce sıfır sonuç alırdı.
   */
  id: string | null;
  /** Gerçekten yazılan puan; `null` = kimliksiz kaydırma, ödülün sahibi yok (sıfır değil), `0` = tavan, B2B ya da ikinci oy. */
  pointsAwarded: number | null;
  /** Yazımdan sonraki bakiye; ekran toplayamaz, çünkü bakiye turun dışında da değişir. `null` = kimliksiz kaydırma. */
  balance: number | null;
}

/**
 * Bir kartın kaydırılması; adaylık doğrulanır, çünkü aday olmayan ürüne gelen oy tutarsızdır. `dwellMs` sinyal kalitesinin
 * girdisidir, puanın değil; puan sessiz yazılır, tavan ya da B2B kaydırmayı geri çevirmez.
 */
export async function recordDiscoverSwipe(
  db: SupabaseClient,
  input: {
    /** `null`/verilmemiş = ziyaretçi. Kimlik ÇAĞIRANIN çözdüğü şeydir (oturum/Bearer), istemcinin iddiası değil. */
    customerId?: string | null;
    productId: string;
    vote: FeedbackVote;
    dwellMs?: number | null;
  },
): Promise<DiscoverSwipeOutcome> {
  const product = await new ProductService(db).getById(input.productId);
  if (!product) return { status: 'not_found' };
  if (product.status !== 'candidate') return { status: 'not_candidate' };

  const service = new ProductFeedbackService(db);
  // Metin YOK ve olmayacak (kart bir metin kutusu taşımıyor); statüyü yine de MOTOR söylüyor —
  // "metinsiz kayıt yayına doğar, metinli kuyruğa" kuralının tek sahibi o (STACK §4).
  const status = initialFeedbackStatus(null);

  if (!input.customerId) {
    // Kimliksiz kaydırma: güncellenecek bir "önceki" yok (tekilleştirme kimlik ister), doğrudan
    // yazılır. Puan doğmaz — ödülün sahibi yok; talep kapısı onu giriş dönüşünde verir.
    const created = await service.insert({
      productId: input.productId,
      context: 'candidate',
      vote: input.vote,
      dwellMs: input.dwellMs ?? null,
      status,
    });
    return { status: 'ok', swipe: { id: created.id, pointsAwarded: null, balance: null } };
  }

  // Tekillik `(müşteri, ürün, bağlam)` üzerinde: aynı ürüne ikinci oy YENİ satır açmaz, fikrini
  // günceller — aynı kişinin iki kaydırması aday panosunu iki kez etkileyemez.
  const existing = await service.findByCustomerProduct(input.customerId, input.productId, 'candidate');
  const saved = existing
    ? // Süre VERİLMEDİYSE dokunulmaz (`?? null` yazsaydık ikinci oy önceki ölçümü SİLERDİ ve
      // panonun güven kolonu sessizce nötre düşerdi — web `upsertFeedback`in aynı kısmi güncelleme
      // kuralı: "verilmeyen alan silinmez").
      await service.update({ id: existing.id, vote: input.vote, ...(input.dwellMs != null ? { dwellMs: input.dwellMs } : {}) })
    : await service.insert({
        productId: input.productId,
        customerId: input.customerId,
        context: 'candidate',
        vote: input.vote,
        dwellMs: input.dwellMs ?? null,
        status,
      });

  // İkinci oyda puan İKİNCİ KEZ verilmez: defterdeki tekillik `(müşteri, sebep, kaynak)` üzerinde
  // ve satır aynı satır (DOMAIN §14: "aynı ürüne swipe BİR KEZ puan verir").
  const entry = await awardFeedbackPoints(db, saved);
  // Bakiye ödül YAZILMASA DA okunur (tavan dolu · ikinci oy · B2B): ekranın söyleyeceği toplam
  // "bu turda ne kazandın" değil "şu an ne kadarın var" — ikincisi ödülden bağımsız doğrudur.
  const { balance } = await getPointsBalance(db, input.customerId);
  return { status: 'ok', swipe: { id: null, pointsAwarded: entry?.points ?? 0, balance } };
}

/**
 * Ziyaretçi turunun hesaba bağlanmasının sonucu.
 */
export interface DiscoverClaimResult {
  /** Hesaba bağlanan kaydırma sayısı — ekranın "N kaydırma hesabınıza işlendi" cümlesi. */
  linked: number;
  /** Gerçekten YAZILAN puan; tavana takılan ya da zaten ödenmiş olan buraya girmez. */
  points: number;
}

/**
 * Ziyaretçi turunun sonradan açılan hesaba puan olarak bağlanması. Her satır kimliksiz, `candidate` bağlamında ve oylu olmalı;
 * bağlama ürün başına yapılır (en yeni kaydırma), müşterinin o ürüne kaydı varsa hiç yapılmaz ki tur tekrarlanarak puan birikmesin.
 */
export async function claimDiscoverSwipes(
  db: SupabaseClient,
  customerId: string,
  swipeIds: readonly string[],
): Promise<DiscoverClaimResult> {
  if (swipeIds.length === 0) return { linked: 0, points: 0 };

  const feedback = new ProductFeedbackService(db);
  const rows = await feedback.listByIds(swipeIds);

  const claimable = rows.filter((r) => r.customerId === null && r.context === 'candidate' && r.vote !== null);
  if (claimable.length === 0) return { linked: 0, points: 0 };

  // Müşterinin o ürüne ait kaydı zaten varsa ürün kapalıdır — hem bu turdan hem önceki turlardan.
  const already = new Set(
    (await feedback.listByCustomer(customerId)).filter((r) => r.context === 'candidate').map((r) => r.productId),
  );

  let linked = 0;
  let points = 0;
  for (const row of newestPerProduct(claimable)) {
    if (already.has(row.productId)) continue;
    // Sıradaki turda aynı ürün ikinci kez bağlanmasın diye küme anında büyür.
    already.add(row.productId);

    const attached = await feedback.update({ id: row.id, customerId });
    linked += 1;
    // Puan yazılmayabilir (günlük tavan, B2B, sıfır değerli aksiyon) — bağlama yine de geçerlidir:
    // sinyalin sahibi belli oldu, ödül ayrı bir sorudur.
    const entry = await awardFeedbackPoints(db, attached);
    points += entry?.points ?? 0;
  }

  return { linked, points };
}

/** Ürün başına en yeni kaydırma; girişli akışta da son oy öncekini ezer, iki yol aynı davranır. */
function newestPerProduct(rows: readonly ProductFeedback[]): ProductFeedback[] {
  const byProduct = new Map<string, ProductFeedback>();
  for (const row of rows) {
    const current = byProduct.get(row.productId);
    if (!current || row.createdAt > current.createdAt) byProduct.set(row.productId, row);
  }
  return [...byProduct.values()];
}
