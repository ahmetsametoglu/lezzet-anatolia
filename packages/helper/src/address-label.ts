import { nationalPhone } from './identity';

/*
  ADRES FORMUNUN İKİ ORTAK KURALI (21.313) — web adres penceresi ile native adres çekmecesi aynı akışı
  ve aynı sözlüğü (`@lezzet/i18n/customer/address`) kullanıyor; bu iki küçük kural iki yüzeyde ayrı
  yazılıydı ve biri bir gün ötekinden ayrılırdı (CLAUDE §1).
*/

/** "Bu adres ne?" seçimi — Ev · İş · Diğer (+ ad). */
export type AddressLabelKind = 'home' | 'work' | 'other';

/**
 * Kayıtlı başlık → seçim: dilin "Ev"/"İş" adıysa o seçim, başka bir adsa "Diğer" + ad, boşsa "Diğer".
 *
 * Etiket yazıldığı DİLDE saklanıyor (Türkçe arayüzde "Ev"): başka dilde açılan form onu "Diğer · Ev"
 * diye gösterir — adı silmek ya da başka bir seçime çevirmek, müşterinin yazdığını değiştirmek olurdu.
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
 * Hesabın künyesinden YENİ adresin varsayılanı (kullanıcı kararı 22.08: *"her hâlükârda net bir şekilde
 * bir teslimat kişisi ve teslimat numarasına ihtiyacımız var. Bu kısım varsayılan olarak kişinin
 * bilgileri ile gelebilir."*).
 *
 * **Künye yoksa `undefined`, boş dize değil:** form alanları boş açar ve müşteriden ister.
 *
 * Telefon ÜLKE İÇİ yazıma çevrilir (profil E.164 saklıyor): formda ülke kodu seçili ülkeden okunuyor;
 * ham geçseydi müşteri kodu iki kez yazılmış sanırdı. Ülke HENÜZ BİLİNMİYOR — `FR` varsayılanı; başka
 * ülkenin koduyla başlayan numarayı `nationalPhone` olduğu gibi bırakır, kırpmaz.
 */
export function addressDefaultsOf(
  profile: { name: string; phone: string | null } | null | undefined,
): { recipient: string; phone: string } | undefined {
  if (profile == null) return undefined;
  return { recipient: profile.name.trim(), phone: nationalPhone(profile.phone, 'FR') };
}
