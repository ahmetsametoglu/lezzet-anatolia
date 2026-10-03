import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { readTtfAdvances, type FontAdvances } from './ttf-advances';

/*
  Etiket şablonunun yazdığı Karla'nın harf genişlikleri, raster tarafının da yüklediği aynı `.ttf` dosyalarından okunur.
  Dosya ilk ölçümde okunur: modül yüklenirken okumak, etiket basmayan süreçte (web) boşuna iki dosya okuması olurdu.
*/

/** Şablonun kullandığı ağırlıklar — gövde ve yarı kalın başlıklar. */
export type KarlaWeight = 400 | 600;

const require = createRequire(import.meta.url);

const FONT_FILES: Readonly<Record<KarlaWeight, string>> = {
  400: '@expo-google-fonts/karla/400Regular/Karla_400Regular.ttf',
  600: '@expo-google-fonts/karla/600SemiBold/Karla_600SemiBold.ttf',
};

const yuklu = new Map<KarlaWeight, FontAdvances>();

function font(weight: KarlaWeight): FontAdvances {
  const hazir = yuklu.get(weight);
  if (hazir) return hazir;
  // İşaretsiz Turbopack `.ttf`yi modül diye pakete katmaya çalışır ve web derlemesi düşer; dosya çalışma anında okunur.
  const okunan = readTtfAdvances(readFileSync(require.resolve(/* turbopackIgnore: true */ FONT_FILES[weight])));
  yuklu.set(weight, okunan);
  return okunan;
}

/** Fontta olmayan harf en geniş harflerden biri ("M", ≈0,85 em) sayılır: dar saymak metni kâğıttan taşırır, geniş saymak yalnız erken keser. */
function fallbackEm(weight: KarlaWeight): number {
  return font(weight).advanceEm(0x4d) ?? 0.85;
}

/** Metnin genişliği (mm) — harflerin ilerlemelerinin toplamı. */
export function textWidthMm(text: string, fontMm: number, weight: KarlaWeight = 400): number {
  const f = font(weight);
  const yedek = fallbackEm(weight);
  let em = 0;
  // Kod noktası kod noktası: `for…of` vekil çiftlerini bölmez, `text[i]` bölerdi.
  for (const ch of text) em += f.advanceEm(ch.codePointAt(0)!) ?? yedek;
  return em * fontMm;
}

/**
 * Verilen genişliğe sığan en uzun ön ek — taşan kısım "…" ile kesilir.
 *
 * Kesmek gerekiyorsa üç nokta da ÖLÇÜYE dahil: onu bedava saymak, tam sınırdaki bir adı bir
 * karakter payla taşırırdı.
 */
export function fitMm(text: string, widthMm: number, fontMm: number, weight: KarlaWeight = 400): string {
  if (textWidthMm(text, fontMm, weight) <= widthMm) return text;

  const harfler = [...text];
  const ucNokta = textWidthMm('…', fontMm, weight);
  let genislik = 0;
  let n = 0;
  while (n < harfler.length) {
    const harf = textWidthMm(harfler[n]!, fontMm, weight);
    if (genislik + harf + ucNokta > widthMm) break;
    genislik += harf;
    n += 1;
  }
  // Tek harf bile sığmıyorsa geriye yalnız üç nokta kalır: boş satır hiçbir şey söylemez, üç
  // nokta "burada bir şey vardı ve sığmadı" der.
  return `${harfler.slice(0, n).join('')}…`;
}

/**
 * Satır başlatabilecek parçalar: içinde iki ardışık harf olmayan parça (`·`, `×`, `90`, `g`) öncekine yapışır, gramaj iki satıra
 * bölünüp öksüz kalmasın. Ölçüt birim listesi tutmaz, listede olmayan bir birimle sessizce bozulmaz.
 */
function breakPoints(text: string): string[] {
  const parcalar: string[] = [];
  for (const parca of text.split(' ')) {
    if (parca.length === 0) continue;
    if (parcalar.length > 0 && !/\p{L}\p{L}/u.test(parca)) {
      parcalar[parcalar.length - 1] += ` ${parca}`;
      continue;
    }
    parcalar.push(parca);
  }
  return parcalar;
}

/**
 * Metni kelime sınırından en fazla `maxLines` satıra böler; sürekli ruloda yükseklik bedava olduğu için alt satıra inmek
 * küçültmekten iyidir. Yalnız son satır ve tek başına sığmayan kelime "…" ile kesilir.
 */
export function wrapMm(
  text: string,
  widthMm: number,
  fontMm: number,
  maxLines: number,
  weight: KarlaWeight = 400,
): string[] {
  if (maxLines <= 1) return [fitMm(text, widthMm, fontMm, weight)];

  const kelimeler = breakPoints(text);
  if (kelimeler.length === 0) return [''];

  const satirlar: string[] = [];
  let aktif = '';
  /* Sırayı İNDİSLE gezmek şart: `indexOf` aynı kelimenin İLK geçtiği yeri döner ve "Kek 9 × 90 g
     Kek" gibi tekrarlı bir adda kalanı yanlış yerden keserdi. */
  for (let i = 0; i < kelimeler.length; i += 1) {
    const kelime = kelimeler[i]!;
    const aday = aktif === '' ? kelime : `${aktif} ${kelime}`;
    if (textWidthMm(aday, fontMm, weight) <= widthMm) {
      aktif = aday;
      continue;
    }
    if (aktif !== '') satirlar.push(aktif);
    // Son satıra geldiysek KALANIN TAMAMI oraya sığdırılır: erken durup kelimeleri yutmak,
    // gizlenen kısmı hiç söylememek olurdu.
    if (satirlar.length === maxLines - 1) {
      satirlar.push(fitMm(kelimeler.slice(i).join(' '), widthMm, fontMm, weight));
      return satirlar;
    }
    aktif = textWidthMm(kelime, fontMm, weight) <= widthMm ? kelime : fitMm(kelime, widthMm, fontMm, weight);
  }
  if (aktif !== '') satirlar.push(aktif);
  return satirlar;
}
