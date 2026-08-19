import { z } from 'zod';

// Kurye — teslim kanıtı kaydı. Gün kapanışı tipleri BURADAN TAŞINDI (18.08): kapanış kurye×gün
// ekseninden SEFER eksenine indi ve şeması artık `delivery-run.schema.ts`te yaşıyor
// (`DeliveryRunClose` + `DeliveryRunCollection` + iki RPC dönüşü). Bu dosyada kalan tek şey
// kanıt kaydı — o siparişin künyesidir (`order.delivery_proof`), seferin değil.

/**
 * **TESLİM KANITI — siparişe yazılan kayıt** (11.2 · `order.delivery_proof` jsonb).
 *
 * Şema burada, çünkü sözleşmenin İKİ UCU var: kurye kapısı yazıyor (`lib/courier/delivery.ts`),
 * operasyon ekranı okuyor (sipariş detayı). İkisi ayrı ayrı yazılmıştı ve **ayrışmıştı** —
 * yazan `kind/imageKey/receivedBy/courierId/at` koyuyordu, okuyan `signature/photos[]/note/by`
 * arıyordu. Ortak tek alan `at` idi: ekran kanıtı "var" gösteriyor ama neyin var olduğunu
 * söyleyemiyordu ve `imageKey` hiç okunmuyordu — yani **kanıt yazılıyor, hiç açılamıyordu.**
 * Kanıtın tek amacı "eksik geldi" ihtilafında açılmaktır.
 *
 * Hiçbir yerde hata vermiyordu: iki taraf da kendi içinde tutarlıydı. Tek çare şemayı tek kaynağa
 * bağlamak (`CLAUDE §1`) — artık yanlış alan adı DERLEME hatası.
 */
export const DeliveryProofRecordSchema = z.object({
  /** İmza çizimi mi kapı fotoğrafı mı — ikisi de görsel olarak saklanır. */
  kind: z.enum(['signature', 'photo']),
  /** PRIVATE kovadaki anahtar (`delivery/proofs/{orderId}/…`). Public adresi YOKTUR. */
  imageKey: z.string(),
  /** Kapıda teslim alan kişi — B2B'de "kim imzaladı" ihtilafın cevabıdır. */
  receivedBy: z.string().nullable(),
  /** Kanıtı üreten kurye — sipariş sonradan başkasına atansa da kanıt kimin olduğunu söyler. */
  courierId: z.string().uuid(),
  at: z.string(),
});
export type DeliveryProofRecord = z.infer<typeof DeliveryProofRecordSchema>;
