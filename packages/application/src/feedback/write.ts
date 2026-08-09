import {
  FeedbackRequestService,
  OrderItemService,
  OrderService,
  ProductFeedbackService,
  ProductVariantService,
} from '@lezzet/database';
import { initialFeedbackStatus } from '@lezzet/domain-core';
import type { FeedbackVote, ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { awardFeedbackPoints } from './points';

/*
  TOKEN'LI CEVAP YAZIMI (08.7 · 17.2) — web davet aksiyonlarının (`feedback/[token]/actions.ts`)
  ve `lib/feedback/product-feedback.ts`in PURCHASE dalının paket hâli (terfi; kopya değil).
  Web dosyaları köprü olarak duruyor; benimsemeleri web şeridinin işi.

  **KİMLİK TOKEN'DAN ÇÖZÜLÜR, ÇAĞIRANDAN ALINMAZ — bu dosyanın tek önemli kuralı.**
  Davet e-postadan/bildirimden tıklanır ve müşteriden giriş istenmez; `customerId` parametre olsaydı
  istemciden gönderilen bir kimlikle başkasının adına yorum yazılabilirdi. Her kapı önce
  `findByToken` ile daveti çözer, kimliği ORADAN alır. Web'deki `ownedRequestId` kontrolü burada
  YOK ve gerekmez: o kontrol, davet bağının İSTEMCİDEN geldiği yolda anlamlıdır — burada kimlik ve
  davet AYNI satırdan çözülüyor, bağ tanım gereği sahibinin.

  İkinci kat koruma satın alma doğrulaması (`findPurchase`): geçerli bir token'la bile sipariş dışı
  bir ürüne oy verilemez — "sipariş dışı ürünler değerlendirmeye sokulmaz" kuralı veriyle korunur,
  ekranın kart listesiyle değil.

  BİLEREK TERFİ ETMEYENLER: `candidate` bağlamı (keşif kaydırması), ziyaretçi (kimliksiz) kaydı ve
  `dwellMs` sinyali — bunlar keşif yüzeyinin işi ve bugün tek yüzeyde (web) yaşıyor. Token akışı
  web'de de `dwellMs` göndermiyor (ölçüldü: `voteAction` geçirmez); olmayan alanı taşımak sözleşmeyi
  yalancı yapardı.
*/

export type FeedbackWriteOutcome =
  | { status: 'ok'; feedback: ProductFeedback }
  | { status: 'invalid_link' | 'not_purchased' | 'empty_review' };

/**
 * Müşteri bu ürünü gerçekten aldı mı — ve hangi siparişte.
 *
 * **Teslim edilmiş olması aranmaz, satın alınmış olması yeter.** Sipariş yolda diye görüşünü
 * yazamayan müşteri unutur; asıl kayıp odur. İptal ve taslak sayılmaz: orada bir alışveriş hiç
 * gerçekleşmemiştir. En YENİ uygun sipariş döner — görüş en son deneyime aittir.
 */
async function findPurchase(db: SupabaseClient, customerId: string, productId: string): Promise<string | null> {
  const orders = await new OrderService(db).listByCustomer(customerId, { limit: 100 });
  const usable = orders.rows.filter((o) => o.status !== 'cancelled' && o.status !== 'draft');
  if (usable.length === 0) return null;

  const items = await new OrderItemService(db).listByOrders(usable.map((o) => o.id));
  if (items.length === 0) return null;

  // Kalem varyanta bağlıdır, geri bildirim ürüne: aradaki eşleme varyant kayıtlarından çözülür.
  const variants = await new ProductVariantService(db).listByIds(items.map((i) => i.variantId));
  const variantsOfProduct = new Set(variants.filter((v) => v.productId === productId).map((v) => v.id));
  if (variantsOfProduct.size === 0) return null;

  const matched = new Set(items.filter((i) => variantsOfProduct.has(i.variantId)).map((i) => i.orderId));
  // `listByCustomer` yeniden eskiye sıralı — ilk eşleşen en yenisidir.
  return usable.find((o) => matched.has(o.id))?.id ?? null;
}

/**
 * Ortak yazım: varsa güncelle, yoksa aç. Tekillik `(müşteri, ürün, bağlam)` üzerindedir; bağlam
 * burada hep `purchase` (dosya künyesi).
 *
 * **Güncelleme KISMİDİR — verilmeyen alan silinmez.** Tek satırda üç beyan yaşayabiliyor (yıldız,
 * beğeni, metin) ve bunlar ayrı anlarda gelir: müşteri önce 👍 der, iki gün sonra yorum yazar.
 * Her alanı `?? null` ile yazsaydık ikinci çağrı birincisini siler; beğeni ürün puanından düşer,
 * ya da tersinde onaylanmış yorum metni yok olurdu.
 */
async function upsertFeedback(
  db: SupabaseClient,
  input: {
    customerId: string;
    productId: string;
    orderId: string;
    feedbackRequestId: string;
    rating?: number | null;
    vote?: FeedbackVote | null;
    comment?: string | null;
  },
): Promise<ProductFeedback> {
  const service = new ProductFeedbackService(db);
  const comment = input.comment?.trim() || null;
  // Metin varsa kuyruğa, yoksa doğrudan yayına — kural motorda (`initialFeedbackStatus`).
  const status = initialFeedbackStatus(comment);

  const existing = await service.findByCustomerProduct(input.customerId, input.productId, 'purchase');
  if (existing) {
    // Metin bu çağrıda GELDİ Mİ — "boş gönderdi" ile "bu çağrının konusu değil" ayrı şeyler.
    const touchesComment = input.comment !== undefined;
    return service.update({
      id: existing.id,
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.vote !== undefined ? { vote: input.vote } : {}),
      // Metne dokunulmadıysa moderasyon durumu da olduğu gibi kalır: bir beğeni, onaylanmış bir
      // yorumu yeniden kuyruğa sokmamalı — okunacak yeni bir şey yok. Değişen metin ise yeniden
      // kuyruğa girer; dil/çeviri sıfırlamasını tetikleyici yapar (`0011`).
      ...(touchesComment ? { comment, status, moderatedAt: null, moderatedBy: null } : {}),
      orderId: input.orderId ?? existing.orderId,
      feedbackRequestId: input.feedbackRequestId ?? existing.feedbackRequestId,
    });
  }

  return service.insert({
    productId: input.productId,
    customerId: input.customerId,
    orderId: input.orderId,
    feedbackRequestId: input.feedbackRequestId,
    context: 'purchase',
    rating: input.rating ?? null,
    vote: input.vote ?? null,
    comment,
    status,
  });
}

