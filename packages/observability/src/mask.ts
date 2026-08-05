/**
 * Kişisel verinin log'a MASKELENEREK yazılması (kullanıcı kararı, 03.08).
 *
 * Kural bugüne kadar ikiliydi: *"log'a kimlik yazılır, içerik yazılmaz"* — `orderId` evet, e-posta
 * hayır. Pratikte bu, teşhis edilemeyen bir sınıf bırakıyordu: **kimliği olmayan yollar.** Misafir
 * OTP'si, ziyaretçiye açık yer çözümü, mail gönderimi — buralarda `customerId` yok ve e-postayı
 * tamamen silmek "hangi kayıt" sorusunu cevapsız bırakıyor, arıza tekrarlanana kadar kör kalıyoruz.
 *
 * Maskelenmiş hâl üçüncü bir kategoridir ve iki ucun arasında durur: **kim olduğunu söylemez, hangi
 * kayıt olduğunu söyler.** `a***@example.com` bir kişiyi tanımlamaz ama aynı adresin iki kaydını
 * eşleştirmeye, alan adına göre teslim sorunu ayırmaya yeter.
 *
 * **Maskeleme geri döndürülemez olmalı** — kısaltma değil, silme. Yerel kısmın ilk harfi kalır
 * (alan adına göre gruplamak için), gerisi gider. Alan adı korunur: `gmail.com` kimseyi
 * tanımlamaz, ama "tüm Gmail teslimatları düşüyor" sorusunun tek dayanağıdır.
 *
 * **Serbest metin de taranır** (`scrubMessage`): en tehlikeli sızıntı bizim yazdığımız bağlam değil,
 * veritabanının kendi hata mesajıdır — Postgres kısıt ihlalinde değeri gövdeye gömer
 * (`Key (postal_code, email)=(75011, ahmet@example.com) already exists`). O metin `error_log.message`
 * alanına olduğu gibi düşüyordu.
 */

/** Metin içinde e-posta arayan kalıp — `scrubMessage` bunu maskelemek için kullanır. */
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Postgres'in kısıt ihlali gövdesine gömdüğü değer çifti. */
const PG_KEY_PAYLOAD = /Key \([^)]*\)=\([^)]*\)/g;

/**
 * Metin içinde TELEFON GÖRÜNÜMLÜ dizi (05.08 · statik metin söz denetimi, ölçüm 4).
 *
 * `maskPhone` yazılıydı ama serbest metin taramasına bağlı değildi: gizlilik metni *"hata
 * kayıtlarında kişisel veri yalnız maskelenmiş biçimde tutulur"* diye söz veriyor, e-posta
 * maskeleniyordu, telefon maskelenmiyordu. Misafir OTP ve adres doğrulama yolları telefonla
 * çalışıyor — bir kısıt ihlali ya da sağlayıcı hatası numarayı olduğu gibi `error_log`'a düşürürdü.
 *
 * Kalıp BİLEREK kaba, kararı `scrubMessage` içindeki hane sayımı veriyor. Ters kurgu — regex'i
 * daraltıp "yalnız gerçek telefonu yakala" demek — kaçırdığında sessizce sızdırır; fazla yakalayıp
 * sayımla elemek, en kötü ihtimalle bir sayıyı gereksiz maskeler.
 *
 * Sınır koruması (`(?<![\w.])` … `(?!\w)`) uzun bir jetonun ortasından parça koparmayı engeller;
 * yoksa uuid ya da damga içinden telefon "bulunur" ve okunmaz bir mesaj kalırdı.
 */
const PHONE_IN_TEXT = /(?<![\w.])(?:\+\d[\d\s.-]{5,17}\d|0\d[\d\s.-]{6,13}\d)(?!\w)/g;

/** Telefon sayılabilecek hane aralığı — E.164 tavanı 15, altı hanenin altı numara değildir. */
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

/**
 * `ahmet@example.com` → `a***@example.com`. Ayrıştırılamayan girdi tamamen gider: biçimi
 * tanımadığımız bir dizgede neyin kişisel olduğunu da bilemeyiz.
 */
export function maskEmail(raw: string | null | undefined): string {
  if (!raw) return '***';
  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) return '***';
  return `${raw[0]}***${raw.slice(at)}`;
}

/**
 * `+33612345678` → `+33*****78`. Ülke ön eki ve son iki hane kalır: ilki kanal/ülke sorunlarını
 * ayırmaya, ikincisi müşteriyle konuşurken "sondaki iki hane" diye teyitleşmeye yarar.
 */
export function maskPhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/[^\d+]/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 3)}${'*'.repeat(Math.max(0, digits.length - 5))}${digits.slice(-2)}`;
}

/**
 * Serbest metinden kişisel veriyi çıkarır. `captureError` bunu HER mesaja **ve yığın izine**
 * uygular — tek kapı, çünkü sızıntı çoğu zaman bizim yazmadığımız bir metinden geliyor ve her
 * çağıranın hatırlaması gereken bir kural, bir gün hatırlanmayacak bir kuraldır.
 *
 * Sıra önemli: PG gövdesi önce düşer (içindeki değerlerin tamamını birden alır), sonra kalan
 * metinde e-posta ve telefon tek tek maskelenir.
 */
export function scrubMessage(message: string): string {
  return message
    .replace(PG_KEY_PAYLOAD, 'Key (…)=(…)')
    .replace(EMAIL_IN_TEXT, (m) => maskEmail(m))
    .replace(PHONE_IN_TEXT, (m) => {
      // Kararı hane sayısı verir, kalıp değil: sürüm numarası, tutar, damga telefon değildir ve
      // maskelenirse hata mesajı okunamaz hâle gelir — teşhis için mesajın kendisi de lazım.
      const digits = m.replace(/\D/g, '').length;
      return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS ? maskPhone(m) : m;
    });
}
