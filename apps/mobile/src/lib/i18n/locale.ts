import { getLocales } from 'expo-localization';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@lezzet/i18n';

/*
  CİHAZ DİLİ → DESTEKLENEN DİL. Uygulamanın dili webdeki gibi ADRESTEN gelmez (URL yok); bu dosya
  cihazın kendi tercih sırasından tek bir `Locale` üretir.

  BU DOSYA ARTIK "UYGULAMANIN DİLİ" DEĞİL, VARSAYILANIDIR (kullanıcı kararı 09.08): dil kullanıcının
  seçimidir ve tek kaynağı `app-locale.ts`tir — o modül önce kayıtlı seçime, yoksa buraya bakar.
  Ekranlar `useAppLocale()` okur; buradaki `deviceLocale()` yalnız seçim yokken devreye girer.

  DİL KÜMESİ VE VARSAYILAN İKİNCİ KEZ YAZILMAZ: `LOCALES` ve `DEFAULT_LOCALE` `@lezzet/i18n`ten
  gelir (02-mimari §3.4 — "dil/rota @lezzet/i18n"). Web de yönlendirmesini aynı iki sabitle kuruyor
  (`apps/web/i18n/routing.ts`), yani yeni bir dil açıldığında iki yüzey birlikte öğrenir.

  YEDEK ZİNCİRİ WEB'İNKİYLE AYNI: next-intl'in dil tespiti tarayıcının `Accept-Language` SIRASINI
  gezip desteklenen ilk dile düşer, hiçbiri tutmazsa `defaultLocale`a (fr — birincil pazar Fransa).
  Burada `Accept-Language`in yerini `getLocales()` alır; sıra da aynı anlamı taşır (kullanıcının
  tercih sırası). Bölge eki (`fr-CA`, `de-AT`) YOK SAYILIR: elimizde bölgesel çeviri yok, sözlük
  dilin kendisiyle anahtarlı.

  ÜRÜN METİNLERİNİN dili SUNUCUDA çözülür (`?locale=` — uç zorunlu tutuyor); ekran metinleri ise
  ekranın kendi `messages.json`'undan. İkisi tek karardan beslenir ki ürün adı Fransızca, başlık
  Türkçe olmasın — o tek karar `app-locale.ts`tir.
*/

/**
 * Dil etiketi listesinden (BCP 47: `fr-FR`, `tr`, `de-AT`) desteklenen ilk dili seçer; hiçbiri
 * tutmazsa `DEFAULT_LOCALE`. Saf fonksiyon — cihazdan bağımsız test edilebilir.
 */
export function resolveLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    // BCP 47'nin ilk alt etiketi DİLDİR; büyük/küçük harf anlamsızdır (`FR-fr` de geçerli bir yazım).
    const language = tag.split('-')[0]?.toLowerCase();
    const supported = LOCALES.find((locale) => locale === language);
    if (supported) return supported;
  }
  return DEFAULT_LOCALE;
}

/**
 * Çözülmüş dil bir kez hesaplanır. Cihazın dil ayarı değişince iOS ve Android uygulamayı yeniden
 * başlatır, yani süreç ömrü boyunca bu değer sabittir — her okumada yerel köprüye gitmek boşuna.
 */
let resolved: Locale | null = null;

/** Uygulamanın dili — cihazın tercih sırasından çözülür. */
export function deviceLocale(): Locale {
  // `getLocales()` en az bir öğe döndürmeyi garanti eder (expo-localization sözleşmesi), ama boş
  // dizi gelse bile `resolveLocale` varsayılana düşer — garanti bir gün değişirse ekran kararmaz.
  resolved ??= resolveLocale(getLocales().map((locale) => locale.languageTag));
  return resolved;
}
