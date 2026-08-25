import type { Country } from '@lezzet/types';
import { normalizePhone } from '@lezzet/helper';

/**
 * Kimlik çözümü (03.9) — "bu kişi kim?" kararı. Saf: DB'ye bakmaz, **çağıranın getirdiği**
 * eşleşme adaylarına bakıp ne yapılacağını söyler; kaydı çağıran yazar (DOMAIN §10, CHANNELS §3).
 *
 * Anahtarlar: **telefon** (WhatsApp kimliği, E.164'e normalize edilir) ve **e-posta** (web kimliği).
 * İkisinden biri eşleşirse aynı müşteridir. Aynı kişi iki yüzeyden geldiğinde tek kayıtta birleşir.
 *
 * ── KANITSIZ NUMARA KİMLİK DOĞURAMAZ (04.10, DOMAIN §10) ────────────────────────────────────────
 * Ayrım okumada değil YAZMADA: *"bu numara kimde"* sorusunu sormak her zaman serbesttir, *"bu
 * numara bundan sonra bu kişinin"* demek değildir.
 *
 *   **Bağlanmak (attach) serbesttir** — `byPhone` defterden gelir (`customer_phone`) ve o defterin
 *   her satırı zaten bir kanıttır. Numara operatörün klavyesinden geçmiş olsa bile, eşleştiği kayıt
 *   kanıtlanmış bir kayıttır; bağı kurmak yeni bir iddia üretmez.
 *
 *   **Yeni kimlik AÇMAK (create) kanıt ister** — `phoneProven`. Açığın tamamı buradaydı: kanıtsız
 *   bir dizeyle kimlik açılabildiği için kayıtlı olmayan bir numara ÖNCEDEN sahiplenilebiliyordu.
 *   Kanıt "bu hattı bugün elimde tutuyorum" demektir ve bugün tek kaynağı imzası doğrulanmış
 *   webhook'tan gelen mesajdır (15.7); hesap kartına ya da checkout formuna yazılan numara değil.
 *
 * Kanıtsız numara yine de **normalize edilip döndürülür** — iletişim bilgisi olarak yazılsın diye.
 *
 * Kural motorda duruyor, çağıranda değil: çağıranın *"kanıtsızken yeni kayıt açmayayım"* diye
 * davranması yeter gibi görünür ve bir gün biri unutur — o gün hata sessizdir, yalnız yanlış
 * hesaba düşmüş bir konuşma olarak görünür.
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
  /**
   * Numaranın zilyetliği KANITLANDI mı (04.10). Varsayılan `false`.
   *
   * Yalnız **yeni kimlik açmayı** yönetir: kanıtsız numara var olan bir kayda bağlanabilir (defter
   * zaten kanıt taşıyor) ama kendi başına bir kayıt DOĞURAMAZ. Gerekçe künyede.
   */
  phoneProven?: boolean;
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
  const matches = [candidates.byAuthUser, candidates.byPhone, candidates.byEmail].filter((id): id is string => Boolean(id));
  const distinct = [...new Set(matches)];

  if (distinct.length > 1) return { action: 'conflict', customerIds: distinct };
  // Bağlanmak serbest: eşleşme defterden geliyor, yani zaten kanıtlı bir kayda çıkıyor.
  if (distinct.length === 1) return { action: 'attach', customerId: distinct[0]!, normalizedPhone, email };

  // Yeni kimlik doğuyor — burada anahtarın KANITLI olması şart (04.10). Kanıtsız bir numaradan
  // kayıt açmak, o numarayı sahiplenmektir; gerçek sahibi yazdığında kendi geçmişini yabancı bir
  // hesapta bulur. E-posta ve oturum sahibi kendi doğrulama yollarından geçtiği için kanıtlıdır.
  const acabilir = Boolean(email) || Boolean(input.authUserId) || (input.phoneProven === true && Boolean(normalizedPhone));
  if (!acabilir) return { action: 'insufficient' };

  return { action: 'create', normalizedPhone, email };
}
