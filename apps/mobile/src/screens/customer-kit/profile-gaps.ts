import type { Me } from '@/lib/api/me';

/*
  PROFİL BOŞLUKLARI — "bu hesabın künyesi eksik mi" sorusunun TEK cevabı; iki ekranın ortak ölçütü
  (ödeme ekranının iletişim bölümü + künye tamamlama akışı). İki kopya bir gün ayrışır ve müşteri
  ya hiç sorulmayan ya da bitmeyen bir alan görürdü (CLAUDE §1).

  ── KİTE TAŞINDI (15.08) ────────────────────────────────────────────────────
  Dosya `screens/profile-setup/` altındaydı çünkü tek tüketicisi o akış ve onun KAPISIYDI. Kapı
  kalktı (kullanıcı kararı 15.08: giriş sonrası künye sorulmaz), ikinci tüketici ödeme ekranı oldu;
  iki ayrı ekranın paylaştığı kural artık kitte yaşıyor.

  ── SORU NEREDE SORULUYOR: ARTIK SİPARİŞTE ──────────────────────────────────
  Bu ölçüt bir zamanlar ZORUNLU BİR KAPIYI besliyordu: girişten hemen sonra, OAuth dönüşünde ve
  sepete girerken müşteri `/profile-setup`e yollanıyordu. Kullanıcının kararı: *"kullanıcı adresini
  ve adını vermek istemeyebilir giriş yaptığında, bu bizim için problem olmamalı… bunu ilk sipariş
  verdiği zaman talep edelim."* Ölçüt aynı kaldı, SORULDUĞU AN değişti.

  ÖLÇÜLMÜŞ ARIZA (10.08): e-posta/OTP ile açılan hesapta müşterinin ADI HİÇ DOLMUYOR. Profil
  satırını açan tetik adı sağlayıcının künyesinden okuyor (`raw_user_meta_data->>'full_name'|
  'name'`, `0002_auth_user_profile_trigger.sql`) ve OTP yolunda orası boştur — uydurma bir ad
  yazılmaz, ad BOŞ kalır. Bu yüzden "adı var mı" sorusunun bir yerlerde sorulması gerekiyor; bugün
  o yer siparişin kendisi.
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

/*
  `hasProfileGap` SİLİNDİ (15.08) — tek çağıranı kaldırılan kapıydı (`use-profile-setup-gate.hook`,
  o da silindi). Ödeme ekranı iki yüklemi AYRI AYRI soruyor, çünkü yalnız EKSİK olan alanı çiziyor:
  birleşik bir "künye eksik mi" sorusu hangi alanın eksik olduğunu söylemiyor.

  ADRES BU DOSYANIN KONUSU DEĞİL ve hiç olmadı (kullanıcı kararı 10.08): teslimat adresi siparişin
  kendi ön şartı ve ödeme ekranı onu kendi bölümünde istiyor.
*/
