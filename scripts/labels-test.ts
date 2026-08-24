import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
// Barrel yerine ALT YOL (paketin `./*` ihracı): bu script paketin kamu yüzeyine yeni bir ad
// eklemeyi hak etmiyor — `qrPath` bir çizim ayrıntısı, uygulama katmanının sözleşmesi değil.
import { qrPath } from '@lezzet/application/warehouse/label-svg';
import { ean13Modules, itf14Modules, modulesToSvg } from './barcode-svg';
import { TEST_LABELS, type TestLabel } from './seed/test-labels';

/*
  FİZİKSEL TEST ETİKETİ SETİ — bir kez basılır, hep kullanılır (kullanıcı kararı 24.08).

  Kâğıt israfını bitiren karar: kodlar seed'de SABİT (`seed/test-labels.ts`), yani basılmış set her
  `db:refresh` sonrasında yine çalışır. Bu script o setin BASILABİLİR hâlini üretir.

  ── SİMGE, GERÇEK DEPODAKİ SİMGEDİR (kullanıcı bulgusu 24.08) ───────────────
  Vizör yedi biçimi birden tanıyor (`scan-sheet.tsx`) ve okutulan şey ham METİNDİR — kapı kodun
  hangi simgeyle çizildiğini bilmez. Ama DECODE katmanı bilir: QR en kolay okunan simgedir, gerçek
  depoda okutulacak şeyse paket için EAN-13, koli için ITF-14 — ince çizgili, açıya ve mesafeye çok
  daha duyarlı. İlk set tamamen QR basıldı ve kullanıcı yakaladı: o hâlde sınamak istediğimiz ZOR
  yol hiç sınanmıyordu. Simge artık setin kendi kararı (`TestLabel.symbology`); QR yalnız BİZİM
  kodumuzda (kutu QR'ı harf taşır, EAN'a sığmaz).

  QR üreticisi kutu etiketiyle ORTAK (`application/warehouse/label-svg.ts` → `qrPath`): ikinci bir
  "QR nasıl çizilir" kararı açılmadı (CLAUDE §1). Çizgili simgeler `barcode-svg.ts`te — sağlama
  basamağı orada zorlanıyor, çünkü tutmayan bir kodu okuyucu SESSİZCE yutar (elde basılı koli kodu
  tam da böyleydi). Rasterizasyon (SVG→PNG) burada kendi kurulumunu
  yapıyor ve bu bir kopya DEĞİL, sınır: üretimin hattı `apps/mobile-api/src/lib/label-png.ts`te ve
  `scripts` bir uygulamaya bağımlı olamaz. Fark da bilinçli — orada fontlar dosyadan yükleniyor
  (dağıtımda sistem fontuna sessiz düşüş olmasın diye), burada sistem fontu yeterli: bu kâğıt
  müşteriye gitmiyor, bir test aracının çıktısı.

  ── ETİKETTE ÜRÜN ADI YOK ───────────────────────────────────────────────────
  Yalnız kod ve SINADIĞI YOL yazar; hangi ürüne bağlandığı seed'in kararı ve katalogla değişebilir
  (künye `seed/test-labels.ts`). Ad yazsaydık ilk katalog değişiminde kâğıt yalan söylerdi.

  Kullanım:
    pnpm labels:test           → PNG'leri `.test-results/labels/` altına yazar
    pnpm labels:test --print   → yazdıktan sonra yazıcıya gönderir (62 mm rulo)
*/

/** Etiket ölçüsü — 62 mm rulonun basılabilir eni (yazıcı payı düşülmüş) ve rahat okunan yükseklik. */
const GENISLIK_MM = 56;
const YUKSEKLIK_MM = 26;
const DPI = 300;

/** Varsayılan yazıcı: 62 mm sürekli rulo (ölçüldü 23.5 — `RollW62`). */
const YAZICI = process.env.LABEL_PRINTER_CUPS ?? 'Brother_QL_820NWB';

/** Metin XML'e girmeden kaçırılır: künye satırları tırnak ve & taşıyabilir. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Künyeyi SÖZCÜK sınırında sarar. Sabit karakter sayısıyla kesmek denendi ve kâğıtta taştı
 * (ölçüldü 24.08): 2,5 mm puntoda 31 mm'lik kolona ~24 karakter giriyor, kelime ortasından kesilen
 * satır da okunmuyordu. Sığmayan kuyruk ATILIR — etiketin işi kodu taşımak, künye bir hatırlatma.
 */
function sar(metin: string, satirBasinaKarakter: number, satirSayisi: number): string[] {
  const satirlar: string[] = [];
  let mevcut = '';
  for (const kelime of metin.split(' ')) {
    const aday = mevcut === '' ? kelime : `${mevcut} ${kelime}`;
    if (aday.length <= satirBasinaKarakter) {
      mevcut = aday;
      continue;
    }
    satirlar.push(mevcut);
    mevcut = kelime;
    if (satirlar.length === satirSayisi) break;
  }
  if (satirlar.length < satirSayisi && mevcut !== '') satirlar.push(mevcut);
  return satirlar.slice(0, satirSayisi);
}

