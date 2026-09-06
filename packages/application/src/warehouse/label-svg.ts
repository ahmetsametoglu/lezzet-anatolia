import { create as createQr } from 'qrcode';
import { PAYMENT_METHOD_LABELS } from '@lezzet/types';
import { type LabelSizeMm } from '@lezzet/domain-core';
import type { BoxLabel } from './boxes';
import { fitMm, textWidthMm, wrapMm } from './karla-metrics';

/*
  4×6 KUTU ETİKETİNİN GÖRSELİ (23.7) — karar §1.9'un ikinci yarısı: içerik gibi GÖRSEL de tek
  yerde kurulur ve tek yerde test edilir. Bu dosya SAF metin üretir (SVG string); rasterize
  (SVG → PNG) uç katmanın işidir (`apps/mobile-api` — font dosyası ve native binding orada).

  ── NEDEN SVG + SUNUCUDA RASTER ─────────────────────────────────────────────
  Brother SDK yalnız görüntü basıyor (23.5 ölçümü); telefonda görsel üretmek ise şablonu cihaz
  temasına bağlar ve test edilemez kılardı. Petit'in raster deseni headless Chromium'dur
  (backend/mcp/preview.ts) — orada web canvas'ı çizilir, makine haklı; bizim etiket düz metin +
  QR olduğundan o makine fazla: SVG şablonu + `@resvg/resvg-js` yeter. **Bilinçli sapma, bu
  künye kaydıdır.**

  ── ŞABLON ARTIK KÂĞIDIN BOYUNDA ÇİZİLİYOR (kullanıcı bulgusu 06.09) ───────
  Bu bölüm önce *"BOY TEK: 4×6 (103×164 mm)… 62 mm ruloya basım SDK'nın ölçeklemesiyle olur (~%60
  — okunur)"* diyordu. **Okunur değildi ve kullanıcı kâğıtta gördü:** *"ürünler okunmayacak kadar
  küçük çıktı… tahminim 4×6 ölçülerinde bir data gönderiyoruz, o da bunu ölçekleyip çıkartıyor."*
  Hesap doğrulandı: 103 mm'lik şablon 62 mm'ye inerken ölçek 0,60 ve ürün satırı 4,7 mm → **2,9 mm**
  (≈8 punto). Depo ışığında okunmaz.

  İki şey birden değişti:

  1. **GENİŞLİK HEDEFTEN GELİYOR.** Şablon artık milimetre tabanında ve verilen rulo genişliğinde
     çiziliyor; ölçekleme yok, punto tasarlandığı boyda çıkıyor. Tipografi RULOYA GÖRE BÜYÜYÜP
     KÜÇÜLMÜYOR — 3,8 mm'lik bir ürün satırı 62 mm'de de 103 mm'de de 3,8 mm; değişen tek şey
     satıra sığan karakter sayısı. Fiziksel okunurluk kâğıdın genişliğinin değil, gözün sorusudur.

  2. **YÜKSEKLİK İÇERİKTEN GELİYOR.** Sürekli ruloda kâğıt istenen yerde kesiliyor; sabit 164 mm
     iki kalemlik bir kutu için de o kadar kâğıt harcıyor, yedi kalemden fazlasını da kırpıyordu.
     Boy artık dökümle uzuyor (`labelSizeMm(...).heightMm === null`). Kalıp kesimde boy kâğıdın
     kendisinde sabit — orada içerik ona SIĞMAK zorunda ve fazlası yine "+K kalem daha"ya iner.

  ── PARA YOK ────────────────────────────────────────────────────────────────
  `BoxLabel` tutar taşımaz (karar §1.5) ve bu dosya kendi metnini uyduramaz — test yine de
  '€' aramaz olmaz diye ölçüyor (alan-adı sızıntısı emsali `boxes.test.ts`).
*/

/** Şablonun çözünürlüğü — Brother QL serisi 300 dpi basar. */
const DPI = 300;
/** Milimetre → şablon pikseli. Tek dönüşüm noktası: ölçüler mm yazılır, çizim px ister. */
const px = (mm: number): number => Math.round((mm * DPI) / 25.4);

