#!/usr/bin/env node
/**
 * Gerçek Lezza Foods katalogunu seed veri dosyasına ÇEVİRİR (05 · kullanıcı kararı 04.08).
 *
 * Kaynak: `https://lezzafoods.eu/wp-json/wc/store/v1/products` (WooCommerce Store API, açık uç).
 * Çıktı: `scripts/seed/data/lezza-catalog.json` — **ÜRETİLMİŞ, elle düzenlenmez.**
 *
 * ── NEDEN ÜRETEÇ + REPODA DURAN DOSYA ────────────────────────────────────────
 * Seed her koşuşta ağa çıkmamalı: `db:refresh` internetsiz de çalışmalı, ve uzaktaki site
 * değişince seed'in sessizce başka bir katalog kurması kabul edilemez (aynı komut, farklı sonuç —
 * hata ayıklanamaz). Desen `postal:build`'in aynısı: **üreteç ağa çıkar, çıktı repoda durur,
 * çıktıyı elle düzenlemek yasaktır** (düzenlenirse bir sonraki koşu sessizce geri alır).
 *
 * ── BU DOSYA VERİYİ SADIK ÇEVİRİR, UYDURMAZ ──────────────────────────────────
 * Kaynakta olmayan hiçbir alan burada üretilmez — fiyat, stok, alerjen, besin değeri, raf ömrü.
 * Bunlar **fikstür**dür ve seed'in işidir; ikisini karıştırmak, uydurulmuş bir değeri "kaynaktan
 * geldi" sanmanın en kolay yoludur. Ayrım tek cümleyle: **üreteç ayna, seed sahne.**
 *
 * **Yasal beyanlar (alerjen/içindekiler/besin) BİLEREK BOŞ BIRAKILIR ve bu bir eksiklik değil,
 * bir karardır.** Kaynakta yoklar. Uydurmak burada sıradan bir fikstürden farklıdır: ürün adları
 * GERÇEK ve marka gerçek — "fıstık içerir" diye uydurulmuş bir satır, bir gün bir ekrana düşerse
 * yanlış bir yasal beyan olur. Üstelik BOŞ LİSTE DE BİR BEYANDIR ("alerjen içermez"), yani
 * "boş geçelim" demek de güvenli değil. Doğrusu: alan hiç yazılmaz, seed onları
 * `null` bırakır ve ürün "beyan eksik" hâlinde durur — süzgeçlerin zaten tanıdığı bir hâl.
 *
 * ── ÇEVİRİ KURALLARI ─────────────────────────────────────────────────────────
 * **1) Gramaj addan ayrılır: ürün + VARYANT.** Kaynakta her boy ayrı bir "ürün"; bizim modelde
 * satılabilir birim varyanttır ve ürün paylaşılan bilgiyi taşır (`DATA_MODEL`). "Cold Baklava with
 * Walnut 400g" ile "… 1850g" tek ürünün iki boyudur; ayrı ürün yapmak aynı tarifi iki kez
 * anlatmak olurdu (yasal beyan da ürün seviyesindedir — iki kopya bir gün ayrışır).
 *
 * **2) Kategori AİLEDEN, kanal HORECA/RETAIL önekinden.** Kaynak iki ekseni tek listede karıştırıyor
 * (`dessert` bir aile, `horeca-dessert` bir kanal). Bizde bunlar ayrı eksenler ve ayrı kalmalı:
 * aile kategoridir, kanal fiyatın kime görüneceğidir (`DOMAIN §5`).
 *
 * **3) Açıklama KISA olandan gelir.** Uzun açıklama 3,5 bin karakterlik SEO metni ("private label
 * manufacturing", "B2B buyers across European markets") — vitrinde müşteriye gösterilecek bir
 * ürün açıklaması değil, arama motoruna yazılmış bir satış sayfası.
 *
 * **4) Dil: kaynak İNGİLİZCE ve öyle kalır.** Üç dilin üçüne aynı metin yazılır ve `sourceLanguage`
 * işaretlenir. Makine çevirisini buraya gömmek, çevrilmiş metni "kaynağın kendisi" gibi
 * gösterirdi; çeviri işi (20.2) zaten var ve ayrı bir adımdır. Kategori adları elle çevrilir —
 * onlar bizim sözlüğümüz, markanın metni değil.
 *
 * **Ne zaman çalıştırılır:** katalog kaynakta değiştiğinde. `pnpm lezza:catalog`
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts/seed/data/lezza-catalog.json');
const API = 'https://lezzafoods.eu/wp-json/wc/store/v1/products';

/**
 * Aile kategorileri — kaynak slug'ı → bizim anahtarımız + üç dilli ad.
 *
 * `retail-products` BİLEREK YOK: o bir aile değil, kanal kovası ("perakendede satılanlar").
 * Kategori sansaydık katalogda 58 ürünlük anlamsız bir "Perakende Ürünler" dalı doğardı ve aynı
 * ürün iki kategoride birden görünürdü.
 */
