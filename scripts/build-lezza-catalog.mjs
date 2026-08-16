#!/usr/bin/env node
/**
 * Gerçek Lezza Foods katalogunu seed veri dosyasına ÇEVİRİR (05 · kullanıcı kararı 04.08).
 *
 * Çıktı: `scripts/seed/data/lezza-catalog.json` — **ÜRETİLMİŞ, elle düzenlenmez.**
 *
 * ── ÜÇ KAYNAK, TEK OMURGA (15.08) ────────────────────────────────────────────
 * 1. **WooCommerce Store API** (`…/wc/store/v1/products`, ağ) — **OMURGA.** Ürün, boy, kategori,
 *    açıklama, görsel, kanal. Kapsamı en geniş kaynak budur (166 SKU) ve ötekiler onu zenginleştirir.
 * 2. **`data/sources/catalog-pdf.json`** (repo) — 2026 basılı kataloğun lojistiği: koli içi adet,
 *    kolinin paket sayısı, paletteki paket. API'de bu bilgi HİÇ yok. Ayrıca API'nin listelemediği
 *    9 SKU'yu taşır (perakende `mono` paketleri, tabaklı künefeler).
 * 3. **`data/sources/specs-docx.json`** (repo) — 6 ürünün ÜRETİCİ SPESİFİKASYONU: gerçek içindekiler,
 *    alerjen, besin değeri, saklama, raf ömrü.
 *
 * PDF ve spek kaynakları **ağdan yeniden üretilemez** (basılı katalogdan ve .docx belgelerinden elle
 * çıkarıldı), o yüzden repoda dururlar; künyeleri `data/sources/README.md`'de.
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
 * **Yasal beyan (alerjen/içindekiler/besin) YALNIZ SPEK BELGESİ OLAN 6 ÜRÜNDE YAZILIR; ötekilerde
 * bilerek boş kalır ve bu bir eksiklik değil, bir karardır.** Uydurmak burada sıradan bir fikstürden
 * farklıdır: ürün adları GERÇEK ve marka gerçek — "fıstık içerir" diye uydurulmuş bir satır, bir gün
 * bir ekrana düşerse yanlış bir yasal beyan olur. Üstelik BOŞ LİSTE DE BİR BEYANDIR ("alerjen
 * içermez"), yani "boş geçelim" demek de güvenli değil. Doğrusu: kaynağı olmayan üründe alan hiç
 * yazılmaz, seed onu `null` bırakır ve ürün "beyan eksik" hâlinde durur — süzgeçlerin tanıdığı bir hâl.
 *
 * Spek belgesi olan 6 üründe beyan **belgeden birebir** taşınır. Belgelerin kendi içindeki çelişkiler
 * (alerjen tablosu ↔ metin) kaynak dosyanın `_reliability` künyesinde yazılı: oraya yalnız GÜVENİLİR
 * bulunan alanlar alındı, tablolar hiç alınmadı. Bu ayrımı burada yeniden yapmıyoruz — kaynak dosya
 * zaten süzülmüş geliyor; süzgeci iki yerde tutmak, bir gün ikisinin ayrışması demektir.
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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'scripts/seed/data/lezza-catalog.json');
const KAYNAKLAR = join(ROOT, 'scripts/seed/data/sources');
const API = 'https://lezzafoods.eu/wp-json/wc/store/v1/products';

const oku = (dosya) => JSON.parse(readFileSync(join(KAYNAKLAR, dosya), 'utf8'));

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

/**
 * PDF kataloğun bölüm başlıkları → aile anahtarı.
 *
 * `retail` BİLEREK YOK ve sebebi API tarafındaki `retail-products` ile aynı: basılı katalog da
 * perakende kalemleri kendi bölümünde topluyor, yani o bir kanal kovası. Bölümü `retail` olan
 * PDF-only ürünün ailesi aşağıdaki elle tabloda verilir — üç kalem, hepsi künefe.
 */
const PDF_BOLUM = { bakery: 'bakery', dessert: 'dessert', lamour: 'cake', chicken: 'chicken', icecream: 'ice-cream', anatolian: 'anatolian' };

