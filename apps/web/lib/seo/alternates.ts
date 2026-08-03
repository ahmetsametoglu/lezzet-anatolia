import type { Metadata } from 'next';
import { LOCALES, localizedPath, type AppRoute, type Locale } from '@lezzet/i18n';

/**
 * `hreflang` bağları — SEO_I18N'in *"her sayfada hreflang etiketleri"* şartı (08.1).
 *
 * Bir sayfanın üç dildeki karşılığını arama motoruna söyler. Olmadan Google üç URL'i **ayrı ve
 * rakip** sayfalar sanır: aynı ürünün Türkçe ve Fransızca sayfası birbirinin sıralamasını yer ve
 * Fransız kullanıcıya Türkçe sayfa gösterilebilir. Bağ, "bunlar aynı sayfanın çevirileri"
 * demektir.
 *
 * **Yol tablosundan TÜRETİLİR, elle yazılmaz** (`localizedPath`): segment kelimeleri dile göre
 * değişiyor (`/catalogue` · `/katalog`) ve elle yazılan bir liste, tabloya yeni bir rota
 * eklendiğinde sessizce eskirdi. Sessizce eskiyen bir hreflang, yanlış hreflang'dır.
 *
 * **`x-default` FRANSIZCA**, çünkü işletme Fransa merkezli ve varsayılan dil o (`DEFAULT_LOCALE`).
 * Etiketin anlamı "dili eşleşmeyen ziyaretçi buraya" — dilsiz bir seçim değil, en makul olanı.
 *
 * `canonical` de dile göre: her dil kendi kanonik adresini gösterir. Tek bir dile işaret etseydi
 * diğer iki dilin sayfaları "kopya" ilan edilir ve indekslenmezdi.
 */
export function localeAlternates(route: AppRoute, locale: Locale, params: Record<string, string> = {}): Metadata['alternates'] {
  const languages = Object.fromEntries(LOCALES.map((l) => [l, `/${l}${localizedPath(route, l, params)}`]));
  return {
    canonical: `/${locale}${localizedPath(route, locale, params)}`,
    languages: { ...languages, 'x-default': `/fr${localizedPath(route, 'fr', params)}` },
  };
}
