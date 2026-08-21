// Kimlik anahtarı normalizasyonu — bağımlılıksız, saf.
// Telefon kimlik anahtarıdır (CHANNELS §3); eşleşmenin doğru olması için tek biçime indirilir.

/**
 * Ülke arama kodları — hizmet ettiğimiz iki pazar.
 *
 * **Tek kaynak olması şart:** kod hem numarayı BİRLEŞTİRİRKEN (`normalizePhone`) hem AYIRIRKEN
 * (`nationalPhone`) hem de ekranda ülke alanının yanında yazarken kullanılıyor. Üç yerde ayrı
 * yazılsaydı biri bir gün ötekinden farklı olurdu ve sonucu sessiz olurdu: müşteri "+33" görüp
 * numarasını ona göre yazar, kayıt başka bir kodla oluşur (CLAUDE §1).
 */
export const DIAL_CODE = { FR: '+33', DE: '+49' } as const;

/**
 * E.164 numaradan ÜLKE İÇİ yazımı çıkarır — formda gösterilecek hâl.
 *
 * `+33768012345` → `0768012345`. Baştaki sıfır GERİ KONUR: hem Fransa hem Almanya ülke içi
 * numarayı gövde sıfırıyla yazar ve müşteri numarasını öyle bilir; `768012345` göstermek ona
 * kendi numarasını yabancılaştırır. `normalizePhone` zaten o sıfırı düşürüp kodu eklediği için
 * gidiş-dönüş kayıpsızdır: `0768012345` → `+33768012345` → `0768012345`.
 *
 * **Yalnız FR/DE için doğru** ve bu bilinçli bir sınır: gövde sıfırı evrensel değil (İtalya
 * korur, İspanya hiç kullanmaz). Üçüncü bir pazar açıldığında bu fonksiyon o pazarın kuralını
 * öğrenmeli — `DIAL_CODE`a satır eklemek yetmez.
 *
 * Kod eşleşmiyorsa numara OLDUĞU GİBİ döner: yabancı bir numarayı kırpmaktansa ham göstermek
 * doğrudur; müşteri ne yazdıysa onu görür.
 */
export function nationalPhone(e164: string | null | undefined, country: 'FR' | 'DE'): string {
  const value = (e164 ?? '').trim();
  const cc = DIAL_CODE[country];
  if (!value.startsWith(cc)) return value;
  return `0${value.slice(cc.length)}`;
}

/**
 * Telefonu E.164'e yakın tek biçime indirir (pazar varsayılanı FR/DE).
 * Pragmatik: boşluk/tire/parantez atılır; `00` → `+`; `+` yoksa ve `0` ile başlıyorsa
 * varsayılan ülke kodu uygulanır (FR=+33, DE=+49). Zamanı gelince libphonenumber ile güçlendirilir.
 */
export function normalizePhone(input: string, defaultCountry: 'FR' | 'DE' = 'FR'): string | null {
  const cleaned = input.replace(/[\s().-]/g, '');
  if (!cleaned) return null;

  let digits = cleaned;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;

  if (digits.startsWith('+')) {
    const rest = digits.slice(1);
    return /^\d{6,15}$/.test(rest) ? `+${rest}` : null;
  }

  // Ülke içi biçim: baştaki 0 düşer, ülke kodu eklenir. Kod `DIAL_CODE`tan — ayrışmasın.
  const cc = DIAL_CODE[defaultCountry];
  const national = digits.replace(/^0/, '');
  return /^\d{5,14}$/.test(national) ? `${cc}${national}` : null;
}

/** E-posta ikinci kimlik anahtarıdır (DOMAIN §10); trim + küçük harf. */
export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  return e.length > 0 ? e : null;
}

/**
 * E-postanın BİÇİM denetimi — "kullanıcı yazarken elendi mi" sorusu, "bu adres var mı" değil.
 *
 * Kasten gevşek: tek `@`, iki yanında boşluksuz metin, sağda bir nokta. Daha sıkı bir desen
 * (RFC 5322) meşru adresleri eler ve bunu **sessizce** yapar — müşteri neden reddedildiğini
 * anlamaz. Adresin gerçekten var olup olmadığını zaten OTP kodu söylüyor; bu denetimin tek işi
 * ekranın boşuna kod göndermesini engellemek.
 *
 * `normalizeEmail`den AYRI: o kimlik anahtarını tek biçime indirir (kayıt/eşleşme için) ve
 * biçime bakmaz. İkisini birleştirmek, normalize eden 20 çağrı yerinin hepsine bir doğrulama
 * kararı taşımak olurdu. Ev `helper`: hem müşteri formları hem sunucu kapıları okuyor.
 */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
