import { UserProfileSchema } from '@lezzet/types';

/**
 * `GET /api/v1/me` yanıt sözleşmesi — `UserProfileSchema`'dan `.pick` ile TÜRETİLİR, elle DTO
 * yazılmaz (02-mimari §3.2).
 *
 * Küme MÜŞTERİYE BAKAN alanlardır; operasyon-içi alanlar bilinçli dışarıda: `warehouseIds`
 * (personel kapsamı), `b2bRejectedBy` (personel kimliği), `creditLimitCents`/`discountPercent`
 * (ticari koşullar — hangi uçtan ve nasıl gösterileceği kendi görevlerinin kararı), `isDraft`/
 * `acquisitionSource` (iç yaşam döngüsü). Uç `parse` ile döndürür: pick'te olmayan alan zarfa
 * SIZAMAZ — süzme tipte değil çalışma zamanında da geçerli.
 *
 * Bu şemanın `packages/types`'a terfisi Expo iskeleti (21.2/21.4) cevabı AYNI şemayla parse
 * etmeye başlarken yapılacak (02-mimari §3.2 "sözleşme tek kaynak" — terfi yöneticiye raporlandı).
 */
export const MeSchema = UserProfileSchema.pick({
  id: true,
  type: true,
  name: true,
  email: true,
  phone: true,
  preferredLanguage: true,
  country: true,
  roles: true,
  b2bApproved: true,
  b2bPending: true,
  marketingConsent: true,
  referralCode: true,
  createdAt: true,
});
// `Me` tipi bilerek İHRAÇ EDİLMİYOR: bugün tüketeni yok (knip ölü ihracı yakalar). İlk tüketen
// Expo tarafı olacak ve o gün tip buradan değil, terfi etmiş şemadan (`packages/types`) türeyecek.