/**
 * **FİZİKSEL TİPOGRAFİ** — milimetre cinsinden, ruloya göre DEĞİŞMEZ.
 *
 * Değerler depoda okunacak mesafeye göre seçildi, kâğıdın genişliğine oranla değil: 62 mm'lik
 * ruloda 3,8 mm'lik bir ürün satırı ile 103 mm'likteki 3,8 mm aynı gözle okunur. Oranlasaydık dar
 * ruloda yine küçülürdü — düzeltmeye çalıştığımız arızanın kendisi.
 */
const TYPE_MM = {
  /** Sipariş referansı — sol üst. */
  reference: 4.2,
  /** Kutu sayacı (N/M) — etiketin en büyük rakamı; depoda uzaktan okunan şey bu. */
  counter: 7,
  /** Koliye yazılacak ad (10.9: alıcı ≠ hesap sahibi olabilir). */
  parcel: 5.2,
  /** Rota/kulvar · gün. */
  lane: 3.8,
  /** Tahsilat YÖNTEMİ — tutar asla (karar §1.5). */
  payment: 3.8,
  /** Döküm satırı — kullanıcının "okunmuyor" dediği satır; 2,9 mm'den buraya çıktı. */
  item: 3.8,
  /** QR'ın altındaki insan-okunur kod. */
  code: 3.4,
} as const;

/** Dikey ritim (mm) — her satırın kendinden ÖNCEKİ boşluğu. */
const GAP_MM = {
  margin: 4,
  afterHeader: 7,
  afterParcel: 5.6,
  afterLane: 5,
  beforeRule: 3.4,
  item: 5.2,
  beforeQr: 4.5,
  afterQr: 4.6,
} as const;

/** QR'ın kenarı (mm) — kareyi dar ruloda da okunur tutan alt sınır ile kâğıdın izin verdiği üst sınır. */
const QR_MM = { min: 22, max: 34 } as const;

/**
 * Döküm için ÜST SINIR — sürekli ruloda bile.
 *
 * Boy serbest ama sonsuz değil: kırk kalemlik bir kutu yarım metre etiket üretirdi ve o kâğıt
 * kutuya sığmaz. Sınır aşılınca kalan "+K kalem daha"ya iniyor — bilgi kaybolmuyor, sayıya
 * dönüşüyor. Kalıp kesimde sınır ayrıca KÂĞIDIN kendisidir (aşağıda hesaplanıyor).
 */
const MAX_ITEM_LINES = 24;

/**
 * Uzun adların kaç satıra inebileceği.
 *
 * ~~Tek satır + ortalama karakter genişliğiyle kesme~~ 06.09'da bıraktı: ortalama bir SINIR
 * koyamaz ve "Güney Hattı — Mulhouse" gibi baştan sona geniş harften oluşan bir ad kâğıdın
 * dışına taştı (kullanıcı kâğıtta gördü). Genişlik artık fontun kendi tablosundan ölçülüyor
 * (`karla-metrics`) ve taşan ad KESİLMİYOR, alt satıra iniyor: sürekli ruloda yükseklik bedava,
 * küçültmek ise kullanıcının ilk şikâyetiydi ("okunmayacak kadar küçük").
 *
 * İki satır, üç değil: üçüncü satıra taşan bir ad etiketin ritmini bozuyor ve o boy artık ürün
 * adı değil paragraf oluyor. Üçüncüye kalan yine "…" ile kesiliyor.
 */
const MAX_WRAP_LINES = 2;


/** XML metin kaçışı — ürün/müşteri adı serbest metindir, SVG'yi kıramaz. */
function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * QR'ın kara modülleri tek SVG path'i olarak — modül başına `<rect>` yüzlerce düğüm üretirdi.
 * `qrcode.create` senkron ve deterministiktir (aynı kod → aynı matris), test buna yaslanır.
 *
 * DIŞA VERİLİR (24.08): fiziksel test etiketi seti (`scripts/labels-test.ts`) aynı QR'a ihtiyaç
 * duyuyor. İkinci bir üretici yazmak, iki ayrı "QR nasıl çizilir" kararı demekti (CLAUDE §1) —
 * path'in birim kareye oturması (`moduleCount`) o kararın parçası ve tek yerde durmalı.
 */
