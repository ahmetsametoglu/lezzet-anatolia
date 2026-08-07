'use server';

import { UserProfileService, serviceDb } from '@lezzet/database';
import type { PreferredLanguage } from '@lezzet/types';
import { currentCustomerId } from '@/lib/guard';

/**
 * Dil TEKTİR: sitenin dili ile bildirimlerin dili aynı şeydir (30.07 · kullanıcı kararı).
 *
 * Bir süre ikiye ayrılmıştı — "başlık gezdiğin dili değiştirir, hesap kartına yazılanı" — ve bu
 * müşteri için anlamsız bir ayrımdı: siteyi Türkçe gezen biri maillerinin Fransızca gelmesini
 * beklemez. Ayrım geliştiricinin gözünde vardı, kullanıcının gözünde yoktu.
 *
 * **Kural:** dil değiştiricisine basmak bilinçli bir seçimdir ve karta yazılır. Yalnızca başka
 * dildeki bir BAĞLANTIYA girmek yazmaz — arkadaşının paylaştığı Fransızca bağlantıya tıklayan Türk
 * müşteri, o tek tıklamayla maillerinin dilini kaybetmemeli. Ayrım "URL'de hangi dil var" değil,
 * "müşteri dili seçti mi".
 *
 * İlk değeri kayıt anında tarayıcının dili koyar (04.9; tohum artık `@lezzet/application/auth`
 * içinde — giriş akışının parçası, iki yüzeyin ortak işi); buradan sonrası müşterinin kendi
 * seçimidir.
 *
 * **Sessizce başarısız olur ve bu bilinçli:** ziyaretçide yazacak kart yok, hata da yok — dil
 * değiştirmek bir gezinme eylemi, önüne "giriş yapın" koymak saçma olurdu. Yazma düşerse de
 * gezinme sürer: dil bir kolaylıktır, kimlik değil.
 */
export async function setPreferredLanguageAction(locale: PreferredLanguage): Promise<void> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) return;
    await new UserProfileService(serviceDb()).update({ id: customerId, preferredLanguage: locale });
  } catch {
    // Yutulur: çağıran zaten gezinmeye devam ediyor ve bu eylemin bir ekranı yok.
  }
}
