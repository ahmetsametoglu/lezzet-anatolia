import type { Country } from '@lezzet/types';
import { normalizePhone } from '@lezzet/helper';

/**
 * Kimlik çözümü (03.9) — "bu kişi kim?" kararı. Saf: DB'ye bakmaz, **çağıranın getirdiği**
 * eşleşme adaylarına bakıp ne yapılacağını söyler; kaydı çağıran yazar (DOMAIN §10, CHANNELS §3).
 *
 * Anahtarlar: **telefon** (WhatsApp kimliği, E.164'e normalize edilir) ve **e-posta** (web kimliği).
 * İkisinden biri eşleşirse aynı müşteridir. Aynı kişi iki yüzeyden geldiğinde tek kayıtta birleşir.
 *
 * Kopya yine de oluşabilir (WhatsApp taslağı + web kaydı ayrı ayrı açılmışsa) — o zaman admin'in
 * "müşteri birleştir" aksiyonu devreye girer. Bu fonksiyon o durumu **görünür kılar**: iki farklı
 * müşteri iki farklı anahtardan eşleşirse `conflict` döner, sessizce birini seçmez.
 */

/** Çağıranın DB'den getirdiği eşleşme — yoksa `null`. */
export interface IdentityCandidates {
  /** Normalize telefonla eşleşen profil kimliği. */
  byPhone?: string | null;
  /** E-posta ile eşleşen profil kimliği. */
  byEmail?: string | null;
  /**
   * Auth kullanıcısına BAĞLI profil. Üçüncü anahtardır: giriş anında veritabanı trigger'ı
   * (0002) profili zaten açmış/bağlamış olabilir — kapı ondan habersiz davranırsa aynı auth
   * kullanıcısını ikinci profile yazmaya çalışır ve tekillik kısıtına çarpar.
   */
  byAuthUser?: string | null;
}

export interface IdentityInput {
  phone?: string | null;
  email?: string | null;
  /** Doğrulanmış oturum sahibi — kendi başına bir kimlik anahtarıdır (telefon/e-posta olmasa da). */
  authUserId?: string | null;
  /** Telefon ülkesi varsayılanı (pazar FR/DE). */
  defaultCountry?: Country;
}

export type IdentityResolution =
  /** Tek profil eşleşti (ya da anahtarların hepsi aynı profile çıktı) — ona bağlan. */
  | { action: 'attach'; customerId: string; normalizedPhone: string | null; email: string | null }
  /** Hiç eşleşme yok — yeni (WhatsApp'tan geliyorsa taslak) profil aç. */
  | { action: 'create'; normalizedPhone: string | null; email: string | null }
  /**
   * Anahtarlar BİRDEN ÇOK profile çıktı — sessizce seçim yapılmaz, admin birleştirir (DOMAIN §10).
   * `customerIds` çakışan profillerin tümü: üç anahtar üç ayrı kayda düşebilir, iki adlı alan bunu
   * ifade edemez.
   */
  | { action: 'conflict'; customerIds: string[] }
  /** Hiçbir kimlik anahtarı verilmemiş — kimlik kurulamaz. */
  | { action: 'insufficient' };

export function resolveIdentity(input: IdentityInput, candidates: IdentityCandidates = {}): IdentityResolution {
  const normalizedPhone = input.phone ? normalizePhone(input.phone, input.defaultCountry ?? 'FR') : null;
  const email = input.email?.trim().toLowerCase() || null;

  // Geçersiz telefon (normalize edilemedi) tek anahtarsa kimlik kurulamaz. Oturum sahibi de
  // tek başına bir anahtardır: Google ile giren kullanıcının telefonu olmayabilir.
  if (!normalizedPhone && !email && !input.authUserId) return { action: 'insufficient' };

  // Farklı profillere çıkan anahtarlar — sıra korunur (tekrarlar elenir).
  const matches = [candidates.byAuthUser, candidates.byPhone, candidates.byEmail].filter(
    (id): id is string => Boolean(id),
  );
  const distinct = [...new Set(matches)];

  if (distinct.length > 1) return { action: 'conflict', customerIds: distinct };
  if (distinct.length === 1) return { action: 'attach', customerId: distinct[0]!, normalizedPhone, email };

  return { action: 'create', normalizedPhone, email };
}