const sarmal = (govde: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${GENISLIK_MM}mm" height="${YUKSEKLIK_MM}mm" viewBox="0 0 ${GENISLIK_MM} ${YUKSEKLIK_MM}"><rect width="${GENISLIK_MM}" height="${YUKSEKLIK_MM}" fill="#fff"/>${govde}</svg>`;

/**
 * QR düzeni: kare simge SOLDA, künye sağda — kod kısa olduğu için yan yana sığar.
 * (Tek çağıranı kutu QR'ı; çizgili simgeler kendi düzenini kullanıyor.)
 */
function qrEtiket(label: TestLabel): string {
  const qrBoy = 20;
  // `qrPath` birim kareye (modül = 1) çizer; ölçek modül sayısından türer — kutu etiketinin
  // yaptığının aynısı, orada da QR bir `scale` ile yerleştiriliyor.
  const { path, moduleCount } = qrPath(label.code);
  const olcek = qrBoy / moduleCount;
  const solx = qrBoy + 5;
  const kunye = sar(label.hint, 24, 3)
    .map((satir, i) => `<text x="${solx}" y="${17 + i * 3.2}" font-family="Helvetica" font-size="2.4" fill="#000">${esc(satir)}</text>`)
    .join('\n');
  return sarmal(`<g transform="translate(2,3) scale(${olcek.toFixed(4)})"><path d="${path}" fill="#000"/></g>
<text x="${solx}" y="7.5" font-family="Helvetica" font-size="4.2" font-weight="bold" fill="#000">${esc(label.title)}</text>
<text x="${solx}" y="12.6" font-family="Helvetica" font-size="3.2" fill="#000">${esc(label.code)}</text>
${kunye}`);
}

/**
 * Çizgili simge düzeni: barkod ÜSTTE ve TAM GENİŞLİKTE, altında rakamlar + künye.
 *
 * Genişlik pazarlık konusu değil: EAN-13 95 modül, ITF-14 daha da fazla — dar basılan bir çizgili
 * kod ilk kırpılan şeydir. QR'ın yaptığı gibi yana sıkıştırsaydık modül genişliği yazıcının nokta
 * ölçüsünün altına inerdi (300 dpi'da bir nokta ≈ 0,085 mm) ve kâğıt okunmaz çıkardı.
 */
function cizgiliEtiket(label: TestLabel): string {
  const moduller = label.symbology === 'ean13' ? ean13Modules(label.code) : itf14Modules(label.code);
  // Çubukların altında SESSİZ BİR ŞERİT kalmalı: metin guard çubuklarına değerse okuyucu kodun
  // bittiği yeri bulamaz (ilk denemede bindi ve kâğıtta okunmaz görünüyordu — ölçüldü 24.08).
  const cubuklar = modulesToSvg(moduller, { widthMm: GENISLIK_MM - 6, heightMm: 12, x: 3, y: 2 });
  const kunye = sar(label.hint, 44, 2)
    .map((satir, i) => `<text x="3" y="${21.4 + i * 3}" font-family="Helvetica" font-size="2.4" fill="#000">${esc(satir)}</text>`)
    .join('\n');
  return sarmal(`${cubuklar}
<text x="3" y="18" font-family="Helvetica" font-size="3.4" font-weight="bold" fill="#000">${esc(label.title)}</text>
<text x="${GENISLIK_MM - 3}" y="18" text-anchor="end" font-family="Helvetica" font-size="3.4" fill="#000">${esc(label.code)}</text>
${kunye}`);
}

const etiketSvg = (label: TestLabel): string => (label.symbology === 'qr' ? qrEtiket(label) : cizgiliEtiket(label));

async function main(): Promise<void> {
  const bas = process.argv.includes('--print');
  const dizin = join(process.cwd(), '.test-results', 'labels');
  mkdirSync(dizin, { recursive: true });

  const yollar: string[] = [];
  for (const label of TEST_LABELS) {
    const svg = etiketSvg(label);
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: Math.round((GENISLIK_MM / 25.4) * DPI) },
      font: { loadSystemFonts: true },
    })
      .render()
      .asPng();
    const yol = join(dizin, `${label.role}.png`);
    writeFileSync(yol, png);
    yollar.push(yol);
    console.log(`  ✓ ${label.title.padEnd(14)} ${label.code.padEnd(20)} → ${yol}`);
  }

  console.log(`\n${TEST_LABELS.length} etiket yazıldı: ${dizin}`);
  console.log('Kodlar SABİT — bu set bir kez basılır, her db:refresh sonrası yine çalışır.');
  console.log('Not: "TANINMAYAN" etiketi öğretildikten sonra tanınır hâle gelir; yeniden');
  console.log('     tanınmaz yapmak için o barkod satırını silmek ya da db:refresh gerekir.');

  if (!bas) {
    console.log(`\nBasmak için: pnpm labels:test --print   (yazıcı: ${YAZICI}, 62 mm rulo)`);
    return;
  }

  console.log(`\n▸ basılıyor → ${YAZICI}`);
  for (const yol of yollar) {
    // Yazıcının kenar payı ~3 mm yiyor (ölçüldü 23.7): tasarım zaten o payı bırakıyor, `fit-to-page`
    // kalanı ortalar.
    execFileSync('lp', ['-d', YAZICI, '-o', `PageSize=Custom.62x${YUKSEKLIK_MM}mm`, '-o', 'fit-to-page', yol], {
      stdio: 'inherit',
    });
  }
  console.log('✓ set basıldı');
}

void main();