/**
 * ── PDF SKU YAMASI: API'de SKU'SU BOŞ kalan varyanta basılı katalogdan kimlik ────────────────────
 *
 * İki varyant API'ye SKU'suz düşüyor (ölçüldü 15.08) ve SKU'suzluk sessiz bir arızadır: parti
 * kabulünde, tedarik siparişinde ve sayımda varyantı BULUNAMAZ yapar — ekranda ürün görünür ama
 * hiçbir operasyon kalemi ona bağlanamaz. Basılı katalog ikisinin de kodunu veriyor.
 *
 * Eşleme neden ELLE: adlar iki kaynakta ayrışıyor (`Spiral Gul Borek` ↔ `Spiral Rose Börek` — aynı
 * ürünün Türkçe ve İngilizce adı). Otomatik bir benzerlik eşiği burada yanlış varyanta SKU bağlayıp
 * iki ürünü birbirine karıştırabilirdi; iki satırlık bir tablo, sessizce yanlış eşleşmeden iyidir.
 */
const PDF_SKU_YAMASI = {
  200410: { slug: 'eggplant-with-yogurt', etiket: '1000g' },
  700703: { slug: 'spiral-rose-borek-with-spinach-cheese', etiket: '6x80g' },
};

/**
 * Bölümü `retail` (yani kanal) olduğu için ailesi PDF'ten çözülemeyen tek-başına kalemler.
 * Üçü de künefe; tatlı olduklarını katalog değil ürünün kendisi söylüyor.
 */
const PDF_TEK_BASINA_AILE = { 500104: 'dessert', 500105: 'dessert', 500109: 'dessert' };

/**
 * Gramaj/adet eki — addan ayrılıp varyanta gider. Ad SONUNDA da ORTASINDA da olabilir.
 *
 * ── ÇOKLU PAKET BİÇİMİ (`4x80g`) — ÖNCE, ve sebebi ölçüldü (08.08, operasyon şeridi) ────────────
 * Tek desen vardı ve `\b`'si bu biçimi HİÇ eşleştirmiyordu: `80`'in önündeki `x` bir sözcük
 * karakteri, yani orada sınır oluşmuyor; `4`'ten sonra da birim gelmiyor. Sonuç sessizdi —
 * `Cheese Filled Pastry 4x80g`, `Lahmacun 3x180g`, `Spiral Rose Borek 6x80g` boy olarak
 * AYRIŞMIYOR, ayrı ürün gibi kataloğa giriyordu (33 kayıt, 14 ürün olmalıydı).
 *
 * Bu aynı zamanda `05.15`'teki "boy kardeşleri ailesiz kalıyor" açığının KÖKÜ: iki paket boyu ayrı
 * ürün sanıldığı için aile kurulamıyor, "benzer ürünler" de aynı ürünün üç gramajını gösteriyordu.
 *
 * Çoklu desen ÖNCE denenir: `4x80g` tek desene de kısmen uyar (`80g`) ve o zaman "4 paket" bilgisi
 * sessizce düşerdi — 320 g'lık kutu 80 g diye etiketlenirdi.
 */
const COKLU_BOY = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|lt|cc)\b/i;
const BOY = /\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|ml|lt|cc|pcs|adet)\b/i;

/**
 * ── PAKET İÇİ ADET (`(12 Pieces)`) — addan ayrılır, varyanta gider (05.14) ──────────────────────
 *
 * Kaynak aynı baklavayı dört kez yazıyor: *"Baklava with Pistachio (6 / 12 / 36 / 72 Pieces)"*. Ek
 * adın içinde kaldığı sürece slug ayrışıyor ve **tek ürün dört ayrı ürüne bölünüyordu** — ölçüldü
 * (08.08, operasyon şeridi): 10 kayıt, 2 ürün olmalı. `05.15`'in *"benzer ürünlerde aynı baklavanın
 * üç gramajı"* açığının kökü de buydu.
 *
 * Adet, gramajın YERİNE değil YANINA yazılır (`product_variant.pieces_count`): 72'lik kutu hem 72
 * adet hem 2500 g'dır ve ikisi ayrı soruya cevap verir ("kaç kişilik" ↔ "ne kadar yer kaplar").
 * Etiket gramajdan gelir — müşteri raftaki kutuda onu görüyor.
 *
 * **`pcs` bilerek DIŞARIDA:** o `BOY`'un birimi (ölçü olarak etikete giriyor). Buradaki desen yalnız
 * "pieces" sözcüğünü tanır, yani ölçü birimi ile paket adedi karışmaz.
 *
 * **`Mono Pack` de bilerek dışarıda ve gerekçesi ÖLÇÜM:** o bir adet değil bir KANAL ayrımı —
 * `artisan-lemon-cake` (b2b, 90 g, SKU 901016B) ile `…-mono-pack` (b2c, 90 g, SKU 901026B) aynı
 * ağırlıkta. Adet sansaydık aynı ürüne birbirinden ayırt edilemeyen iki "90g" varyantı girerdi.
 * Doğru birleşme oradan değil FİYAT ekseninden geçer (`DOMAIN §5`) — ayrı kayıt, kendi gerekçesiyle.
 */
