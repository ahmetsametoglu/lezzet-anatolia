/**
 * Müşterinin EKRANDA anılacağı ad — tek kaynak.
 *
 * **`user_profiles.name` boş olabilir ve bu bir arıza değil, akışın kendisi:** kolon `not null`
 * ama OTP ile giren müşteri ad vermek zorunda değil ve kimlik trigger'ı o hâlde boş dizge yazıyor
 * (`0002_auth_user_profile_trigger.sql:21` — `trim(coalesce(meta->>'full_name', meta->>'name', ''))`).
 * Yani "adsız müşteri" beklenen bir hâl; ekranın onu **anılabilir** kılması gerekiyor.
 *
 * Ham `name` basıldığında satırın başlığı boş çıkıyordu (kullanıcı tespiti 09.08, talep kuyruğunda).
 * Boş bir başlık en kötü hâl: satır kaybolmuyor ama kimin olduğu okunamıyor ve operatör onu ancak
 * AÇARAK tanıyor — kuyruğun tek işi ise açmadan tanıtmak.
 *
 * Sıra **ad → e-posta → çizgi**: e-posta kimliğin ikinci adıdır (giriş de onunla yapılıyor). Telefon
 * bilerek zincire girmedi — her profilde yok ve varsa da listede kendi sütununda duruyor; aynı
 * numarayı iki yerde göstermek satırı bilgilendirmiyor, tekrarlıyor.
 *
 * **Maskeleme YOK ve olmamalı:** maskeleme LOG kuralıdır (`OBSERVABILITY §5`) — orada kimliğin
 * hangi kayıt olduğunu söylemesi yeter. Burası personelin müşteriyle ilgilendiği yüzey; maskeli bir
 * e-posta operatörün müşteriyi tanımasını engellerdi.
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
