import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { readTtfAdvances, type FontAdvances } from './ttf-advances';

/*
  ETİKET TİPOGRAFİSİNİN ÖLÇÜSÜ — Karla'nın kendi dosyasından (06.09).

  Şablon `font-family="Karla"` yazıyor, yani etiketin yazı tipi zaten burada verili bir karar. Bu
  dosya o kararın ÖLÇÜSÜNÜ getiriyor: hangi harf ne kadar yer kaplıyor. Kaynak tek — aynı `.ttf`
  dosyaları raster tarafında da yükleniyor (`apps/mobile-api/src/lib/label-png.ts`), yani ölçen
  font ile basan font aynı; ikinci bir font kaynağı açılmıyor (CLAUDE §1).

  TEMBEL YÜKLEME: dosya ilk ölçümde okunur ve modül ömrü boyunca durur. Modül yüklenirken okumak,
  etiket hiç basılmayan bir süreçte (web sunucusu) bedava iki dosya okuması olurdu.
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
  const okunan = readTtfAdvances(readFileSync(require.resolve(FONT_FILES[weight])));
  yuklu.set(weight, okunan);
  return okunan;
}

/**
 * Fontta OLMAYAN harfin genişliği — Latin büyük "M"in ilerlemesi (≈0,85 em), yani ölçülen en
 * geniş harflerden biri.
 *
 * Bir ödünleşme ve yönü kasıtlı: bilinmeyen harfi DAR saymak onu kâğıdın dışına taşırır, geniş
 * saymak yalnız erken keser. Katalogda Latin dışı ad yok; bu dal bir gün gelirse diye duruyor.
 */
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
 * Satır başlatabilecek parçalar — boşlukla bölünür, ama **kendi başına kelime olmayan parça bir
 * öncekine yapışır**.
 *
 * Gerekçe kâğıttan geldi (06.09): "Mangolu Artisan Kek · 9 × 90 g" boşluktan bölününce
 * *"…Kek · 9 ×"* / *"90 g"* çıkıyordu — gramaj ikiye ayrılmış, ikinci satır "90 g" diye öksüz
 * kalmıştı. Ayırıcı (`·`), çarpı, rakam ve tek harflik birim (`g`) satır BAŞLATMAZ; okuyan göz
 * onları kendinden öncekiyle birlikte okur.
 *
 * Ölçüt "iki ardışık harf": gerçek bir kelimede vardır (`Kek`, `Boy`), ölçü parçalarında yoktur
 * (`·`, `9`, `×`, `90`, `g`). Katalogdan bağımsız ve dile bağlı olmayan bir kural — birim listesi
 * tutmak, bir gün listede olmayan bir birimle sessizce bozulurdu.
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
 * Metni satırlara böler — **kelime sınırından**, en fazla `maxLines` satır.
 *
 * Sürekli ruloda yükseklik bedava (kâğıt içerik bitince kesiliyor), yani alt satıra inmek
 * küçültmekten iyidir: kullanıcının şikâyeti zaten okunmayacak kadar küçük yazıydı.
 *
 * Son satır taşarsa "…" ile kesilir; ara satırlar kesilmez. Tek başına sığmayan bir kelime (uzun
 * bir SKU gibi) kendi satırında kesilir — bölünecek bir yeri olmadığı için.
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