const ADET = /\(?\s*(\d+)\s*pieces?\s*\)?/i;

/** Birimi grama çevirir; ml/adet ölçü birimi olarak etikette kalır (net ağırlık değil). */
function grama(sayi, birim) {
  if (birim === 'kg') return Math.round(sayi * 1000);
  return ['g', 'gr'].includes(birim) ? Math.round(sayi) : null;
}

function boyAyir(adHam) {
  // Adet ÖNCE ayrılır: `(12 Pieces)` addan çıkmadan boy deseni kalan metinde aranamaz ve slug da
  // ekle birlikte üretilirdi — ayrışmanın kaynağı tam olarak buydu.
  let name = adHam;
  let adet = null;
  const a = ADET.exec(name);
  if (a) {
    adet = Number.parseInt(a[1], 10);
    name = `${name.slice(0, a.index)}${name.slice(a.index + a[0].length)}`.replace(/\s{2,}/g, ' ').trim();
  }

  const coklu = COKLU_BOY.exec(name);
  if (coklu) {
    const paketAdedi = Number.parseInt(coklu[1], 10);
    const birimAgirlik = Number.parseFloat(coklu[2].replace(',', '.'));
    const birim = coklu[3].toLowerCase();
    const tekil = grama(birimAgirlik, birim);
    const taban = `${name.slice(0, coklu.index)}${name.slice(coklu.index + coklu[0].length)}`.replace(/\s{2,}/g, ' ').trim();
    return {
      taban,
      // `4x80g` de bir adet bildirir: kutuda 4 parça var. Ad ekinde adet AYRICA yazılıysa (nadir)
      // o öncelikli — daha açık bir beyandır.
      adet: adet ?? paketAdedi,
      boy: {
        // Etiket kaynaktaki biçimi KORUR (`4x80g`): müşteri kutunun üstünde onu görüyor.
        // "320 g" yazmak doğru toplamı verir ama raftaki ürünle eşleşmez.
        etiket: `${paketAdedi}x${birimAgirlik}${birim}`,
        // Net ağırlık ise TOPLAMDIR — kargo ve fiyat/kg hesabı kutunun tamamını taşır.
        netWeightG: tekil === null ? null : tekil * paketAdedi,
      },
    };
  }

  const m = BOY.exec(name);
  if (!m) return { taban: name.trim(), boy: null, adet };
  const sayi = Number.parseFloat(m[1].replace(',', '.'));
  const birim = m[2].toLowerCase();
  const taban = `${name.slice(0, m.index)}${name.slice(m.index + m[0].length)}`.replace(/\s{2,}/g, ' ').trim();
  return { taban, adet, boy: { etiket: `${sayi}${birim}`, netWeightG: grama(sayi, birim) } };
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

/**
 * ── AÇIKLAMANIN BAŞINDAKİ "<ad> <gramaj> –" ÖNEKİ AYIKLANIR (operasyon notu 08.08) ──────────────
 *
 * Kaynak her açıklamayı ürünün adı ve O KAYDIN gramajıyla açıyor:
 * *"Baklava with Walnut 450g – 12 frozen pre-portioned pieces…"*. Boylar tek üründe birleşince
 * (05.14) bu iki şeyi birden bozuyordu: **ad zaten hemen üstünde yazılı** (tekrar), ve 1250 g'ı
 * seçen müşteri 450 g'ı anlatan bir cümleyle karşılaşıyordu.
 *
 * Ayraç BOŞLUKLU tire olmalı: `E-Shaped Börek` içindeki tire bir ayraç değildir ve ayrıma
 * girmemeli. Önek ancak ürünün ADIYLA başlıyorsa atılır — açıklamayı gerçekten oradan başlatan
 * metinleri kesmemek için (ölçüldü: 127 açıklamanın 119'u ayıklanıyor, 8'i zaten öneksiz).
 *
 * ⚠ **Tutarsızlığın TAMAMINI bitirmez ve bunu abartmamak gerekiyor:** kalan gövde hâlâ tek bir boyu
 * anlatabiliyor (*"12 frozen pre-portioned pieces"*). Kaynakta boy başına bir açıklama var, bizde
 * ürün başına bir tane — hangisi seçilirse seçilsin ötekiler için eksik kalır. Öneğin atılması
 * TEKRARI bitirir, boy referansını değil. Gerçek çözüm açıklamanın elle yazılması ve o operatörün
 * işi (seed sahne kurar, gerçeği üretmez).
 */
const ACIKLAMA_ONEKI = /^(.{0,90}?)\s+[–—-]\s+/;

function onekAyikla(aciklama, ad) {
  const m = ACIKLAMA_ONEKI.exec(aciklama);
  if (!m) return aciklama;
  const sade = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  return sade(m[1]).startsWith(sade(ad).slice(0, 8)) ? aciklama.slice(m[0].length) : aciklama;
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

/**
 * Kategori GÖRSELLERİ — aynı Store API'nin `/products/categories` ucundan (kullanıcı kararı 08.08:
 * "kategoriler görselsiz kalmasın, kaynağın kendi görseliyle dolsun"). Yalnız AİLE kategorilerinin
 * görseli alınır; HoReCa/Retail satırları kanal kovasıdır ve görsel de taşımıyorlar (ölçüldü).
 *
 * Uçtaki slug aile anahtarıyla birebir değil (`anatolian-cuisine-ready-meals`), o yüzden eşleme
 * ürün tarafındaki çözümlemenin genişletilmişi: birebir → önek soyulmuş → "ile başlayan".
 */
async function kategoriGorselleri() {
  const res = await fetch(`${API}/categories`, { headers: { 'User-Agent': 'lezzet-anatolia/catalog-build' } });
  if (!res.ok) throw new Error(`kategori ucu: HTTP ${res.status}`);
  const gorsel = new Map();
  for (const c of await res.json()) {
    const soyulmus = c.slug.replace(/^(horeca|retail)-/, '');
    const aile =
      AILELER[c.slug] ?? AILELER[soyulmus] ?? AILELER[Object.keys(AILELER).find((k) => c.slug.startsWith(k)) ?? ''];
    if (aile && c.image?.src && !gorsel.has(aile.key)) gorsel.set(aile.key, c.image.src);
  }
  return gorsel;
}

const ham = [];
for (let page = 1; ; page += 1) {
  const batch = await cek(page);
  if (batch.length === 0) break;
  ham.push(...batch);
  if (batch.length < 100) break;
}
const gorseller = await kategoriGorselleri();
console.log(`▸ kaynaktan ${ham.length} kayıt + ${gorseller.size} kategori görseli çekildi`);

/** taban slug → ürün */
const urunler = new Map();

for (const p of ham) {
  const { taban, boy, adet } = boyAyir(varlikCoz(p.name));
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
      description: onekAyikla(duzMetin(p.short_description || ''), taban),
      // Kapak + galeri; uzaktaki adresler. Seed bunları indirip R2'ye yükler.
      imageUrls: [],
      channels: [],
      // Yasal beyan — yalnız spek belgesi olan üründe dolar (aşağıdaki 4. adım), ötekilerde `null`.
      declarations: null,
      variants: [],
    });
  }
  const u = urunler.get(slug);

  // Aynı ürünün farklı boyları farklı kanallarda olabilir — birleşir.
  for (const k of kanallar) if (!u.channels.includes(k)) u.channels.push(k);
  if (!u.category && aile) u.category = aile.key;
  if (!u.description) u.description = onekAyikla(duzMetin(p.short_description || ''), taban);

  for (const img of p.images.slice(0, 2)) if (!u.imageUrls.includes(img.src)) u.imageUrls.push(img.src);

  u.variants.push({
    // Boysuz ürün (bütün pastalar) tek varsayılan varyant taşır — modelin kendi kuralı.
    label: boy ? { tr: boy.etiket, fr: boy.etiket, de: boy.etiket } : null,
    netWeightG: boy?.netWeightG ?? null,
    // `null` = adet bildirilmemiş (dökme ürün) — sıfır DEĞİL (`CLAUDE §1`).
    piecesCount: adet,
    sku: p.sku || null,
    sourceId: p.id,
    sourceSlug: p.slug,
  });
}

