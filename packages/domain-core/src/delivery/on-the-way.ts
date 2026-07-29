/**
 * "Yoldayım" mesajı ve WhatsApp bağlantısı (11.4) — **saf karar**, I/O yok.
 *
 * Kurye tek dokunuşla müşteriye haber verir; kapıda bekleme ve ulaşılamama oranı düşer. İki ayrı iş
 * var ve ikisi de yanılmaya açık:
 *
 * 1. **Dil.** Mesaj MÜŞTERİNİN dilinde yazılır, kuryenin değil. Operasyon yüzeyi Türkçedir
 *    (CLAUDE.md §2) — ekranın diline uyulsaydı Fransız müşteriye Türkçe mesaj giderdi. Metin bu
 *    yüzden burada durur: bir sayfa `messages.json`'una konsaydı operasyon ekranının Türkçe
 *    sözlüğüne düşer, müşteri dilleri hiç doğmazdı.
 * 2. **Numara biçimi.** `wa.me` yalnız ülke kodlu, işaretsiz rakam kabul eder. Veritabanındaki
 *    numara ise elle girilmiştir: "06 12 34 56 78", "+33 6 12…", "0033612…" hepsi aynı kişidir.
 */

/** `LocalizedText` ile aynı küme; `types` paketine bağlanılmaz (STACK §4 — domain-core saftır). */
export type MessageLocale = 'tr' | 'fr' | 'de';

/** Fransa. Yerel biçimde (0 ile başlayan) girilmiş numara bu kodla tamamlanır. */
const DEFAULT_COUNTRY_CODE = '33';

const GREETINGS: Record<MessageLocale, string> = { fr: 'Bonjour', de: 'Hallo', tr: 'Merhaba' };

const TEMPLATES: Record<MessageLocale, (greeting: string) => string> = {
  fr: (greeting) => `${greeting}, je suis en route avec votre commande Lezzet Anatolia. À tout de suite !`,
  de: (greeting) => `${greeting}, ich bin mit Ihrer Lezzet-Anatolia-Bestellung unterwegs. Bis gleich!`,
  tr: (greeting) => `${greeting}, Lezzet Anatolia siparişinizle yoldayım. Birazdan oradayım!`,
};

/** Müşterinin dilinde "yoldayım" metni. Ad boşsa selamlama adsız kurulur — "Merhaba ," yazılmaz. */
export function onTheWayMessage(input: { locale: MessageLocale; customerName?: string | null }): string {
  const name = (input.customerName ?? '').trim();
  const greeting = name ? `${GREETINGS[input.locale]} ${name}` : GREETINGS[input.locale];
  return TEMPLATES[input.locale](greeting);
}

/**
 * `wa.me` bağlantısı. Numara yoksa **null** döner — çağıran düğmeyi hiç göstermez; tıklanınca
 * boşa giden bir bağlantı üretmek, kuryeye çalışmayan bir düğme sunmak olurdu.
 */
/**
 * METİNSİZ WhatsApp bağlantısı — konuşmayı açar, ne yazılacağını insana bırakır.
 *
 * `whatsAppLink`'ten ayrı çünkü orada mesaj KURULUDUR ("yoldayım"): kuryenin tek dokunuşu odur.
 * Sipariş ekranındaki "WhatsApp" düğmesi ise bir sohbet başlatma davetidir; hazır metin
 * yollasaydı operatörün söylemek istemediği bir cümle müşteriye giderdi. Numara ayrıştırması
 * ortak (`normalizePhone`) — iki düğme aynı numarayı farklı yorumlayamaz.
 */
export function whatsAppChatLink(phone: string | null | undefined, countryCode: string = DEFAULT_COUNTRY_CODE): string | null {
  const number = normalizePhone(phone, countryCode);
  return number ? `https://wa.me/${number}` : null;
}

export function whatsAppLink(input: {
  phone?: string | null;
  locale: MessageLocale;
  customerName?: string | null;
  countryCode?: string;
}): string | null {
  const number = normalizePhone(input.phone, input.countryCode ?? DEFAULT_COUNTRY_CODE);
  if (!number) return null;

  return `https://wa.me/${number}?text=${encodeURIComponent(onTheWayMessage(input))}`;
}

/**
 * Elle girilmiş numarayı `wa.me`'nin istediği biçime indirger: yalnız rakam, başında ülke kodu.
 *
 * Üç giriş biçimi de aynı sonuca varır: `+33 6…` → `336…`, `0033 6…` → `336…`, `06…` → `336…`.
 * Ayırt edilemeyecek kadar kısa girdi (rakamı 6'dan az) **null**'dır — yanlış numaraya mesaj
 * göndermektense düğmeyi hiç göstermemek doğrudur.
 */
function normalizePhone(raw: string | null | undefined, countryCode: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 6) return null;

  // `00` uluslararası çıkış öneki — ülke kodu zaten arkasından geliyor.
  if (digits.startsWith('00')) return digits.slice(2);
  // Yerel biçim: baştaki 0 ulusal önektir, ülke kodu onun yerini alır.
  if (digits.startsWith('0')) return `${countryCode}${digits.slice(1)}`;
  return digits;
}
