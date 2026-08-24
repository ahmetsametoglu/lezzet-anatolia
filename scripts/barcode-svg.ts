/*
  ÇİZGİLİ BARKOD ÇİZİMİ — EAN-13 (paket) ve ITF-14 (koli).

  ── NEDEN QR YETMEDİ (kullanıcı bulgusu 24.08) ───────────────────────────────
  Yazılım katmanı için simge tipi fark etmez: vizör yedi biçimi birden tanıyor ve kapıya ham METİN
  gider (`scan-sheet.tsx` → `resolveScannedCode`). Ama DECODE katmanı için fark eder — QR en kolay
  okunan simgedir, gerçek depoda okutulacak şeyse EAN-13 ve ITF-14: ince çizgiler, açıya ve mesafeye
  çok daha duyarlı. Test setinin tamamını QR basmak, sınamak istediğimiz ZOR yolu atlamak olurdu.

  ── SAĞLAMA BASAMAĞI ŞART ───────────────────────────────────────────────────
  EAN/ITF okuyucuları son haneyi doğrular ve tutmayan kodu SESSİZCE yok sayar — kamera hiç tepki
  vermez, sebebi de görünmez. Bu yüzden `assertCheckDigit` var: geçersiz bir kod kâğıda basılmadan
  önce script durur (ölçüldü 24.08: elde basılı `18691000047514` geçersizdi, doğrusu ...16).

  Sistemin KENDİSİ biçim zorlamıyor ve zorlamamalı (`variant_barcode` künyesi: iç etiketler ve QR'lar
  da taranabilir) — buradaki katılık yalnız KÂĞIDA basılan simgeye ait, veriye değil.
*/

/** EAN-13 sol yarının L kodlaması; R = tümleyeni, G = L'nin ters okunuşu (aşağıda türetiliyor). */
const L_CODES = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
] as const;

/** İlk hane, sol altı hanenin L/G desenini seçer — 13. hane çizilmez, PARİTEDE saklanır. */
const PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
] as const;

const ters = (bits: string): string => [...bits].reverse().join('');
const tumleyen = (bits: string): string => [...bits].map((b) => (b === '0' ? '1' : '0')).join('');

/** ITF: her hane beş çubuk/boşluk, ikisi GENİŞ (wide) — `1` geniş demek. */
const ITF_CODES = [
  '00110', '10001', '01001', '11000', '00101',
  '10100', '01100', '00011', '10010', '01010',
] as const;

