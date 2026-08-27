import type { MeAddress } from '@/lib/api/addresses';

/*
  ADRES OKUNUŞU — bir adresin BAŞLIĞI ve TEK SATIRI. İkisi de sözleşmenin alanlarından TÜRETİLİR,
  saklanmaz: iki yerde tutulan aynı gerçek bir gün ayrışır.

  Buraya taşındı çünkü aynı birleşim üç yerde yazılıydı (hesap ekranının adres kartı, checkout'un
  adres listesi ve adres çekmecesinin çağıranları) — checkout dosyasındaki 21.14 işareti tam bunu
  söylüyordu; işaret kalktı, kaynak tekleşti.
*/

/** Etiketsiz adreste başlık ŞEHİRDİR — uydurma etiket yazılmaz (entity künyesindeki kural). */
export function addressTitle(address: MeAddress): string {
  return address.label ?? address.city;
}

/**
 * Kartta/satırda okunan tek satır — şablonun birleşimi (`l + ', ' + zip + ' ' + city`, v3:2023)
 * veriye uyarlandı: `line2` (kat/daire) varsa sokağın peşine girer; yutulursa teslimat adresi
 * eksik görünür.
 */
export function addressLine(address: MeAddress): string {
  const street = address.line2 === null ? address.line1 : `${address.line1}, ${address.line2}`;
  return `${street}, ${address.postalCode} ${address.city}`;
}
