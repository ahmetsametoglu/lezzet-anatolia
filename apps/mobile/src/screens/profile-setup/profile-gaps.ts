import type { Me } from '@/lib/api/me';

/*
  PROFİL BOŞLUKLARI — "bu hesabın künyesi eksik mi" sorusunun TEK cevabı. Kapı (`use-profile-setup-
  gate.hook`) ve akışın kendisi aynı ölçütü kullanır; iki kopya bir gün ayrışır ve kullanıcı ya
  hiç sorulmayan ya da bitmeyen bir akış görürdü (CLAUDE §1).

  ÖLÇÜLMÜŞ ARIZA (10.08): e-posta/OTP ile açılan hesapta müşterinin ADI HİÇ DOLMUYOR. Profil
  satırını açan tetik adı sağlayıcının künyesinden okuyor (`raw_user_meta_data->>'full_name'|
  'name'`, `0002_auth_user_profile_trigger.sql`) ve OTP yolunda orası boştur — uydurma bir ad
  yazılmaz, ad BOŞ kalır. Uygulama da hiçbir yerde sormuyordu: onboarding giriş ÖNCESİ akıştır ve
  girişsiz de geçilebiliyor, yani doğrulanmış kullanıcıyı hiç yakalamıyor.
*/

/**
 * Ad eksik mi. Boş dizgenin YANINDA "ad = e-posta" hâli de eksik sayılır: operasyonun açtığı
 * taslak kartlarda ad alanına e-posta yazılmış olabiliyor ve bir e-posta adresi bir ad değildir
 * (hesap ekranının profil çekmecesi de aynı ayrımı yapıyor — orada alan boş açılır).
 */
export function isNameMissing(me: Me): boolean {
  const name = me.name.trim();
  return name === '' || name.toLowerCase() === me.email?.trim().toLowerCase();
}

/** Telefon eksik mi — `null` da boş dizge de "yok" demektir. */
export function isPhoneMissing(me: Me): boolean {
  return me.phone === null || me.phone.trim() === '';
}

/**
 * Bu hesabın künyesi eksik mi — akışı AÇAN soru, tek cümlede. Üç tetik noktası (giriş sonrası,
 * OAuth dönüşü, sepete giriş) aynı fonksiyonu çağırır: ölçütü her kapının kendi başına kurması,
 * bir gün birinin sorup ötekinin sormaması demekti.
 *
 * ADRES BİLEREK ÖLÇÜTTE DEĞİL (kullanıcı kararı 10.08): akışın adres adımı "Sonra ekleyeceğim"
 * ile geçilebiliyor. Adresi ölçüte koysaydık, adresi erteleyen müşteriye akış her sepete girişte
 * yeniden açılırdı — geçilebilir bir adımı zorunlu bir kapıya çevirmek olurdu. Adres AKIŞIN
 * İÇİNDE sorulur; sipariş ekranı da kendi çekmecesiyle oracıkta ister.
 */
export function hasProfileGap(me: Me): boolean {
  return isNameMissing(me) || isPhoneMissing(me);
}
