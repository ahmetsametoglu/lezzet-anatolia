/*
  TTF İLERLEME GENİŞLİKLERİ — yazı tipinin kendi tablosundan (06.09).

  ── NİÇİN VAR ───────────────────────────────────────────────────────────────
  Etiket şablonu SVG kuruyor ve SVG'nin `<text>` öğesinin satır kırması YOKTUR: verilen noktaya
  yazar, kâğıttan taşan kısım taşar. Kırma kararını şablon vermek zorunda ve bunun için harflerin
  genişliğini bilmesi gerekiyor.

  İlk tur bunu TEK BİR ORTALAMAYLA yaptı (`CHAR_W = 0.47`) ve kâğıtta taştı (kullanıcı bulgusu
  06.09: *"özellikle rotanın adı sığmamış, ve de ürünlerin adı"*). Ortalama bir SINIR koyamaz:
  "Güney Hattı — Mulhouse" baştan sona geniş harf (M=0,847 · —=0,725 em) ve ortalamayı %30 aşıyor.
  İkinci tur ölçülmüş bir TABLO koydu; o da doğruydu ama fontun bir KOPYASIYDI — yazı tipi
  değişince sessizce bayatlardı. Bu tur kaynağın kendisini okuyor: kopya yok, bayatlama yok.

  ── NEDEN AYRI KÜTÜPHANE DEĞİL ──────────────────────────────────────────────
  Bize gereken tek şey ilerleme genişliği: `cmap` (harf → glif) + `hmtx` (glif → genişlik). Font
  kütüphaneleri bunun yanında şekillendirme, ligatür, renkli glif ve alt kümeleme taşır — hiçbiri
  bu iş için gerekmiyor. Okuyucu SAF: girdisi bir bayt dizisi, çıktısı bir sayı; testi de öyle.

  ── KERNING SAYILMIYOR, BİLEREK ─────────────────────────────────────────────
  Satır genişliğini ilerlemelerin TOPLAMI sayıyoruz. Gerçek renderer (resvg) kerning uygular ve
  kerning genişliği yalnız DARALTIR — yani hesabımız gerçek satırdan bir tık geniş çıkar. Yanılma
  yönü kâğıdın İÇİNE doğrudur; ters yönde yanılan bir hesap, bugün düzelttiğimiz arızanın kendisi.
*/

/** Bir yazı tipinin ilerleme tablosu — `em` biriminde okunur (punto ile çarpılır). */
export interface FontAdvances {
  /** Kod noktasının ilerlemesi, `em` cinsinden. Harf fontta yoksa `null`. */
  advanceEm: (codePoint: number) => number | null;
}

/** sfnt tablo etiketini 32-bit sayıya çevirir ('head' → 0x68656164). */
function tag(name: string): number {
  return (name.charCodeAt(0) << 24) | (name.charCodeAt(1) << 16) | (name.charCodeAt(2) << 8) | name.charCodeAt(3);
}

interface Tables {
  readonly [tagName: string]: number;
}

function tableOffsets(view: DataView): Tables {
  const numTables = view.getUint16(4);
  const offsets: Record<string, number> = {};
  for (let i = 0; i < numTables; i += 1) {
    const kayit = 12 + i * 16;
    const etiket = view.getUint32(kayit);
    for (const ad of ['head', 'hhea', 'hmtx', 'cmap']) {
      if (etiket === tag(ad)) offsets[ad] = view.getUint32(kayit + 8);
    }
  }
  return offsets;
}

/**
 * Unicode `cmap` alt tablosunun yeri. Tercih sırası (3,10) → (3,1) → (0,*): birincisi temel çok
 * dilli düzlemin ötesini de taşır, ikincisi klasik Windows Unicode'u, üçüncüsü platformsuz.
 * Hiçbiri yoksa `null` — o fontla metin ölçmeyi denemek yanlış sayı üretmekten iyidir.
 */