// ── BASILI KATALOG + ÜRETİCİ SPEKLERİ: omurgayı zenginleştiren dört adım ─────────────────────────
//
// Sıra bağlayıcı: yama SKU yazar → dizin kurulur → eksik kalemler eklenir → dizin yenilenir →
// lojistik ve beyan o dizin üzerinden bağlanır. Dizini bir kez kurup baştan sona kullansaydık,
// yamayla kimlik kazanan iki varyant ile PDF'ten gelen dokuz kalem lojistik alamazdı.
const uyarilar = [];

/** SKU → { urun, varyant }. Yama ve ekleme SKU yazdığı için her adımdan sonra yeniden kurulur. */
function skuDizini() {
  const d = new Map();
  for (const u of urunler.values()) for (const v of u.variants) if (v.sku) d.set(String(v.sku), { urun: u, varyant: v });
  return d;
}

// 1) SKU YAMASI — API'de kimliksiz kalan varyanta basılı katalogdan kod.
for (const [sku, hedef] of Object.entries(PDF_SKU_YAMASI)) {
  const v = urunler.get(hedef.slug)?.variants.find((x) => !x.sku && x.label?.tr === hedef.etiket);
  if (!v) {
    uyarilar.push(`SKU yaması tutmadı: ${sku} → ${hedef.slug} / ${hedef.etiket} (varyant yok ya da SKU'su dolu)`);
    continue;
  }
  v.sku = sku;
}

