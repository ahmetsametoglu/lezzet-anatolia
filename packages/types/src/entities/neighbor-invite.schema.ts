import { z } from 'zod';

// NeighborInvite — komşu daveti (17.10, migration 0044). DOMAIN §14.
//
// Getiren davetinden (17.9) AYRI bir kavram: o hesapsız birini müşteri yapmayı ödüllendirir,
// bu var olan bir SEFERE (aynı bölge + aynı gün) ikinci bir sipariş eklemeyi. Davet edilen kişi
// zaten müşterimiz olabilir; o hâlde getiren ödülü hiç doğmaz ama komşu ödülü doğar.
//
// **Sefer davetin İÇİNDE saklanır, siparişten canlı okunmaz** (migration künyesi): komşuya söz
// verilen gün, davetin doğduğu gündür. Sipariş operasyonda başka bir güne taşınırsa davetin sözü
// değişmemeli.

export const NeighborInviteSchema = z.object({
  id: z.string().uuid(),
  /** Bağlantının anahtarı — sipariş referansı/kupon koduyla aynı okunabilir alfabe, CSPRNG. */
  token: z.string(),
  inviterId: z.string().uuid(),
  /** Davetin doğduğu sipariş — "hangi sefer" sorusunun kaynağı. Sipariş başına TEK davet. */
  orderId: z.string().uuid(),
  deliveryZoneId: z.string().uuid(),
  /** Sefer günü (`YYYY-MM-DD`). */
  deliveryDate: z.string(),
  /**
   * Kaç komşu bu davetten sipariş verebilir. Kullanım SAYILMAZ — o daveti künyesinde taşıyan
   * siparişlerden türetilir (`order.neighbor_invite_id`); sayaç bozulur, defter bozulmaz.
   */
  maxUses: z.number().int(),
  createdAt: z.string(),
});
export type NeighborInvite = z.infer<typeof NeighborInviteSchema>;

/**
 * **Kabul edilmiş davet** — kişiye yazılmış hâli (kullanıcı sorusu 12.08).
 *
 * Çerez yalnız kimliği olmayan ziyaretçi için bir KÖPRÜ; kimlik doğduğu an kabul buraya geçer.
 * Böylece davet cihaza değil kişiye yapışır: web'de hesap açıp uygulamayı sonra yükleyen kişi
 * daveti sepette görür, başka cihazdan giren kaybetmez, çerezi temizleyen silmez.
 *
 * **Durum kolonu YOK:** "bekliyor" türetilir — o daveti künyesinde taşıyan (iptal olmayan) sipariş
 * yoksa ve seferin penceresi hâlâ açıksa. Üçüncü bir damga, iptalde elle geri alınması gereken bir
 * durum daha demekti.
 */
export const NeighborInviteClaimSchema = z.object({
  id: z.string().uuid(),
  inviteId: z.string().uuid(),
  customerId: z.string().uuid(),
  /** Satırın DOĞDUĞU an — değişmez ("bu daveti ilk ne zaman gördüm"); dönüşüm ölçümünün tarihi. */
  createdAt: z.string(),
  /**
   * **SON kabul anı** — aynı gün + aynı bölgeye iki komşu davet ettiyse kazanan bunun EN BÜYÜĞÜ
   * (kullanıcı kararı 21.08). Tekrar tıklamayla tazelenir, yani müşteri önceki davete dönebilir.
   * `createdAt`ten ayrı durmasının gerekçesi migration künyesinde: tek damgaya iki soru sorulsaydı
   * geri dönüş, dönüşümün tarihini bozardı.
   */
  chosenAt: z.string(),
  /** Reddedildiyse anı; `null` = reddedilmedi. Ret geri alınabilir — yeniden kabul temizler. */
  declinedAt: z.string().nullable(),
});
export type NeighborInviteClaim = z.infer<typeof NeighborInviteClaimSchema>;

/**
 * Kabul satırında GÜNCELLENEBİLİR olan iki alan — ve yalnız ikisi (kullanıcı kararı 21.08).
 *
 * `inviteId`/`customerId` kimliğin kendisidir, `createdAt` satırın doğduğu andır: üçü de
 * değişmez. Şemayı `.partial()` ile tam varlıktan türetmek bunları da yazılabilir kılardı —
 * kabul kaydının kime ait olduğunu bir gün bir güncelleme değiştirebilirdi.
 */
export const NeighborInviteClaimUpdateSchema = NeighborInviteClaimSchema.pick({ id: true })
  .extend(NeighborInviteClaimSchema.pick({ chosenAt: true, declinedAt: true }).partial().shape);
export type NeighborInviteClaimUpdate = z.infer<typeof NeighborInviteClaimUpdateSchema>;

export const NeighborInviteClaimInsertSchema = NeighborInviteClaimSchema.pick({ inviteId: true, customerId: true });
export type NeighborInviteClaimInsert = z.infer<typeof NeighborInviteClaimInsertSchema>;

export const NeighborInviteInsertSchema = NeighborInviteSchema.pick({
  token: true,
  inviterId: true,
  orderId: true,
  deliveryZoneId: true,
  deliveryDate: true,
}).extend({
  /** Verilmezse şema varsayılanı (3) uygulanır — sınır satırda durur, ayarda değil. */
  maxUses: z.number().int().min(1).max(20).optional(),
});
export type NeighborInviteInsert = z.infer<typeof NeighborInviteInsertSchema>;
