/*
  MÜŞTERİ ETİKETİ — terfi 21.12 (kaynağı `apps/web/lib/customer/name.ts`, birebir; web köprüyle
  okur). Ölçüt doldu: talep kuyruğu/detayı artık iki yüzeyden okunuyor (web operasyon + mobil Y1)
  ve adsız müşteri kuralı iki yerde iki kez yazılamazdı.
*/

/**
 * Müşterinin EKRANDA anılacağı ad — tek kaynak.
 *
 * **`user_profiles.name` boş olabilir ve bu bir arıza değil, akışın kendisi:** kolon `not null`
 * ama OTP ile giren müşteri ad vermek zorunda değil ve kimlik trigger'ı o hâlde boş dizge yazıyor
 * (`0002_auth_user_profile_trigger.sql:21`). Yani "adsız müşteri" beklenen bir hâl; ekranın onu
 * **anılabilir** kılması gerekiyor.
 *
 * Sıra **ad → e-posta → çizgi**: e-posta kimliğin ikinci adıdır (giriş de onunla yapılıyor).
 * Telefon bilerek zincire girmedi — her profilde yok ve varsa listede kendi sütununda duruyor.
 *
 * **Maskeleme YOK ve olmamalı:** maskeleme LOG kuralıdır (`OBSERVABILITY §5`). Burası personelin
 * müşteriyle ilgilendiği yüzey; maskeli bir e-posta operatörün müşteriyi tanımasını engellerdi.
 */
export function customerLabel(name: string | null | undefined, email: string | null | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  const mail = email?.trim();
  if (mail) return mail;
  // Ne ad ne e-posta: profil silinmiş ya da hiç çözülememiş. "Bilinmiyor" demek de bir bilgidir —
  // boş bırakmak satırı sahipsiz gösterirdi.
  return 'Adsız müşteri';
}
