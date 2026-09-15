import { nationalPhone } from '@lezzet/helper';

/** "Bu adres ne?" seçimi. */
export type AddressLabelKind = 'home' | 'work' | 'other';

/** Etiketsiz adreste başlık şehirdir, uydurma etiket yazılmaz; boş etiket de etiketsizdir. */
export function addressTitle(address: { label?: string | null; city: string }): string {
  return address.label || address.city;
}

/**
 * Kayıtlı başlıktan seçim: dilin "Ev"/"İş" adıysa o seçim, başka bir adsa "Diğer" ve ad, boşsa "Diğer".
 * Etiket yazıldığı dilde saklanır; başka dilde açılan form onu "Diğer" altında gösterir, müşterinin yazdığı değiştirilmez.
 */
export function addressLabelKind(
  label: string | null | undefined,
  names: { kindHome: string; kindWork: string },
): { kind: AddressLabelKind; custom: string } {
  const value = label?.trim() ?? '';
  if (value.toLocaleLowerCase() === names.kindHome.toLocaleLowerCase()) return { kind: 'home', custom: '' };
  if (value.toLocaleLowerCase() === names.kindWork.toLocaleLowerCase()) return { kind: 'work', custom: '' };
  return { kind: 'other', custom: value };
}

/**
 * Yeni adresin alıcı ve telefon varsayılanı hesabın künyesinden gelir; künye yoksa `undefined` döner ve form alanları boş açar.
 * Telefon ülke içi yazıma çevrilir, çünkü ülke kodu formda ayrı seçiliyor; ülke henüz bilinmediğinden FR varsayılır ve başka ülkenin numarası olduğu gibi kalır.
 */
export function addressDefaultsOf(
  profile: { name: string; phone: string | null } | null | undefined,
): { recipient: string; phone: string } | undefined {
  if (profile == null) return undefined;
  return { recipient: profile.name.trim(), phone: nationalPhone(profile.phone, 'FR') };
}
