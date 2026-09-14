import { normalizePhone } from '@lezzet/helper';
import type { MovementDirection } from '@lezzet/types';
import { dictionarySlugOf } from './dictionary-slug';

/**
 * NOKTA ATIŞI EŞLEŞME (22.42 · kullanıcı kararı 14.09) — asistan tedarikçiyi ve cariyi LİSTEDEN
 * SEÇMEZ, faturadaki kimlikle bulur.
 *
 * Kullanıcının cümlesi: *"Yapay zekâ tüm tedarikçileri ben çekeyim, veya birkaç karakterle isimde
 * arama yapayım — bunlar doğru değil. Tedarikçinin telefon numarası, vergi numarası faturanın
 * üzerinde olur zaten. Veya tam adı. Nokta atışı bir arama yapması gerekir. Kritik bilgileri nokta
 * atışı talep edilirse vermek lazım."*
 *
 * Kural iki yönlü: (1) okuma araçları tedarikçi ve cari LİSTELEMEZ (`reference_data` tedarikçi
 * satırını bıraktı); (2) yazma araçları verilen kimliği TAM eşitlikle arar — parça ad (`includes`)
 * yok, "en yakın" yok, bulunamayınca aday listesi yok. Eşitlik normalleştirilmiş eşitliktir: ad için
 * sözlük slug'ı (Türkçe/Fransızca harf ve büyük-küçük farkı silinir — `Cabinet Comptable Muller` =
 * `cabinet comptable MULLER`), vergi numarası için boşluk/nokta/tire atılmış büyük harf
 * (`FR 12 345 678 901` = `FR12345678901`), telefon için E.164 (`normalizePhone`).
 *
 * Saf ve DB'siz: kayıt listesini çağıran verir — küçük, operatörün elle kurduğu kümeler (`CLAUDE §1`
 * tek turda çekilen sınıf). Sonuç üç hâlden biri: bulundu · yok · birden çok. "Birden çok" hata
 * değil olgudur: iki anahtar iki ayrı kayda gidiyorsa fatura ile kayıt çelişiyor demektir ve karar
 * makinenin değil yöneticinin.
 */
export type PinpointOutcome<T> = { status: 'found'; record: T } | { status: 'none' } | { status: 'ambiguous'; count: number };

export interface SupplierIdentity {
  vatNumber?: string | null;
  phone?: string | null;
  name?: string | null;
}

/** Vergi numarası anahtarı: büyük harf, yalnız harf ve rakam. Dört karakterden kısa anahtar yoktur. */
export function vatKeyOf(value: string | null | undefined): string | null {
  const key = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return key.length >= 4 ? key : null;
}

/** Telefon anahtarı: E.164 (`normalizePhone`, pazar varsayılanı FR). Çözülemeyen → `null`. */
export function phoneKeyOf(value: string | null | undefined): string | null {
  return value ? normalizePhone(value) : null;
}

/** Ad anahtarı: sözlük slug'ı — harf farkları ve ayraçlar silinir. Boş → `null`. */
export function nameKeyOf(value: string | null | undefined): string | null {
  return value ? dictionarySlugOf(value) : null;
}

/** Eşleşen kayıtlardan sonuç: kimliğe göre tekilleştirilir — aynı kayıt iki anahtardan da gelmiş olabilir. */
export function pinpointOutcomeOf<T extends { id: string }>(hits: readonly T[]): PinpointOutcome<T> {
  const distinct = [...new Map(hits.map((hit) => [hit.id, hit] as const)).values()];
  if (distinct.length === 1) return { status: 'found', record: distinct[0]! };
  if (distinct.length === 0) return { status: 'none' };
  return { status: 'ambiguous', count: distinct.length };
}

/** Bir kimlik verildi mi — hiçbiri yoksa çağıran "tedarikçi verilmedi" der, aramaz. */
export function hasSupplierIdentity(identity: SupplierIdentity): boolean {
  return Boolean(vatKeyOf(identity.vatNumber) ?? phoneKeyOf(identity.phone) ?? nameKeyOf(identity.name));
}

/**
 * Tedarikçi — vergi numarası, telefon ya da tam ad. Verilen her anahtar ayrı ayrı aranır ve
 * bulunanların BİRLEŞİMİ değerlendirilir: iki anahtar iki ayrı kayda gidiyorsa "birden çok", tek
 * kayda gidiyorsa "bulundu". Telefon tedarikçinin `contact.phone` alanındadır (ayrı kolon yok).
 */
export function pinpointSupplier<T extends { id: string; name: string; vatNumber: string | null; contact: Record<string, unknown> | null }>(
  suppliers: readonly T[],
  identity: SupplierIdentity,
): PinpointOutcome<T> {
  const vat = vatKeyOf(identity.vatNumber);
  const phone = phoneKeyOf(identity.phone);
  const name = nameKeyOf(identity.name);
  const hits: T[] = [];
  for (const supplier of suppliers) {
    if (vat && vatKeyOf(supplier.vatNumber) === vat) hits.push(supplier);
    const supplierPhone = supplier.contact && typeof supplier.contact.phone === 'string' ? supplier.contact.phone : null;
    if (phone && phoneKeyOf(supplierPhone) === phone) hits.push(supplier);
    if (name && nameKeyOf(supplier.name) === name) hits.push(supplier);
  }
  return pinpointOutcomeOf(hits);
}

/**
 * Cari — tam ad ya da EŞLEŞME KELİMESİ (`counterparty.keywords`, banka satırının tanıdığı kelimeler).
 * Kelime de tam eşitlikle aranır: parça arama açılsaydı "SA" gibi kısa bir kelime her adı yakalardı
 * (banka motoru aynı sebeple kelimeyi en az üç harf ister).
 */
export function pinpointCounterparty<T extends { id: string; name: string; keywords: readonly string[] }>(
  counterparties: readonly T[],
  name: string | null | undefined,
): PinpointOutcome<T> {
  const wanted = nameKeyOf(name);
  if (!wanted) return { status: 'none' };
  const hits = counterparties.filter((c) => nameKeyOf(c.name) === wanted || c.keywords.some((keyword) => nameKeyOf(keyword) === wanted));
  return pinpointOutcomeOf(hits);
}

/**
 * Tür — sözlükteki slug ya da okunur ad, YÖNE uygun. Eşleşmeyen kelime `null` döner: uydurulmuş bir
 * türle "izahlı" görünmesindense hareket türsüz yazılır ve izah kuyruğuna düşer. Uygulayıcı, kuyruk
 * formu ve MCP aracı aynı kararı buradan okur — bir tur üç yerde üç kopya vardı.
 */
export function matchNature<T extends { slug: string; label: string; direction: MovementDirection | null }>(
  natures: readonly T[],
  word: string | null | undefined,
  direction: MovementDirection,
): T | null {
  const wanted = nameKeyOf(word);
  if (!wanted) return null;
  const hit = natures.find((nature) => nature.slug === wanted || nameKeyOf(nature.label) === wanted);
  return hit && (hit.direction === null || hit.direction === direction) ? hit : null;
}
