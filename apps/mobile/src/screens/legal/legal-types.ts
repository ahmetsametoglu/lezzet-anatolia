import type { LocalizedCopy } from '@lezzet/i18n';
// DEĞER bağı: tip `typeof messages`ten türüyor, ama `isLegalPageKey` sözlüğü ÇALIŞMA ZAMANINDA da
// yokluyor — `import type` yeterli olmazdı.
import messages from './messages.json';

/*
  BİLGİ SAYFALARININ tip modülü (view DEĞİL) — beş sayfanın ORTAK sözleşmesi.

  Metnin kendisi `messages.json`'da ve oraya ELLE yazılmadı: web'in `legal` klasöründeki beş
  `content.json` dosyasından üretildi (üç dil, beş sayfa, ~82 KB;
  `apps/web/app/(customer)/[locale]/legal`). Aynı cümlelerin iki yüzeyde iki kopyası bugün ZORUNLU — hukuk metinleri için
  paylaşılan bir içerik paketi yok ve `packages/*` bu şeridin yazma alanı değil; terfi ihtiyacı
  raporlandı. Kopyanın kendisi elle taşınmadığı için ilk günün sapma riski yok, ama metin
  güncellendiğinde İKİ yerin birlikte güncellenmesi gerekir.
*/

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Rotanın tanıdığı sayfa anahtarları — sözlüğün kendisinden TÜRER, ikinci bir liste yok.
 * İhraç EDİLMEZ: dışarıya açılan kapı `isLegalPageKey`; adı ayrıca dışarıdan anılmıyor (knip).
 */
type LegalPageKey = keyof Messages['pages'];

/**
 * Serbest rota parametresini (`/legal/<ne-gelirse>`) sayfa anahtarına daraltır.
 *
 * Sözlük ÜÇ DİLDE aynı anahtar ağacını taşıyor (üretici betik pariteyi doğruluyor), o yüzden
 * yoklama tek dil üstünden yapılabilir. Tanınmayan anahtar `false` döner ve ekran "bu sayfa yok"
 * bloğunu çizer — sessizce boş bir ekran göstermek, kırık bağlantıyı görünmez yapardı.
 */
export function isLegalPageKey(value: string): value is LegalPageKey {
  return value in messages.fr.pages;
}

/**
 * Bir metin bölümü — başlık + paragraflar + (varsa) madde listesi.
 *
 * ÜÇ ALAN DA ZORUNLU ve diziler `readonly`: sözlükte madde listesi olmayan bölümler boş dizi
 * taşıyor ve TypeScript JSON'daki `[]`i `never[]` olarak okuyor. `readonly string[]` ikisini de
 * kabul eder; tipi `string[]` yazsaydık ya da alanı isteğe bağlı bıraksaydık, beş sayfanın
 * bölümleri BİRLEŞİM tipine düşer ve `bullets.map(...)` derlemede kırılırdı (ölçüldü).
 */
export interface LegalSectionCopy {
  heading: string;
  paragraphs: readonly string[];
  bullets: readonly string[];
}

/** Soru-cevap çifti — SSS dokusunun birimi. */
export interface LegalQuestionCopy {
  question: string;
  answer: string;
}

/**
 * Sayfa altındaki çıkış bandı — "statik sayfa çıkmaz sokak olmamalı" (web `legal-types` künyesi).
 *
 * `target` sözlükte YOL değil AD taşır (`faq`, `support`, `account`): rota biçimi mobilin kendi
 * bilgisi, sözlüğün değil. Metin üç dilde aynı adları kullanır, yol tek yerde çözülür.
 */
export interface LegalNoticeCopy {
  text: string;
  links: readonly { label: string; target: string }[];
}
