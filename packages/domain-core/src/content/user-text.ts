import type { PreferredLanguage, SourceLanguage, TranslationBag } from '@lezzet/types';

/**
 * **Kullanıcı metninin gösterimi ve saklanması** — saf karar, DB yok (`STACK §4`).
 *
 * Kural üç cümle: orijinal satırın kendi kolonundadır · torba yalnız ÇEVİRİLERİ tutar ve kaynak
 * dili İÇERMEZ · okuyucu site dilinde okur, o dil yoksa orijinale düşer.
 */

/** Bir satırın çeviriye dair üç alanı — kolon adları tabloya göre değişir, şekil değişmez. */
export interface TranslatableText {
  /** Kullanıcının yazdığı metin. Boş/`null` olabilir (yorumsuz puan gibi). */
  text: string | null;
  /** Orijinalin dili. `null` = henüz tespit edilmedi ya da ortada metin yok. */
  language: SourceLanguage | null;
  /** Makine çevirileri. `null` = çeviri işi henüz koşmadı ya da başarısız oldu. */
  translations: TranslationBag | null;
}

export interface ResolvedUserText {
  /** Ekrana basılacak metin. Metin yoksa `null` — boş string DEĞİL: "yorum yok" ile "boş yorum" ayrı şeyler. */
  text: string | null;
  /** Gösterilen metin makine çevirisi mi. Ekran bunu "otomatik çevrildi" olarak işaretlemeli. */
  isTranslated: boolean;
  /** Orijinalin dili — "orijinali göster" bağlantısı ve `lang` özniteliği için. */
  sourceLanguage: SourceLanguage | null;
}

/**
 * Okuyucunun diline göre gösterilecek metni seçer.
 *
 * **Yedek zinciri kısa ve bilinçli: site dili → orijinal.** `resolveLocalizedText`'teki
 * TR→FR→DE zinciri BURADA YANLIŞ olurdu: orada üç dil de yazılmış ve eşit, burada orijinalden
 * başka her şey türetilmiş. Fransız bir okuyucuya Fransızca çeviri yoksa Almanca çeviriyi
 * göstermek, ona *iki* kere uzak bir metin vermektir — orijinali göstermek hem daha dürüst hem
 * (Boşnakça bir yorumda) daha çevrilebilir.
 */
export function resolveUserText(source: TranslatableText, viewLanguage: PreferredLanguage): ResolvedUserText {
  const orijinal = source.text?.trim() ? source.text : null;
  if (!orijinal) return { text: null, isTranslated: false, sourceLanguage: null };

  // Kaynak zaten okuyucunun dilindeyse çeviriye bakmanın anlamı yok — torbada olmaması gerekir
  // (bkz. `buildTranslationBag`), ama bir gün olursa da orijinal kazanmalı.
  if (source.language === viewLanguage) return { text: orijinal, isTranslated: false, sourceLanguage: source.language };

  const ceviri = source.translations?.[viewLanguage]?.trim();
  if (ceviri) return { text: ceviri, isTranslated: true, sourceLanguage: source.language };

  return { text: orijinal, isTranslated: false, sourceLanguage: source.language };
}

/**
 * Modelin döndürdüğü üç diller çeviriden SAKLANACAK torbayı kurar — kaynak dil atılır.
 *
 * Neden atılır: orijinal zaten satırda duruyor. Kaynak dili torbaya da yazmak, aynı metnin
 * ikinci bir kopyasını üretirdi; kopyaların bir gün ayrışması ise zaman meselesidir. Ayrıca
 * `resolveUserText` "torbadan geldi = çeviridir" diyebiliyor, çünkü torbada asla orijinal olmuyor.
 *
 * Boş/boşluk çeviriler de atılır: yokluğu `null` ile bildirmek, boş string göstermekten iyidir.
 */
export function buildTranslationBag(
  sourceLanguage: SourceLanguage,
  translated: Record<PreferredLanguage, string>,
): TranslationBag {
  const bag: TranslationBag = {};
  for (const [lang, text] of Object.entries(translated) as Array<[PreferredLanguage, string]>) {
    if (lang === sourceLanguage) continue;
    if (!text?.trim()) continue;
    bag[lang] = text;
  }
  return bag;
}