const AILELER = {
  bakery: { key: 'bakery', name: { tr: 'Fırın', fr: 'Boulangerie', de: 'Backwaren' } },
  dessert: { key: 'dessert', name: { tr: 'Tatlı', fr: 'Desserts', de: 'Süßspeisen' } },
  cake: { key: 'cake', name: { tr: 'Pasta', fr: 'Gâteaux', de: 'Torten' } },
  'chicken-products': { key: 'chicken', name: { tr: 'Tavuk Ürünleri', fr: 'Produits de volaille', de: 'Geflügelprodukte' } },
  'ice-cream': { key: 'ice-cream', name: { tr: 'Dondurma', fr: 'Glaces', de: 'Speiseeis' } },
  'anatolian-cuisine': { key: 'anatolian', name: { tr: 'Anadolu Mutfağı', fr: 'Cuisine anatolienne', de: 'Anatolische Küche' } },
};

/**
 * Kanal önekleri. Kaynakta aynı aile iki kez geçiyor (`horeca-bakery` · `retail-bakery`); bizde
 * bu bir kategori değil, ürünün hangi kanala açık olduğu.
 */
const KANAL_ONEKI = { horeca: 'b2b', retail: 'b2c' };

/** Gramaj/adet eki — addan ayrılıp varyanta gider. Ad SONUNDA da ORTASINDA da olabilir. */
const BOY = /\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|lt|cc|pcs|adet)\b/i;

function boyAyir(name) {
  const m = BOY.exec(name);
  if (!m) return { taban: name.trim(), boy: null };
  const sayi = Number.parseFloat(m[1].replace(',', '.'));
  const birim = m[2].toLowerCase();
  // Yalnız gram/kilogram net ağırlığa çevrilir; ml/adet ölçü birimi olarak etikette kalır.
  const netWeightG = birim === 'kg' ? Math.round(sayi * 1000) : ['g', 'gr'].includes(birim) ? Math.round(sayi) : null;
  const taban = `${name.slice(0, m.index)}${name.slice(m.index + m[0].length)}`.replace(/\s{2,}/g, ' ').trim();
  return { taban, boy: { etiket: `${sayi % 1 === 0 ? sayi : sayi}${birim}`, netWeightG } };
}

/**
 * HTML varlıklarını çözer. **ADA DA UYGULANIR, yalnız açıklamaya değil** (ölçüldü 04.08):
 * WordPress `&` karakterini `&#038;` diye kodluyor ve `name` alanı ham geliyor — çözülmeseydi
 * katalogda *"Mini Pide with Spinach &#038; Cheese"* yazardı. Böyle bir kaçak hata vermez, yalnız
 * müşteriye çirkin görünür; o yüzden ancak bakılırsa fark edilir.
 */
