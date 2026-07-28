'use server';

import { serviceDb } from '@lezzet/database';
import { getSessionUser } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { isValidPostalCode, normalizePostalCode } from './place-types';

/**
 * "Bölgeye gelince haber ver" kaydı (0030).
 *
 * **Söz DEĞİL, kayıt.** Ekran "haber göndeririz" demez, "not aldık" der: bölge genişletme kararı
 * verilmemiş, tetikleyici de yazılmamıştır. Tutulamayacak bir sözü bugünden vermek, müşteriyi
 * bekletip sonra hiç aramamak olurdu. Kaydı şimdiden almanın tek sebebi, tetikleyici geldiğinde
 * elimizde gerçek bir liste bulunması.
 *
 * Hesap ZORUNLU DEĞİL: düğme, müşterinin vazgeçmeye en yakın olduğu anda duruyor — önüne giriş
 * duvarı koymak ikinci bir engel çıkarmak olurdu. Oturum varsa kayıt ona bağlanır (hesap sayfası
 * kendi kayıtlarını böyle bulacak), yoksa yalnız e-posta ile durur.
 *
 * Aynı kod + e-posta ikinci kez gelirse yeni satır AÇILMAZ (benzersiz indeks): düğmeye tekrar
 * basmak yeni bir bekleyiş değil, aynı bekleyişin tekrarıdır.
 */
export async function recordZoneNoticeAction(rawPostalCode: string, rawEmail: string): Promise<ActionResult<true>> {
  try {
    const postalCode = normalizePostalCode(rawPostalCode);
    if (!isValidPostalCode(postalCode)) throw new Error('Posta kodu 5 haneli olmalı');

    const email = rawEmail.trim().toLowerCase();
    // Biçim kontrolü kaba ve bilinçli: e-postanın gerçekten çalıştığını ancak göndererek anlarız,
    // burada amaç yazım hatasını değil boş/anlamsız girdiyi elemek.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Geçerli bir e-posta adresi girin');

    const user = await getSessionUser();
    const { error } = await serviceDb()
      .from('zone_notice')
      .upsert({ postal_code: postalCode, email, customer_id: user?.id ?? null }, { onConflict: 'postal_code,email', ignoreDuplicates: true });
    if (error) throw error;

    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