/** Token → davet; üç kapı da buradan geçer, kimliğin tek kaynağı bu. Süre süzgeci servisin içinde. */
async function resolveInvite(db: SupabaseClient, token: string): Promise<{ customerId: string; requestId: string } | null> {
  const request = await new FeedbackRequestService(db).findByToken(token);
  return request ? { customerId: request.customerId, requestId: request.id } : null;
}

/**
 * **Kart oyu (👍/👎)** — vFb ekranının ve web davet kartının yazımı.
 *
 * Satın almayan yazamaz (DOMAIN §14) — doğrulanmamış görüş sosyal kanıt değil reklamdır.
 * Puan SESSİZ yazılır: tavana takılmak ya da B2B olmak oyu geri çevirmez.
 */
export async function voteOnFeedbackInvite(
  db: SupabaseClient,
  input: { token: string; productId: string; vote: FeedbackVote },
): Promise<FeedbackWriteOutcome> {
  const invite = await resolveInvite(db, input.token);
  if (!invite) return { status: 'invalid_link' };

  const orderId = await findPurchase(db, invite.customerId, input.productId);
  if (!orderId) return { status: 'not_purchased' };

  const saved = await upsertFeedback(db, {
    customerId: invite.customerId,
    productId: input.productId,
    orderId,
    feedbackRequestId: invite.requestId,
    vote: input.vote,
  });
  await awardFeedbackPoints(db, saved);
  return { status: 'ok', feedback: saved };
}

/**
 * **İsteğe bağlı yıldız + yazılı yorum** — akış sonunun "bir şey eklemek ister misiniz" kutusu.
 *
 * Aynı ürüne bir müşteriden tek kayıt: ikinci yazım günceller — aynı kişinin iki yıldızı
 * ortalamayı iki kez etkilerdi. Dil YAZILMAZ (20.2): arayüz dili metnin dili değildir; tespiti
 * çeviri işi yapar.
 */
export async function reviewFeedbackInvite(
  db: SupabaseClient,
  input: { token: string; productId: string; rating?: number | null; comment?: string | null },
): Promise<FeedbackWriteOutcome> {
  const comment = input.comment?.trim() || null;
  // GERÇEK bir kullanıcı hatası: "kaydet"e bastı ama ne yıldız ne metin var — adlı ret.
  if (input.rating == null && !comment) return { status: 'empty_review' };

  const invite = await resolveInvite(db, input.token);
  if (!invite) return { status: 'invalid_link' };

  const orderId = await findPurchase(db, invite.customerId, input.productId);
  if (!orderId) return { status: 'not_purchased' };

  // Metin bu çağrının konusu değilse hiç geçirilmez — yalnız yıldız gönderen bir istek, daha önce
  // yazılmış (ve onaylanmış) yorumu silmemeli.
  const saved = await upsertFeedback(db, {
    customerId: invite.customerId,
    productId: input.productId,
    orderId,
    feedbackRequestId: invite.requestId,
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.comment !== undefined ? { comment } : {}),
  });
  await awardFeedbackPoints(db, saved);
  return { status: 'ok', feedback: saved };
}