function varlikCoz(metin) {
  return metin
    .replace(/&nbsp;/g, ' ')
    .replace(/&#0?38;|&amp;/g, '&')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&#8212;|&mdash;/g, '—')
    .replace(/&#0?39;|&#8217;|&rsquo;|&apos;/g, '’')
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** HTML'i düz metne indirger — açıklama alanımız zengin metin değil. */
function duzMetin(html) {
  return varlikCoz(html.replace(/<[^>]+>/g, ' '));
}

/** Ürün anahtarı — taban addan üretilen slug. Kaynak slug'ı KULLANILMAZ: o boyu da içeriyor. */
function slugla(taban) {
  return taban
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function cek(page) {
  const res = await fetch(`${API}?per_page=100&page=${page}`, { headers: { 'User-Agent': 'lezzet-anatolia/catalog-build' } });
  if (!res.ok) throw new Error(`sayfa ${page}: HTTP ${res.status}`);
  return res.json();
}

const ham = [];
for (let page = 1; ; page += 1) {
  const batch = await cek(page);
  if (batch.length === 0) break;
  ham.push(...batch);
  if (batch.length < 100) break;
}
console.log(`▸ kaynaktan ${ham.length} kayıt çekildi`);

/** taban slug → ürün */
const urunler = new Map();

for (const p of ham) {
  const { taban, boy } = boyAyir(varlikCoz(p.name));
  const slug = slugla(taban);

  const slugs = p.categories.map((c) => c.slug);
  // Aile ÖNEKİ SOYULARAK da aranır: kaynakta `anatolian-cuisine` çıplak hâliyle HİÇ geçmiyor,
  // yalnız `horeca-anatolian-cuisine`/`retail-anatolian-cuisine` olarak var. Yalnız çıplak slug'a
  // baksaydık Anadolu Mutfağı'nın 19 ürünü kategorisiz kalırdı — ve kategorisizlik bir hata
  // vermez, ürün yalnızca hiçbir dalda görünmez olurdu.
  const aile = slugs.map((s) => AILELER[s] ?? AILELER[s.replace(/^(horeca|retail)-/, '')]).find(Boolean);
  const kanallar = [...new Set(slugs.flatMap((s) => {
    const onek = s.split('-')[0];
    return KANAL_ONEKI[onek] && s !== 'retail-products' ? [KANAL_ONEKI[onek]] : [];
  }))];

  if (!urunler.has(slug)) {
    urunler.set(slug, {
      slug,
      // Ad üç dilde AYNI ve bu bilinçli: marka adı çevrilmez, kaynak dili işaretlenir (20.2).
      name: { tr: taban, fr: taban, de: taban },
      sourceLanguage: 'en',
      category: aile?.key ?? null,
      brand: p.brands?.[0]?.name ?? null,
      description: duzMetin(p.short_description || ''),
      // Kapak + galeri; uzaktaki adresler. Seed bunları indirip R2'ye yükler.
      imageUrls: [],
      channels: [],
      variants: [],
    });
  }
  const u = urunler.get(slug);

  // Aynı ürünün farklı boyları farklı kanallarda olabilir — birleşir.
  for (const k of kanallar) if (!u.channels.includes(k)) u.channels.push(k);
  if (!u.category && aile) u.category = aile.key;
  if (!u.description) u.description = duzMetin(p.short_description || '');

  for (const img of p.images.slice(0, 2)) if (!u.imageUrls.includes(img.src)) u.imageUrls.push(img.src);

  u.variants.push({
    // Boysuz ürün (bütün pastalar) tek varsayılan varyant taşır — modelin kendi kuralı.
    label: boy ? { tr: boy.etiket, fr: boy.etiket, de: boy.etiket } : null,
    netWeightG: boy?.netWeightG ?? null,
    sku: p.sku || null,
    sourceId: p.id,
    sourceSlug: p.slug,
  });
}

const cikti = {
  // Künye: bu dosyanın nereden geldiği ve neyin ELE ALINMADIĞI okunabilir dursun.
  _generated: {
    by: 'scripts/build-lezza-catalog.mjs (pnpm lezza:catalog)',
    source: API,
    sourceRecords: ham.length,
    note:
      'ÜRETİLMİŞ DOSYA — elle düzenlenmez. Fiyat, stok, alerjen, içindekiler, besin değeri ve raf ömrü ' +
      'KAYNAKTA YOKTUR ve burada UYDURULMAZ; onlar seed fikstürüdür. Yasal beyanlar bilerek boştur.',
  },
  categories: Object.values(AILELER),
  products: [...urunler.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(cikti, null, 2)}\n`, 'utf8');

const varyantSayisi = cikti.products.reduce((n, p) => n + p.variants.length, 0);
const cokBoylu = cikti.products.filter((p) => p.variants.length > 1).length;
const kategorisiz = cikti.products.filter((p) => !p.category).length;
const skusuz = cikti.products.reduce((n, p) => n + p.variants.filter((v) => !v.sku).length, 0);
console.log(
  `✓ ${OUT.replace(`${ROOT}/`, '')}\n` +
    `  ${cikti.products.length} ürün · ${varyantSayisi} varyant (${cokBoylu} ürün çok boylu)\n` +
    `  kanal: ${cikti.products.filter((p) => p.channels.includes('b2b')).length} b2b · ` +
    `${cikti.products.filter((p) => p.channels.includes('b2c')).length} b2c\n` +
    `  ⚠ kategorisiz ${kategorisiz} ürün · SKU'suz ${skusuz} varyant`,
);