function unicodeCmap(view: DataView, cmapOffset: number): number | null {
  const numTables = view.getUint16(cmapOffset + 2);
  let en_iyi: number | null = null;
  let en_iyi_puan = -1;
  for (let i = 0; i < numTables; i += 1) {
    const kayit = cmapOffset + 4 + i * 8;
    const platform = view.getUint16(kayit);
    const kodlama = view.getUint16(kayit + 2);
    const puan = platform === 3 && kodlama === 10 ? 3 : platform === 3 && kodlama === 1 ? 2 : platform === 0 ? 1 : -1;
    if (puan > en_iyi_puan) {
      en_iyi_puan = puan;
      en_iyi = cmapOffset + view.getUint32(kayit + 4);
    }
  }
  return en_iyi_puan < 0 ? null : en_iyi;
}

/** `cmap` biçim 4 — segmentli eşleme (temel çok dilli düzlem). */
function glyphFromFormat4(view: DataView, sub: number, code: number): number {
  if (code > 0xffff) return 0;
  const segCount = view.getUint16(sub + 6) / 2;
  const endBasi = sub + 14;
  const startBasi = endBasi + segCount * 2 + 2;
  const deltaBasi = startBasi + segCount * 2;
  const rangeBasi = deltaBasi + segCount * 2;

  for (let i = 0; i < segCount; i += 1) {
    if (code > view.getUint16(endBasi + i * 2)) continue;
    const start = view.getUint16(startBasi + i * 2);
    if (code < start) return 0;
    const delta = view.getInt16(deltaBasi + i * 2);
    const rangeOffset = view.getUint16(rangeBasi + i * 2);
    if (rangeOffset === 0) return (code + delta) & 0xffff;
    // Spec'in kendi dolaylı adresi: konum, `idRangeOffset` alanının KENDİ adresinden sayılır.
    const yer = rangeBasi + i * 2 + rangeOffset + (code - start) * 2;
    const glif = view.getUint16(yer);
    return glif === 0 ? 0 : (glif + delta) & 0xffff;
  }
  return 0;
}

/** `cmap` biçim 12 — düz aralıklar (düzlem ötesi harfler dahil). */
function glyphFromFormat12(view: DataView, sub: number, code: number): number {
  const nGroups = view.getUint32(sub + 12);
  for (let i = 0; i < nGroups; i += 1) {
    const grup = sub + 16 + i * 12;
    const start = view.getUint32(grup);
    if (code < start) return 0;
    if (code > view.getUint32(grup + 4)) continue;
    return view.getUint32(grup + 8) + (code - start);
  }
  return 0;
}

/**
 * Bayt dizisinden ilerleme okuyucusu kurar. Sonuçlar kod noktası başına önbelleklenir: aynı harf
 * bir etikette onlarca kez ölçülüyor ve `cmap` taraması her seferinde segmentleri geziyor.
 *
 * Font okunamazsa (beklenen tablolar yok) FIRLATIR — sessizce sıfır dönmek, bütün metinleri
 * "sıfır genişlikte" sayıp her satırı kâğıda sığar gibi gösterirdi.
 */
export function readTtfAdvances(data: Uint8Array): FontAdvances {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const t = tableOffsets(view);
  if (t.head === undefined || t.hhea === undefined || t.hmtx === undefined || t.cmap === undefined) {
    throw new Error('yazı tipi okunamadı: head/hhea/hmtx/cmap tablolarından biri yok');
  }

  const unitsPerEm = view.getUint16(t.head + 18);
  const numHMetrics = view.getUint16(t.hhea + 34);
  const sub = unicodeCmap(view, t.cmap);
  if (sub === null) throw new Error('yazı tipinde Unicode cmap yok');
  const format = view.getUint16(sub);

  const onbellek = new Map<number, number | null>();
  return {
    advanceEm(codePoint: number): number | null {
      const hazir = onbellek.get(codePoint);
      if (hazir !== undefined) return hazir;

      const glif =
        format === 12 ? glyphFromFormat12(view, sub, codePoint)
        : format === 4 ? glyphFromFormat4(view, sub, codePoint)
        : 0;
      /* `hmtx` son METRİKTEN sonrasını tekrar etmez: `numHMetrics`ten büyük glifler sonuncunun
         genişliğini paylaşır (tek genişlikli kuyruk — spec'in kendi sıkıştırması). */
      const sonuc =
        glif === 0 ? null : view.getUint16(t.hmtx! + Math.min(glif, numHMetrics - 1) * 4) / unitsPerEm;
      onbellek.set(codePoint, sonuc);
      return sonuc;
    },
  };
}