export function qrPath(text: string): { path: string; moduleCount: number } {
  const qr = createQr(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { path, moduleCount: size };
}

/** `2026-08-24` → `24.08.2026` — operasyon yüzeyinin tarih dili; bozuk/boş değer olduğu gibi döner. */
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

/**
 * Etiketin SVG'si — **verilen kâğıdın boyunda**. Düzen yukarıdan aşağı: referans + N/M → koliye
 * yazılacak ad → rota/gün → tahsilat yöntemi → döküm → QR (alt merkez, kodun metni altında).
 *
 * `size` verilmezse kutu yazıcısının kâğıdı varsayılıyor (62 mm sürekli rulo — kullanıcı kararı
 * 06.09): bizim kutu etiketimizin evi orası. Kargo etiketi bu şablondan ÇIKMAZ, o taşıyıcının
 * kendi PDF'idir.
 */
export function boxLabelSvg(label: BoxLabel, size: LabelSizeMm = { widthMm: 62, heightMm: null }): string {
  const W = px(size.widthMm);
  const M = px(GAP_MM.margin);
  const contentMm = size.widthMm - GAP_MM.margin * 2;
  const parts: string[] = [];
  let y = M;

  /* Üst satır: referans (sol) + kutu sayacı (sağ, en büyük — depoda uzaktan okunan şey bu).
     Referansın payı sayacın GERÇEK genişliğinden artan yer; eskiden `contentMm * 0.6` diye
     kestiriliyordu ve "1/1" ile "12/15" aynı yeri tutuyordu sanılıyordu. */
  y += px(GAP_MM.afterHeader);
  const sayac = `${label.boxNo}/${label.boxCount}`;
  const sayacMm = textWidthMm(sayac, TYPE_MM.counter, 600);
  parts.push(
    `<text x="${M}" y="${y}" font-size="${px(TYPE_MM.reference)}" font-weight="600">${esc(fitMm(label.referenceNo ?? '—', contentMm - sayacMm - GAP_MM.margin, TYPE_MM.reference, 600))}</text>`,
  );
  parts.push(
    `<text x="${W - M}" y="${y}" font-size="${px(TYPE_MM.counter)}" font-weight="600" text-anchor="end">${sayac}</text>`,
  );

  // Koliye yazılacak ad (10.9 kuralı: alıcı ≠ hesap sahibi olabilir) — uzun ad alt satıra iner.
  for (const satir of wrapMm(label.parcelName, contentMm, TYPE_MM.parcel, MAX_WRAP_LINES, 600)) {
    y += px(GAP_MM.afterParcel);
    parts.push(
      `<text x="${M}" y="${y}" font-size="${px(TYPE_MM.parcel)}" font-weight="600">${esc(satir)}</text>`,
    );
  }

  // Rota/kulvar + gün. Kargoda rota yok — kulvarın adı yazılır.
  const lane = label.deliveryType === 'shipping' ? 'Kargo' : (label.routeName ?? '—');
  const date = formatDate(label.deliveryDate);
  for (const satir of wrapMm(date ? `${lane} · ${date}` : lane, contentMm, TYPE_MM.lane, MAX_WRAP_LINES)) {
    y += px(GAP_MM.afterLane);
    parts.push(`<text x="${M}" y="${y}" font-size="${px(TYPE_MM.lane)}">${esc(satir)}</text>`);
  }

  // Tahsilatın YÖNTEMİ — tutar asla (karar §1.5). Online'da satır hiç çizilmez: kapıda iş yok.
  if (label.paymentMethod && label.paymentMethod !== 'online') {
    y += px(GAP_MM.afterLane);
    parts.push(
      `<text x="${M}" y="${y}" font-size="${px(TYPE_MM.payment)}" font-weight="600">Tahsilat: ${esc(PAYMENT_METHOD_LABELS[label.paymentMethod])}</text>`,
    );
  }

  /*
    QR'IN KENARI KÂĞIDA GÖRE, DÖKÜMÜN SINIRI DA ÖYLE.

    Kare kâğıdın izin verdiği kadar büyük ama iki ucu var: 22 mm'nin altına inince telefon
    kamerası uzaktan yakalayamıyor, 34 mm'nin üstü de dar ruloda dökümün yerini yiyor.
  */
  const qrMm = Math.min(QR_MM.max, Math.max(QR_MM.min, contentMm));
  const qrBlockMm = GAP_MM.beforeQr + qrMm + GAP_MM.afterQr + GAP_MM.margin;

  /*
    KAÇ KALEM SIĞAR — KÂĞIT SORUYORSA KÂĞIT CEVAPLAR.

    Sürekli ruloda tavan yalnız `MAX_ITEM_LINES` (etiket kutuya sığmalı). Kalıp kesimde ikinci bir
    tavan var ve o KÂĞIDIN kendisi: kalan yüksekliği satır boyuna bölüyoruz. İkisinin küçüğü
    kazanıyor — sığmayan satırı çizmek, onu kâğıdın dışına yazmaktır.
  */
  const dokumBasiMm = (y + px(GAP_MM.beforeRule)) / DPI * 25.4;
  const kagittaKalanMm = size.heightMm === null ? Infinity : size.heightMm - dokumBasiMm - qrBlockMm;
  const tavan = Math.max(0, Math.min(MAX_ITEM_LINES, Math.floor(kagittaKalanMm / GAP_MM.item)));

  // Ayraç + döküm.
  y += px(GAP_MM.beforeRule);
  parts.push(`<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}" stroke="black" stroke-width="${px(0.25)}"/>`);

  /*
    BÜTÇE KALEMDE DEĞİL SATIRDA (06.09).

    Uzun ad artık iki satıra inebiliyor, yani bir kalem bir satır etmiyor. Tavanı kalemle saymak
    kalıp kesim kâğıtta dökümü QR'ın üstüne taşırırdı — sığmayan satırı çizmek onu kâğıdın dışına
    yazmaktır. Bütçe satır sayar; iki satırlık bir ad iki satır harcar.

    Önek ("12 × ") ASILI GİRİNTİ kuruyor: rakam solda kalıyor, adın devamı adın altından
    başlıyor. Genişliği önekin KENDİ ölçüsünden geliyor (`textWidthMm`) — "1 × " ile "12 × "
    aynı yeri tutmuyor ve tek bir tahminle ikisi de yanlış olurdu.
  */
  const bloklar = label.items.map((item) => {
    const onek = `${item.qty} × `;
    const onekMm = textWidthMm(onek, TYPE_MM.item);
    return { onek, onekMm, satirlar: wrapMm(item.name, contentMm - onekMm, TYPE_MM.item, MAX_WRAP_LINES) };
  });

  /* Kırpma varsa SON satır "+K kalem daha"ya ayrılıyor: yoksa sığan son kalem yazılır ve gizlenen
     hiç söylenmezdi — sessiz bir eksiklik, kutunun içeriği hakkında. */
  const hepsiSatir = bloklar.reduce((toplam, blok) => toplam + blok.satirlar.length, 0);
  const butce = hepsiSatir > tavan ? Math.max(0, tavan - 1) : tavan;
  const shown: typeof bloklar = [];
  let harcanan = 0;
  for (const blok of bloklar) {
    if (harcanan + blok.satirlar.length > butce) break;
    shown.push(blok);
    harcanan += blok.satirlar.length;
  }
  const hidden = label.items.length - shown.length;

  for (const blok of shown) {
    blok.satirlar.forEach((satir, i) => {
      y += px(GAP_MM.item);
      const x = i === 0 ? M : M + px(blok.onekMm);
      const metin = i === 0 ? `${blok.onek}${satir}` : satir;
      parts.push(`<text x="${x}" y="${y}" font-size="${px(TYPE_MM.item)}">${esc(metin)}</text>`);
    });
  }
  if (hidden > 0) {
    y += px(GAP_MM.item);
    parts.push(`<text x="${M}" y="${y}" font-size="${px(TYPE_MM.item)}">+${hidden} kalem daha</text>`);
  }

  /*
    ETİKETİN BOYU — sürekli ruloda İÇERİK, kalıp kesimde KÂĞIT.

    Sürekli ruloda QR dökümün hemen altına oturuyor ve etiket orada bitiyor: iki kalemlik kutu iki
    kalemlik kâğıt harcıyor. Kalıp kesimde QR yine ALTA sabitleniyor (kurye elini nereye tutacağını
    bilir) ve aradaki boşluk boş kalıyor — kâğıdın boyu zaten kesilmiş.
  */
  const qrY = size.heightMm === null ? y + px(GAP_MM.beforeQr) : px(size.heightMm) - px(qrBlockMm - GAP_MM.margin);
  const H = size.heightMm === null ? qrY + px(qrMm + GAP_MM.afterQr + GAP_MM.margin) : px(size.heightMm);

  const qr = qrPath(label.code);
  const qrSize = px(qrMm);
  const scale = qrSize / qr.moduleCount;
  parts.push(
    `<g transform="translate(${(W - qrSize) / 2} ${qrY}) scale(${scale})"><path d="${qr.path}" fill="black"/></g>`,
  );
  parts.push(
    `<text x="${W / 2}" y="${qrY + qrSize + px(GAP_MM.afterQr)}" font-size="${px(TYPE_MM.code)}" text-anchor="middle">${esc(label.code)}</text>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="white"/>` +
    `<g fill="black" font-family="Karla">${parts.join('')}</g>` +
    `</svg>`
  );
}

/**
 * **ÖRNEK ETİKET** — "test bas" düğmesinin bastığı şey (v3:09 · 30.08).
 *
 * ── NEDEN GERÇEK ŞABLON, NEDEN AYRI BİR TEST DESENİ DEĞİL ───────────────────
 * Basım hattında paketlenmiş bir test deseni zaten var (`printNeedleTest`) ama o başka bir soruyu
 * cevaplıyor: "SDK bu yazıcıya bir görüntü basabiliyor mu" (23.5 iğne deneyi). Ayarlar ekranının
 * sorusu daha dar ve daha günlük: *"seçtiğim yazıcıdan BİZİM etiketimiz doğru çıkıyor mu"* — kâğıt
 * boyu tutuyor mu, QR okunuyor mu, yazı kesiliyor mu. Bunu ancak gerçek şablon gösterir; ayrı bir
 * desen basmak, sınanmayan bir düzeni sınanmış sanmaktır.
 *
 * ── İÇERİK GÖRÜNÜR BİÇİMDE SAHTE ────────────────────────────────────────────
 * Kod `KT-ORNEK`, ad "ÖRNEK ETİKET": rampada yere düşen bir kâğıdın gerçek bir koliye ait
 * sanılmaması gerekir. Gerçek bir kutunun etiketini "test" diye bastırmak da seçenek değildi —
 * o etiketin basımı bir OLAYDIR (`markBoxPrinted` damgası) ve test yüzünden damga düşerdi.
 *
 * Saf fonksiyon: veritabanına dokunmaz, tarih/rastgelelik taşımaz — aynı çıktı her seferinde.
 */
export function sampleBoxLabel(): BoxLabel {
  return {
    code: 'KT-ORNEK',
    boxNo: 1,
    boxCount: 1,
    referenceNo: 'ÖRNEK ETİKET',
    parcelName: 'Örnek Alıcı',
    routeName: 'Örnek rota',
    // `route` seçildi çünkü şablonun EN DOLU dalı bu: rota adı ve teslim günü yalnız burada
    // çiziliyor. Test etiketi en çok satırı gösteren hâli basmalı — kesilen bir yazı, ancak
    // yazının bulunduğu dalda görülür.
    deliveryType: 'route',
    deliveryDate: null,
    paymentMethod: null,
    items: [
      { name: 'Örnek ürün · 500 g', qty: 2 },
      { name: 'Örnek ürün · 1 kg', qty: 1 },
    ],
  };
}
