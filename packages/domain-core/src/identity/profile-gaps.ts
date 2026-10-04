/*
  Hesabın künyesinde eksik alan var mı; ödeme ekranı ile künye tamamlama akışı aynı ölçütü okur, iki kopya bir gün ayrışırdı. E-posta koduyla
  açılan hesapta ad hiç dolmaz, çünkü sağlayıcı ad vermez; bu yüzden ad ilk siparişte sorulur.
*/

/** Ad eksik mi; ad yerine yazılmış e-posta da eksik sayılır, çünkü bir e-posta adresi bir ad değildir. */
export function isNameMissing(profile: { name: string; email: string | null }): boolean {
  const name = profile.name.trim();
  return name === '' || name.toLowerCase() === profile.email?.trim().toLowerCase();
}

/** Telefon eksik mi; `null` da boş dize de "yok" demektir. */
export function isPhoneMissing(profile: { phone: string | null }): boolean {
  return profile.phone === null || profile.phone.trim() === '';
}
