#!/usr/bin/env node
/*
  TASARIM EKRANLARINI RESME ÇEVİRİR — `design/derived/<slug>/NN-*.html` → `.design-shots/<slug>/NN.png`

  ── NİÇİN VAR (kullanıcı bulgusu 30.08) ─────────────────────────────────────
  v3 geçişinde ekranları "tasarıma uyuyor" diye bildirmiştim ve birçoğu uymuyordu. Sebep yöntemdi:
  tasarımı HTML'den DÜZ METNE indirgeyip cümleleri eşleştiriyor, sonra cihaz görüntüsüne
  TASARIMI HATIRLAYARAK bakıyordum. Yani karşılaştırma hafızadaydı, yan yana değil — ve hafıza
  tam da etkileşimi (hangi alan neye dokunuyor) atlıyordu.

  Bu betik tasarımın kendi resmini üretir; cihaz görüntüsüyle YAN YANA konabilsin diye. Karşılaştırma
  artık iki resim arasındadır.

  ── ŞABLON DEĞİŞKENLERİ OLDUĞU GİBİ KALIR ───────────────────────────────────
  Türetilmiş dosyalar `{{ degisken }}` ve `<sc-if>`/`<sc-for>` taşıyor; tarayıcı bunları bilmez ve
  içeriği olduğu gibi çizer. **Bilerek dokunulmuyor:** yer tutucuyu uydurma veriyle doldurmak,
  karşılaştırmayı tasarımla değil BENİM tahminimle yapmak olurdu. Yapı, yerleşim, ton ve dokunulan
  öğeler zaten görünüyor; sayıların kendisi cihaz görüntüsünde okunur.

  Kullanım:
    node scripts/design-shot.mjs [slug]        # varsayılan: operasyon-mobil-v3
*/
import { chromium } from '@playwright/test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const slug = process.argv[2] ?? 'operasyon-mobil-v3';
const sourceDir = join('design', 'derived', slug);
const outDir = join('.design-shots', slug);

/* Cihazın kendi ölçüsü (OPPO CPH1907: 1080×2400 @3x = 360×800 dp). Tasarımı AYNI genişlikte
   çizmek şart: 390'da çizilen bir ızgara 360'ta satır atlayabilir ve fark tasarımın değil
   viewport'un olurdu. Yükseklik uzun tutulur, tam sayfa çekiliyor. */
const VIEWPORT = { width: 360, height: 800 };

async function main() {
  const files = (await readdir(sourceDir)).filter((f) => f.endsWith('.html')).sort();
  if (files.length === 0) {
    console.error(`× ${sourceDir} içinde .html yok`);
    process.exit(1);
  }
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 3 });

  for (const file of files) {
    const html = await readFile(join(sourceDir, file), 'utf8');
    /* `file://` yerine doğrudan içerik: türetilmiş dosyalar tek başına duruyor (stil satır içi),
       ve içerik olarak vermek göreli yol sorunlarını hiç doğurmuyor. */
    await page.setContent(wrap(html), { waitUntil: 'load' });
    const name = `${file.replace(/\.html$/, '')}.png`;
    await page.screenshot({ path: join(outDir, name), fullPage: true });
    console.log(`  ✓ ${name}`);
  }

  await browser.close();

  const index = files
    .map((f) => `<figure><img src="${f.replace(/\.html$/, '')}.png" alt="${f}"><figcaption>${f}</figcaption></figure>`)
    .join('\n');
  await writeFile(join(outDir, 'index.html'), GALLERY.replace('{{ figures }}', index), 'utf8');
  console.log(`\n${files.length} ekran çizildi → ${outDir}/index.html`);
}

/* Sayfa zemini ve yazı tipi kabuğu: türetilmiş parça gövdeyi kurmuyor, yalnız ekranın kendisini
   taşıyor. Zemin tasarımın kendi kremi (`#f2f0e8`) — beyaz bir zeminde kartların kenarı
   olduğundan koyu görünür ve karşılaştırma yanlış yerden başlar. */
function wrap(html) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=Karla:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}body{margin:0;background:#f2f0e8;font-family:Karla,system-ui,sans-serif}</style>
</head><body>${html}</body></html>`;
}

const GALLERY = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Tasarım ekranları</title>
<style>body{margin:0;padding:24px;background:#2f353a;color:#f5f1e6;font:400 14px system-ui}
h1{font-size:18px;margin:0 0 16px}
.grid{display:flex;flex-wrap:wrap;gap:20px}
figure{margin:0;width:360px}
img{width:100%;border-radius:12px;background:#f2f0e8;display:block}
figcaption{font-size:12px;opacity:.7;padding-top:6px}</style></head>
<body><h1>Tasarım ekranları — karşılaştırma için çizildi</h1><div class="grid">
{{ figures }}
</div></body></html>`;

await main();