/** EAN-13 sağlama basamağı — ağırlıklar soldan 1,3,1,3… */
export function ean13CheckDigit(body12: string): number {
  const sum = [...body12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

/** GTIN-14 (ITF-14) sağlama basamağı — ağırlıklar soldan 3,1,3,1… */
export function gtin14CheckDigit(body13: string): number {
  const sum = [...body13].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Kodun basılabilir olduğunu doğrular. Fırlatır — çünkü alternatifi, okuyucunun sessizce yok
 * saydığı bir kâğıdı basmak ve sebebini cihazda aramaktır.
 */
export function assertCheckDigit(code: string, kind: 'ean13' | 'itf14'): void {
  const uzunluk = kind === 'ean13' ? 13 : 14;
  if (!new RegExp(`^\\d{${uzunluk}}$`).test(code)) {
    throw new Error(`${kind}: kod ${uzunluk} haneli rakam olmalı — "${code}"`);
  }
  const govde = code.slice(0, -1);
  const beklenen = kind === 'ean13' ? ean13CheckDigit(govde) : gtin14CheckDigit(govde);
  if (Number(code.at(-1)) !== beklenen) {
    throw new Error(`${kind}: "${code}" sağlama basamağı tutmuyor — doğrusu ${govde}${beklenen}`);
  }
}

/** Çizimin ham hâli: soldan sağa modül dizisi (`1` = mürekkep) + kaç modül geniş olduğu. */
interface Moduller {
  bits: string;
  /** Rakamların çizilmeyen bölgeleri — guard çubukları metnin altına inmez. */
  guardIndexes: readonly number[];
}

export function ean13Modules(code: string): Moduller {
  assertCheckDigit(code, 'ean13');
  const ilk = Number(code[0]);
  const sol = code.slice(1, 7);
  const sag = code.slice(7);

  let bits = '101'; // başlangıç guard'ı
  [...sol].forEach((d, i) => {
    const l = L_CODES[Number(d)]!;
    // G kodlaması L'nin TERS okunuşudur; ayrı tablo yazmak aynı bilgiyi ikinci kez saklamak olurdu.
    bits += PARITY[ilk]![i] === 'L' ? l : ters(tumleyen(l));
  });
  bits += '01010'; // orta guard
  for (const d of sag) bits += tumleyen(L_CODES[Number(d)]!);
  bits += '101'; // bitiş guard'ı

  // Guard çubukları uzundur (95 modüllük dizide 0-2, 45-49, 92-94).
  return { bits, guardIndexes: [0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94] };
}

/**
 * ITF-14: haneler ÇİFTLER hâlinde geçmeli kodlanır — ilk hane çubukları, ikinci hane boşlukları
 * belirler. Bu yüzden hane sayısı çift olmak zorunda (14 ✓).
 */
export function itf14Modules(code: string): Moduller {
  assertCheckDigit(code, 'itf14');
  const dar = 1;
  const genis = 3; // ITF'in standart oranı 1:2,5–1:3; 3 seçildi — düşük çözünürlükte daha ayrık.

  let bits = '1010'; // start: dar çubuk, dar boşluk, dar çubuk, dar boşluk
  for (let i = 0; i < code.length; i += 2) {
    const cubuk = ITF_CODES[Number(code[i])]!;
    const bosluk = ITF_CODES[Number(code[i + 1])]!;
    for (let k = 0; k < 5; k += 1) {
      bits += '1'.repeat(cubuk[k] === '1' ? genis : dar);
      bits += '0'.repeat(bosluk[k] === '1' ? genis : dar);
    }
  }
  bits += `${'1'.repeat(genis)}0${'1'.repeat(dar)}`; // stop: geniş çubuk, dar boşluk, dar çubuk
  return { bits, guardIndexes: [] };
}

interface CizimOpts {
  /** Barkodun toplam genişliği (mm) — modül genişliği buradan türer. */
  widthMm: number;
  /** Çubukların yüksekliği (mm). */
  heightMm: number;
  x: number;
  y: number;
}

/**
 * Modül dizisini SVG'ye çevirir. Bitişik modüller TEK dikdörtgende birleşir: komşu çubukları ayrı
 * çizmek hem düğüm sayısını şişirir hem de rasterde aralarında saç teli kadar boşluk bırakabilir —
 * o boşluk okuyucuda "ince çubuk" olarak görünür ve kod bozulur.
 */
export function modulesToSvg(moduller: Moduller, opts: CizimOpts): string {
  const { bits, guardIndexes } = moduller;
  const modulGenislik = opts.widthMm / bits.length;
  const guard = new Set(guardIndexes);
  // Guard çubukları rakam satırına kadar iner (EAN geleneği); ITF'te guard yok, hepsi aynı boyda.
  const guardEk = guard.size > 0 ? opts.heightMm * 0.08 : 0;

  let svg = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== '1') {
      i += 1;
      continue;
    }
    const bas = i;
    const uzunMu = guard.has(i);
    while (i < bits.length && bits[i] === '1' && guard.has(i) === uzunMu) i += 1;
    const x = opts.x + bas * modulGenislik;
    const w = (i - bas) * modulGenislik;
    const h = opts.heightMm + (uzunMu ? guardEk : 0);
    svg += `<rect x="${x.toFixed(4)}" y="${opts.y.toFixed(3)}" width="${w.toFixed(4)}" height="${h.toFixed(3)}" fill="#000"/>`;
  }
  return svg;
}
