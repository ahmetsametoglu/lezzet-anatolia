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
  /** Normalize telefonla eşleşen müşteri kimliği. */
  byPhone?: string | null;
  /** E-posta ile eşleşen müşteri kimliği. */
  byEmail?: string | null;
}

export interface IdentityInput {
  phone?: string | null;
  email?: string | null;
  /** Telefon ülkesi varsayılanı (pazar FR/DE). */
  defaultCountry?: Country;
}

export type IdentityResolution =
  /** Tek müşteri eşleşti (ya da iki anahtar aynı müşteriye çıktı) — ona bağlan. */
  | { action: 'attach'; customerId: string; normalizedPhone: string | null; email: string | null }
  /** Hiç eşleşme yok — yeni (WhatsApp'tan geliyorsa taslak) müşteri aç. */
  | { action: 'create'; normalizedPhone: string | null; email: string | null }
  /** İki anahtar İKİ FARKLI müşteriye çıktı — sessizce seçim yapılmaz, admin birleştirir. */
  | { action: 'conflict'; phoneCustomerId: string; emailCustomerId: string }
  /** Ne telefon ne e-posta verilmiş — kimlik kurulamaz. */
  | { action: 'insufficient' };

export function resolveIdentity(input: IdentityInput, candidates: IdentityCandidates = {}): IdentityResolution {
  const normalizedPhone = input.phone ? normalizePhone(input.phone, input.defaultCountry ?? 'FR') : null;
  const email = input.email?.trim().toLowerCase() || null;

  // Geçersiz telefon (normalize edilemedi) verilen tek anahtarsa kimlik kurulamaz.
  if (!normalizedPhone && !email) return { action: 'insufficient' };

  const byPhone = candidates.byPhone ?? null;
  const byEmail = candidates.byEmail ?? null;

  if (byPhone && byEmail && byPhone !== byEmail) {
    return { action: 'conflict', phoneCustomerId: byPhone, emailCustomerId: byEmail };
  }

  const matched = byPhone ?? byEmail;
  if (matched) return { action: 'attach', customerId: matched, normalizedPhone, email };

  return { action: 'create', normalizedPhone, email };
}