const pdfKatalog = oku('catalog-pdf.json').products;
let dizin = skuDizini();

// 2) API'NİN LİSTELEMEDİĞİ KALEMLER — basılı kataloğun kapsamı API'den geniş (9 SKU).
//
// Hepsi `b2c`: biri perakende bölümünde, ötekiler `mono` (tek porsiyon) biçiminde listelenmiş ve
// ikisi de son tüketici paketidir. **Görsel ve açıklama YOK** — onların kaynağı API'ydi ve burada
// uydurulmaz; ürün onlarsız doğar, operatör sonra doldurur.
let pdfDenGelen = 0;
for (const [sku, p] of Object.entries(pdfKatalog)) {
  if (dizin.has(sku)) continue;
  const { taban, boy, adet } = boyAyir(varlikCoz(p.name));
  const slug = slugla(taban);
  const aile = PDF_BOLUM[p.section] ?? PDF_TEK_BASINA_AILE[sku] ?? null;
  if (!aile) uyarilar.push(`PDF kalemi ailesiz: ${sku} ${p.name} (bölüm: ${p.section})`);

  if (!urunler.has(slug)) {
    urunler.set(slug, {
      slug,
      name: { tr: taban, fr: taban, de: taban },
      sourceLanguage: 'en',
      category: aile,
      brand: 'Lezza',
      description: null,
      imageUrls: [],
      channels: ['b2c'],
      declarations: null,
      variants: [],
    });
  }
  const u = urunler.get(slug);
  // Etiket PDF'in kendi gramaj sütunundan: basılı katalogda ad gramajsız yazılıyor ("Tiramisu mono"),
  // ağırlık ayrı bir alanda duruyor — `boyAyir` orada tutunacak bir ek bulamaz.
  const etiket = boy?.etiket ?? (p.netWtG ? `${p.netWtG}g` : null);
  u.variants.push({
    label: etiket ? { tr: etiket, fr: etiket, de: etiket } : null,
    netWeightG: boy?.netWeightG ?? p.netWtG ?? null,
    piecesCount: adet,
    sku,
    // Kaynağı API OLMADIĞI için izlenecek bir uzak kayıt da yok — `null` bunu söylüyor.
    sourceId: null,
    sourceSlug: null,
  });
  pdfDenGelen += 1;
}
dizin = skuDizini();

// 3) LOJİSTİK — koli içi adet, kolinin paket sayısı, paletteki paket.
//
// `piecesCount` API'den geldiyse KORUNUR: o ürün ADININ beyanıdır (`(12 Pieces)`) ve müşteri raftaki
// kutuda onu görüyor; koli içi adet ise depo bilgisidir. Boşsa PDF'ten dolar, ama **yalnız 1'den
// büyükse**: "kolide 1 adet" bir paketleme bilgisi değil, adet bilgisinin yokluğudur — `null`
// kalması gerekir (`CLAUDE §1`: ölçülemeyen değer sıfır/bir değildir).
let lojistikli = 0;
for (const [sku, p] of Object.entries(pdfKatalog)) {
  const hedef = dizin.get(sku);
  if (!hedef) continue;
  hedef.varyant.logistics = {
    piecesPerBox: p.piecesPerBox ?? null,
    boxesPerParcel: p.boxesPerParcel ?? null,
    parcelsPerPallet: p.parcelsPerPallet ?? null,
  };
  if (hedef.varyant.piecesCount == null && (p.piecesPerBox ?? 0) > 1) hedef.varyant.piecesCount = p.piecesPerBox;
  lojistikli += 1;
}

// 4) ÜRETİCİ SPEKLERİ — 6 ürünün GERÇEK yasal beyanı, belgeden birebir.
//
// Spek kodu bazen sonuna harf alıyor (`200302A` — üreticinin kendi revizyon eki); katalogdaki
// karşılığı harfsizdir. Harf ancak birinci arama tutmazsa soyulur: önce tam kod denenir ki
// gerçekten `…A` diye bir SKU varsa yanlış varyanta beyan bağlanmasın.
const spekler = oku('specs-docx.json').specs;
let beyanli = 0;
for (const [sku, s] of Object.entries(spekler)) {
  const hedef = dizin.get(sku) ?? dizin.get(sku.replace(/[A-Za-z]+$/, ''));
  if (!hedef) {
    uyarilar.push(`spek eşleşmedi: ${sku} (${s.specName ?? s.docNo})`);
    continue;
  }
  hedef.urun.declarations = {
    specDoc: `${s.docNo} ${s.rev}`,
    ingredientsEU: s.ingredientsEU ?? null,
    allergens: s.allergens ?? [],
    traces: s.traces ?? [],
    nutritionPer100g: s.nutritionPer100g ?? null,
    storage: s.storage ?? null,
    shelfLifeMonths: s.shelfLifeMonths ?? null,
    cookingTips: s.cookingTips ?? null,
  };
  beyanli += 1;
}

const cikti = {
  // Künye: bu dosyanın nereden geldiği ve neyin ELE ALINMADIĞI okunabilir dursun.
  _generated: {
    by: 'scripts/build-lezza-catalog.mjs (pnpm lezza:catalog)',
    sources: {
      api: `${API} — omurga (${ham.length} kayıt)`,
      pdf: `data/sources/catalog-pdf.json — lojistik ${lojistikli} varyant, API'de olmayan ${pdfDenGelen} kalem`,
      spec: `data/sources/specs-docx.json — ${beyanli} ürünün gerçek yasal beyanı`,
    },
    note:
      'ÜRETİLMİŞ DOSYA — elle düzenlenmez. Fiyat ve stok hiçbir kaynakta yoktur ve burada UYDURULMAZ; ' +
      'onlar seed fikstürüdür. Yasal beyan yalnız spek belgesi olan üründe doludur (`declarations`), ' +
      'ötekilerde bilerek `null` — ürün "beyan eksik" hâlinde durur.',
  },
  // Görsel URL'i kaynaktan gelir, sabitte durmaz — kaynak kapağı değiştirirse sonraki üretim izler.
  categories: Object.values(AILELER).map((a) => ({ ...a, imageUrl: gorseller.get(a.key) ?? null })),
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
    `  basılı katalog: ${lojistikli} varyanta lojistik · ${pdfDenGelen} kalem API'de yoktu\n` +
    `  üretici speki: ${beyanli} ürüne gerçek yasal beyan\n` +
    `  ⚠ kategorisiz ${kategorisiz} ürün · SKU'suz ${skusuz} varyant`,
);
// Eşleşmeyen yama/spek SESSİZ GEÇMEZ: ikisi de elle kurulmuş bağlar ve kaynak değişince ilk kopan
// yer burasıdır. Tutmayan bir bağ ürünü görünürde sağlam bırakır — yalnız kimliği ya da beyanı
// eksik kalır, ki ikisi de ancak aranırsa fark edilir.
if (uyarilar.length > 0) console.log(`\n⚠ ${uyarilar.length} uyarı:\n${uyarilar.map((u) => `  · ${u}`).join('\n')}`);
