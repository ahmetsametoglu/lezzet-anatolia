#!/usr/bin/env node
/**
 * `pnpm design:compare [durum|bölüm …]` — TASARIMLA UYGULAMAYI EKRAN GÖRÜNTÜSÜNDEN karşılaştırır (13.09).
 *
 * ── NİÇİN VAR (kullanıcı kararı 13.09) ───────────────────────────────────────
 * "Kod ile yapılan karşılaştırmalar genelde yetersiz kalıyor." Farkların çoğu — ikon, yerleşim,
 * kart dili, menü — metinde görünmez. 30.08'in dersi de buydu (`design-shot.mjs` künyesi):
 * karşılaştırma hafızada değil İKİ RESİM arasında yapılır. Bu araç her durum için iki resmi AYNI
 * genişlikte çeker ve yan yana koyar; metin ve ikon farkını da makineyle çıkarır (kod katmanı).
 * Resimler İNCELEME kaynağıdır, assertion değil — hiçbir şeyi kırmaz.
 *
 * ── TASARIM KENDİ ÇALIŞMA DOSYASIYLA ÇİZİLİR ────────────────────────────────
 * `design-shot` şablonu boş çiziyordu (`{{ }}` görünür kalıyordu); burada tasarım aracının kendi
 * çalışma dosyası (`support.js`) koşar ve ekran/persona `__dcSetProps` ile seçilir — resim
 * tasarımcının gördüğünün aynısıdır. Klasör yerel bir HTTP sunucusundan verilir: `file://`
 * üzerinden çalışma dosyası yüklenmiş görselleri okuyamıyor (ölçüldü 13.09: `.image-slots.state.json`
 * isteği reddedildi). Kırpılan alan tarayıcı çerçevesidir, çevresindeki tuval değil
 * (`design/project/CLAUDE.md`).
 *
 * ── UYGULAMA: ÇALIŞAN DEV SERVER, GERÇEK OTURUM ──────────────────────────────
 * Ziyaretçi bağlamı 67000 yer çereziyle açılır (tasarımın misafiri de 67000'de). Girişli bağlam
 * `/auth/dev-login` ile seed müşterisine GERÇEK oturum kurar (`ui-shot` künyesi); oturum bir kez
 * kurulur, bütün girişli çekimler onu kullanır. Dev server'ı KULLANICI yönetir (CLAUDE §4).
 *
 * **Tek yan etki, bilerek:** sepet ve checkout dolu sepet ister; sepet boşsa araç katalogdan üç
 * ürün ekler. Ziyaretçide bu tarayıcıda kalır; girişli müşteride hesabın sepetine yazılır (yerel
 * veri). Başka hiçbir şey yazılmaz — sipariş verilmez, giriş kodu gönderilmez.
 *
 * ── TASARIM EKRAN GÖRÜNTÜSÜ YALNIZ İSTENİNCE ─────────────────────────────────
 * `design/project/CLAUDE.md`: tasarımın ekran görüntüsü kullanıcı açıkça istediğinde üretilir. Bu
 * araç o isteğin aracıdır (13.09) — kendiliğinden koşulmaz.
 *
 * Çıktı `.design-shots/musteri-web-v1/` (git dışı): durum başına `tasarim.png` · `uygulama.png` ·
 * `fark.json`, hepsini yan yana gösteren `index.html`. Argüman verilirse yalnız o durumlar
 * (`g04`) ya da bölüm (`girisli`) yeniden çekilir, öteki sonuçlar yerinde kalır.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..');
const DESIGN_DIR = join(ROOT, 'design', 'project');
const DESIGN_FILE = 'Musteri Web v1.dc.html';
const OUT = join(ROOT, '.design-shots', 'musteri-web-v1');
const APP = process.env.UI_SHOT_BASE ?? 'http://localhost:3000';

/** Girişli çekimlerin müşterisi — seed'in giriş kaydı olan müşterisi (`dev-login-gate` künyesi). */
const CUSTOMER_EMAIL = process.env.DESIGN_COMPARE_EMAIL ?? 'claire.weber@example.fr';
/**
 * Sipariş/talep/davete bağlı ekranlar KİMLİK ister ve seed müşterisinde bugün hiçbiri yok (ölçüldü
 * 13.09: Claire'in siparişi, talebi, açık değerlendirme daveti yok). Verilmezse o durumların
 * uygulama tarafı ADIYLA atlanır — 404 resmi "karşılaştırıldı" sayılmasın.
 */
const ORDER_REF = process.env.DESIGN_COMPARE_ORDER ?? null;
const TICKET_ID = process.env.DESIGN_COMPARE_TICKET ?? null;
const FEEDBACK_TOKEN = process.env.DESIGN_COMPARE_FEEDBACK ?? null;

/** Tasarımın tarayıcı çerçevesi 1360 px; uygulama AYNI genişlikte çizilir ki fark genişlikten doğmasın. */
const FRAME_WIDTH = 1360;
/** Tasarımın kendi önizleme ölçüsü (`data-props` → `$preview`). */
const DESIGN_VIEWPORT = { width: 1440, height: 1020 };
const APP_VIEWPORT = { width: FRAME_WIDTH, height: 960 };

const LABELS = {
  anasayfa: 'Web · Anasayfa',
  katalog: 'Web · Katalog',
  urun: 'Web · Ürün detay',
  paketler: 'Web · Paketler',
  paketDetay: 'Web · Paket detay',
  tarifler: 'Web · Tarifler',
  tarif: 'Web · Tarif',
  kesif: 'Web · Keşif',
  sepet: 'Web · Sepet',
  checkout: 'Web · Checkout',
  onay: 'Web · Sipariş alındı',
  siparisler: 'Web · Siparişler',
  siparisDetay: 'Web · Sipariş detay',
  hesap: 'Web · Hesap',
  giris: 'Web · Giriş',
  pro: 'Web · Professionnels',
  talepler: 'Web · Talepler',
  talepDetay: 'Web · Talep detay',
  yeniTalep: 'Web · Yeni talep',
  geriBildirim: 'Web · Geri bildirim',
  statik: 'Web · Bilgi sayfası',
  hata: 'Web · Hata',
};

// ── Etkileşimler — iki yüzde aynı hâle götüren adımlar ─────────────────────────

/** Tasarımın başlıktaki yer çipi: metni personaya göre değişir, kanal sözcüğü sabit. */
const designChip = (page) => page.getByText('· kapıya teslim').first().click();
/**
 * Uygulamanın yer çipi (`place-chip.tsx`): iğne ikonu SVG, metin posta kodunu taşır ("67000 Strasbourg",
 * "Ev · 67100") — başlıkta beş haneli sayı taşıyan tek düğme. Sepet hapı bağlantı, düğme değil.
 */
const appChip = (page) => page.getByRole('button', { name: /\d{5}/ }).first().click();

const designAccountMenu = (page) => page.locator('[title="Hesabım"]').first().click();
/** Avatar (`account-entry.tsx`) baş harf yazar; erişilebilir adı "Hesabım". */
const appAccountMenu = (page) => page.getByRole('button', { name: 'Hesabım', exact: true }).first().click();

async function designNewAddress(page) {
  await page.getByText('+ Yeni adres', { exact: true }).first().click();
  await page.getByText('Yeni teslimat adresi').waitFor({ timeout: 5_000 });
}
async function designNewAddressTyped(page) {
  await designNewAddress(page);
  await page.getByPlaceholder('ör. 12 Rue des Orfèvres').fill('12 Rue');
}
/** Uygulamada yeni adres sepetteki adres kartından açılır: Değiştir → + Yeni adres (13.09). */
async function appNewAddress(page) {
  await page.getByRole('button', { name: 'Değiştir', exact: true }).first().click();
  await page.getByRole('button', { name: '+ Yeni adres', exact: true }).first().click();
  await page.getByLabel('Sokak ve numara').first().waitFor({ timeout: 10_000 });
}
async function appNewAddressTyped(page) {
  await appNewAddress(page);
  await page.getByLabel('Sokak ve numara').first().fill('12 rue des orf');
  // BAN önerisi tarayıcıdan gelir ve gecikmelidir — liste çizilsin.
  await page.waitForTimeout(1_800);
}

/**
 * Karşılaştırılan hâller. `overlay`: resim sayfanın tamamı değil GÖRÜNEN alan — açılır panel ve
 * pencere orada durur; tam sayfa çekimde sabit konumlu katman uzun resmin ortasına düşerdi.
 */
const STATES = [
  // ── Misafir
  { id: 'm01', section: 'misafir', title: 'Anasayfa', design: { screen: 'anasayfa', persona: 'misafir' }, app: { path: '/tr', auth: 'guest' } },
  { id: 'm02', section: 'misafir', title: 'Yer paneli — posta kodu', overlay: true, design: { screen: 'anasayfa', persona: 'misafir', act: designChip }, app: { path: '/tr', auth: 'guest', act: appChip } },
  { id: 'm03', section: 'misafir', title: 'Katalog', design: { screen: 'katalog', persona: 'misafir' }, app: { path: '/tr/katalog', auth: 'guest' } },
  { id: 'm04', section: 'misafir', title: 'Ürün detay', design: { screen: 'urun', persona: 'misafir' }, app: { path: '/tr/urun/cevizli-baklava', auth: 'guest' } },
  { id: 'm05', section: 'misafir', title: 'Paketler', design: { screen: 'paketler', persona: 'misafir' }, app: { path: '/tr/paketler', auth: 'guest' } },
  { id: 'm06', section: 'misafir', title: 'Paket detay', design: { screen: 'paketDetay', persona: 'misafir' }, app: { path: '/tr/paket/bayram-sofrasi-paketi', auth: 'guest' } },
  { id: 'm07', section: 'misafir', title: 'Tarifler', design: { screen: 'tarifler', persona: 'misafir' }, app: { path: '/tr/tarifler', auth: 'guest' } },
  { id: 'm08', section: 'misafir', title: 'Tarif', design: { screen: 'tarif', persona: 'misafir' }, app: { path: '/tr/tarif/citir-pazar-kahvaltisi', auth: 'guest' } },
  { id: 'm09', section: 'misafir', title: 'Keşif', design: { screen: 'kesif', persona: 'misafir' }, app: { path: '/tr/kesfet', auth: 'guest' } },
  { id: 'm10', section: 'misafir', title: 'Sepet — boş', design: { screen: 'sepet', persona: 'misafir', empty: true }, app: { path: '/tr/sepet', auth: 'guest-empty' } },
  { id: 'm11', section: 'misafir', title: 'Sepet — dolu, giriş gerekli', design: { screen: 'sepet', persona: 'misafir' }, app: { path: '/tr/sepet', auth: 'guest', cart: true } },
  { id: 'm12', section: 'misafir', title: 'Giriş', design: { screen: 'giris', persona: 'misafir' }, app: { path: '/tr/giris', auth: 'guest' } },
  { id: 'm13', section: 'misafir', title: 'Hesap — misafir', design: { screen: 'hesap', persona: 'misafir' }, app: { path: '/tr/hesap', auth: 'guest' } },
  { id: 'm14', section: 'misafir', title: 'Professionnels', design: { screen: 'pro', persona: 'misafir' }, app: { path: '/tr/kurumsal', auth: 'guest' } },
  { id: 'm15', section: 'misafir', title: 'Bilgi sayfası (SSS)', design: { screen: 'statik', persona: 'misafir' }, app: { path: '/tr/sikca-sorulan-sorular', auth: 'guest' } },
  { id: 'm16', section: 'misafir', title: 'Hata (404)', design: { screen: 'hata', persona: 'misafir' }, app: { path: '/tr/bu-sayfa-yok', auth: 'guest' } },
  // ── Girişli
  { id: 'g01', section: 'girisli', title: 'Anasayfa — girişli başlık', design: { screen: 'anasayfa', persona: 'perakende' }, app: { path: '/tr', auth: 'customer' } },
  { id: 'g02', section: 'girisli', title: 'Hesap menüsü (avatar)', overlay: true, design: { screen: 'anasayfa', persona: 'perakende', act: designAccountMenu }, app: { path: '/tr', auth: 'customer', act: appAccountMenu } },
  { id: 'g03', section: 'girisli', title: 'Yer paneli — adresler', overlay: true, design: { screen: 'anasayfa', persona: 'perakende', act: designChip }, app: { path: '/tr', auth: 'customer', act: appChip } },
  { id: 'g04', section: 'girisli', title: 'Sepet — girişli, dolu', design: { screen: 'sepet', persona: 'perakende' }, app: { path: '/tr/sepet', auth: 'customer', cart: true } },
  { id: 'g05', section: 'girisli', title: 'Yeni adres penceresi', overlay: true, design: { screen: 'sepet', persona: 'perakende', act: designNewAddress }, app: { path: '/tr/sepet', auth: 'customer', cart: true, act: appNewAddress } },
  { id: 'g06', section: 'girisli', title: 'Yeni adres — öneriler', overlay: true, design: { screen: 'sepet', persona: 'perakende', act: designNewAddressTyped }, app: { path: '/tr/sepet', auth: 'customer', cart: true, act: appNewAddressTyped } },
  { id: 'g07', section: 'girisli', title: 'Checkout', design: { screen: 'checkout', persona: 'perakende' }, app: { path: '/tr/odeme', auth: 'customer', cart: true } },
  {
    id: 'g08',
    section: 'girisli',
    title: 'Sipariş alındı',
    design: { screen: 'onay', persona: 'perakende' },
    app: ORDER_REF ? { path: `/tr/odeme/${ORDER_REF}`, auth: 'customer' } : { skip: 'sipariş numarası verilmedi (DESIGN_COMPARE_ORDER) — girişli müşterinin siparişi yok' },
  },
  { id: 'g09', section: 'girisli', title: 'Siparişlerim', design: { screen: 'siparisler', persona: 'perakende' }, app: { path: '/tr/siparislerim', auth: 'customer' } },
  {
    id: 'g10',
    section: 'girisli',
    title: 'Sipariş detay',
    design: { screen: 'siparisDetay', persona: 'perakende' },
    app: ORDER_REF ? { path: `/tr/siparislerim/${ORDER_REF}`, auth: 'customer' } : { skip: 'sipariş numarası verilmedi (DESIGN_COMPARE_ORDER) — girişli müşterinin siparişi yok' },
  },
  { id: 'g11', section: 'girisli', title: 'Hesabım', design: { screen: 'hesap', persona: 'perakende' }, app: { path: '/tr/hesap', auth: 'customer' } },
  { id: 'g12', section: 'girisli', title: 'Talepler', design: { screen: 'talepler', persona: 'perakende' }, app: { path: '/tr/talep', auth: 'customer' } },
  {
    id: 'g13',
    section: 'girisli',
    title: 'Talep detay',
    design: { screen: 'talepDetay', persona: 'perakende' },
    app: TICKET_ID ? { path: `/tr/talep/${TICKET_ID}`, auth: 'customer' } : { skip: 'talep kimliği verilmedi (DESIGN_COMPARE_TICKET) — girişli müşterinin talebi yok' },
  },
  { id: 'g14', section: 'girisli', title: 'Yeni talep', design: { screen: 'yeniTalep', persona: 'perakende' }, app: { path: '/tr/talep/yeni', auth: 'customer' } },
  {
    id: 'g15',
    section: 'girisli',
    title: 'Geri bildirim',
    design: { screen: 'geriBildirim', persona: 'perakende' },
    app: FEEDBACK_TOKEN
      ? { path: `/tr/degerlendirme/${FEEDBACK_TOKEN}`, auth: 'customer' }
      : { skip: 'değerlendirme bağlantısı verilmedi (DESIGN_COMPARE_FEEDBACK) — sayfa yalnız jetonla açılır' },
  },
];

// ── Yardımcılar ──────────────────────────────────────────────────────────────

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
const slugify = (text) =>
  [...text]
    .map((ch) => TR_MAP[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const EMOJI = /\p{Extended_Pictographic}/gu;

/** Görünen metnin satırları — boşluk sadeleşir, tekrarlar düşer; tek karakterlik satır gürültüdür. */
const linesOf = (text) => [...new Set(text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 1))];

/** `a`da olup `b`de olmayan satırlar (büyük/küçük harf duyarsız). */
function missingIn(a, b) {
  const seen = new Set(b.map((line) => line.toLocaleLowerCase('tr')));
  return a.filter((line) => !seen.has(line.toLocaleLowerCase('tr')));
}

const esc = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/** Tasarım klasörünü yalnız bu makineye verir — `file://`in kapattığı istekler (yukarıdaki künye) açılsın. */
function serveDesign() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://yerel').pathname);
    const file = normalize(join(DESIGN_DIR, path));
    if (!file.startsWith(DESIGN_DIR) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * Tasarımın tarayıcı çerçevesi — tarayıcıda koşar. Ekran etiketinden yukarı çıkıp 1360 px'lik
 * sayfa gövdesini bulur; bir önceki kardeş sahte adres çubuğudur. Pencere ve bildirim çerçevenin
 * DIŞINDA kardeş olarak durur (`am.acik`, `toast`), metin ve ikon sayımına onlar da girer.
 */
function frameOf(labelEl) {
  let node = labelEl;
  while (node && !(node.style && node.style.width === '1360px')) node = node.parentElement;
  const body = node;
  const bar = body.previousElementSibling;
  const extras = [...body.parentElement.children].filter((child) => child !== bar && child !== body);
  const top = bar.getBoundingClientRect();
  const bottom = body.getBoundingClientRect();
  return {
    box: { x: top.x + globalThis.scrollX, y: top.y + globalThis.scrollY, width: Math.round(bottom.width), height: Math.round(bottom.bottom - top.top) },
    text: [body.innerText, ...extras.map((child) => child.innerText)].join('\n'),
    svg: body.querySelectorAll('svg').length + extras.reduce((sum, child) => sum + child.querySelectorAll('svg').length, 0),
  };
}

// ── Çekim ─────────────────────────────────────────────────────────────────────

async function shootDesign(browser, designBase, state, dir) {
  const context = await browser.newContext({ viewport: DESIGN_VIEWPORT });
  const page = await context.newPage();
  const logs = [];
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  /* `bosDurum` bileşen KURULURKEN okunuyor (`componentDidMount`) ve sonradan verilen `__dcSetProps`
     onu değiştirmiyor — ölçüldü 13.09: "Sepet — boş" karesi dolu sepeti çizdi. Varsayılanlar sayfa
     gelirken yeniden yazılır; çalışma dosyası sayfanın kendisini ikinci kez istediğinde de aynı
     cevap döner. Ekran ve persona her çizimde okunduğu için onlar da burada verilir. */
  await page.route(
    (url) => url.pathname === `/${encodeURIComponent(DESIGN_FILE)}`,
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text())
        .replace(/(&quot;baslangicEkran&quot;:\{[^}]*?&quot;default&quot;:&quot;)[a-zA-Z]+/, `$1${state.design.screen}`)
        .replace(/(&quot;persona&quot;:\{[^}]*?&quot;default&quot;:&quot;)[a-zA-Z]+/, `$1${state.design.persona}`)
        .replace(/(&quot;bosDurum&quot;:\{[^}]*?&quot;default&quot;:)(true|false)/, `$1${Boolean(state.design.empty)}`);
      await route.fulfill({ response, body });
    },
  );
  try {
    await page.goto(`${designBase}/${encodeURIComponent(DESIGN_FILE)}`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => typeof globalThis.__dcSetProps === 'function', null, { timeout: 30_000 });
    await page.locator('[data-screen-label]').first().waitFor({ timeout: 30_000 });
    const props = { baslangicEkran: state.design.screen, persona: state.design.persona, bosDurum: Boolean(state.design.empty) };
    await page.evaluate((overrides) => globalThis.__dcSetProps(globalThis.__dcRootName(), overrides), props);
    const label = page.locator(`[data-screen-label="${LABELS[state.design.screen]}"]`);
    await label.waitFor({ timeout: 15_000 });
    if (state.design.act) {
      try {
        await state.design.act(page);
      } catch (err) {
        logs.push(`[etkileşim] ${err.message.split('\n')[0]}`);
      }
    }
    await page.waitForTimeout(450);
    const frame = await label.evaluate(frameOf);
    const file = join(dir, 'tasarim.png');
    if (state.overlay) {
      await page.evaluate(() => globalThis.scrollTo(0, 0));
      await page.screenshot({ path: file, clip: { ...frame.box, height: DESIGN_VIEWPORT.height - frame.box.y }, animations: 'disabled' });
    } else {
      await page.screenshot({ path: file, clip: frame.box, fullPage: true, animations: 'disabled' });
    }
    return { ok: true, text: frame.text, svg: frame.svg, logs };
  } catch (err) {
    logs.push(`[design-compare] ${err.message.split('\n')[0]}`);
    return { ok: false, text: '', svg: 0, logs };
  } finally {
    await context.close();
  }
}

/** Sepet boşsa katalogdan ilk üç ürünü ekler (künyedeki tek yan etki). */
async function ensureCart(page) {
  await page.goto(`${APP}/tr/sepet`, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
  const empty = await page
    .getByText(/Sepetiniz (şu an boş|boşaldı)/)
    .first()
    .isVisible()
    .catch(() => false);
  if (!empty) return 'dolu';
  await page.goto(`${APP}/tr/katalog`, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
  const buttons = await page.getByRole('button', { name: 'Sepete ekle', exact: true }).elementHandles();
  for (const button of buttons.slice(0, 3)) {
    await button.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  return `${Math.min(buttons.length, 3)} ürün eklendi`;
}

async function shootApp(state, dir, contextFor, cartReady) {
  if (state.app.skip) return { ok: false, skipped: state.app.skip, text: '', svg: 0, logs: [] };
  const context = await contextFor(state.app.auth);
  if (context === null) return { ok: false, text: '', svg: 0, logs: ['[design-compare] girişli oturum kurulamadı (`/auth/dev-login`)'] };

  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  try {
    if (state.app.cart && !cartReady.has(state.app.auth)) {
      logs.push(`[sepet] ${await ensureCart(page)}`);
      cartReady.add(state.app.auth);
    }
    await page
      .goto(APP + state.app.path, { waitUntil: 'networkidle', timeout: 45_000 })
      .catch((err) => logs.push(`[design-compare] sayfa sakinleşmedi: ${err.message.split('\n')[0]}`));
    // Next'in geliştirme rozeti ekranın parçası değil.
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' }).catch(() => {});
    if (state.app.act) {
      try {
        await state.app.act(page);
      } catch (err) {
        logs.push(`[etkileşim] ${err.message.split('\n')[0]}`);
      }
    }
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(dir, 'uygulama.png'), fullPage: !state.overlay, animations: 'disabled' });
    const info = await page.evaluate(() => ({ text: globalThis.document.body.innerText, svg: globalThis.document.body.querySelectorAll('svg').length, url: globalThis.location.pathname }));
    return { ok: true, ...info, logs };
  } catch (err) {
    logs.push(`[design-compare] ${err.message.split('\n')[0]}`);
    return { ok: false, text: '', svg: 0, logs };
  } finally {
    await page.close();
  }
}

// ── Rapor ─────────────────────────────────────────────────────────────────────

function listHtml(lines) {
  if (lines.length === 0) return '<p class="none">— yok —</p>';
  const shown = lines.slice(0, 120);
  const rest = lines.length - shown.length;
  return `<ul>${shown.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>${rest > 0 ? `<p class="none">… ve ${rest} satır daha (fark.json)</p>` : ''}`;
}

function writeIndex(results) {
  const rows = results
    .map((r) => {
      const base = `${r.section}/${r.dir}`;
      const app = r.app.skipped
        ? `<div class="skip">Uygulama tarafı çekilmedi: ${esc(r.app.skipped)}</div>`
        : `<a href="${base}/uygulama.png"><img loading="lazy" src="${base}/uygulama.png" alt="uygulama ${esc(r.title)}"></a>`;
      const icons = `ikon — tasarım: ${r.icons.designSvg} SVG · ${r.icons.designEmoji.length} emoji · uygulama: ${r.icons.appSvg} SVG · ${r.icons.appEmoji.length} emoji ${esc(r.icons.appEmoji.join(' '))}`;
      return `<section id="${r.id}">
  <h2>${r.id} · ${esc(r.title)} <small>${r.section}${r.overlay ? ' · görünen alan' : ''}</small></h2>
  <p class="meta">${esc(r.appPath ?? '—')} · ${icons}${r.app.logs.length ? ` · uygulama konsolu: ${r.app.logs.length} kayıt` : ''}${r.design.logs.length ? ` · tasarım: ${r.design.logs.length} kayıt` : ''}</p>
  <div class="pair">
    <figure><figcaption>Tasarım (v1)</figcaption><a href="${base}/tasarim.png"><img loading="lazy" src="${base}/tasarim.png" alt="tasarım ${esc(r.title)}"></a></figure>
    <figure><figcaption>Uygulama (dev)</figcaption>${app}</figure>
  </div>
  <details><summary>Metin farkı — tasarımda olup uygulamada olmayan ${r.onlyDesign.length} · uygulamada olup tasarımda olmayan ${r.onlyApp.length}</summary>
    <div class="cols"><div><h3>Yalnız tasarımda</h3>${listHtml(r.onlyDesign)}</div><div><h3>Yalnız uygulamada</h3>${listHtml(r.onlyApp)}</div></div>
  </details>
  ${[...r.design.logs, ...r.app.logs].length ? `<details><summary>Kayıtlar</summary><pre>${esc([...r.design.logs.map((l) => `tasarım ${l}`), ...r.app.logs.map((l) => `uygulama ${l}`)].join('\n'))}</pre></details>` : ''}
</section>`;
    })
    .join('\n');
  const nav = results.map((r) => `<a href="#${r.id}">${r.id} ${esc(r.title)}</a>`).join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Müşteri Web v1 — tasarım ↔ uygulama</title>
<style>
  body{margin:0;font:14px/1.5 system-ui,sans-serif;background:#f2f0e8;color:#2f3437}
  header{padding:18px 24px;border-bottom:1px solid #d8d2c2;position:sticky;top:0;background:#f2f0e8;z-index:2}
  header h1{margin:0 0 8px;font-size:18px}
  nav{display:flex;flex-wrap:wrap;gap:6px}nav a{font-size:12px;padding:3px 8px;border:1px solid #d8d2c2;border-radius:10px;color:#2f3437;text-decoration:none;background:#fff}
  main{padding:8px 24px 60px}
  section{margin:28px 0;padding-top:12px;border-top:1px solid #d8d2c2}
  h2{font-size:16px;margin:0}h2 small{font-weight:400;color:#6d7261}
  .meta{margin:4px 0 10px;color:#6d7261;font-size:12px}
  .pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
  figure{margin:0;background:#fff;border:1px solid #d8d2c2;border-radius:8px;overflow:hidden}
  figcaption{font-size:12px;font-weight:600;padding:6px 10px;border-bottom:1px solid #eee}
  img{display:block;width:100%;height:auto}
  .skip{padding:24px;color:#8a6b2a;background:#fdf3e0}
  details{margin-top:10px}summary{cursor:pointer;font-weight:600}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cols ul{margin:6px 0;padding-left:18px;font-size:12px}
  .none{color:#8a8270;font-size:12px}pre{white-space:pre-wrap;font-size:11px;background:#fff;padding:8px}
</style></head><body>
<header><h1>Müşteri Web v1 — tasarım ↔ uygulama (${results.length} durum)</h1><nav>${nav}</nav></header>
<main>${rows}</main></body></html>`;
  writeFileSync(join(OUT, 'index.html'), html);
}

// ── Akış ──────────────────────────────────────────────────────────────────────

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const selected = only.length ? STATES.filter((s) => only.includes(s.id) || only.includes(s.section)) : STATES;
if (selected.length === 0) {
  console.error(`eşleşen durum yok — kimlikler: ${STATES.map((s) => s.id).join(' ')} · bölümler: misafir girisli`);
  process.exit(2);
}

try {
  await fetch(APP, { signal: AbortSignal.timeout(15_000), redirect: 'manual' });
} catch {
  console.error(`[design-compare] ${APP} cevap vermiyor — dev server kapalı. Başlatması KULLANICININ (CLAUDE §4).`);
  process.exit(1);
}

if (only.length === 0) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await serveDesign();
const designBase = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

const contexts = new Map();
async function contextFor(auth) {
  if (contexts.has(auth)) return contexts.get(auth);
  let context = await browser.newContext({ viewport: APP_VIEWPORT, locale: 'tr-TR' });
  if (auth === 'customer') {
    const page = await context.newPage();
    await page
      .goto(`${APP}/auth/dev-login?email=${encodeURIComponent(CUSTOMER_EMAIL)}&next=${encodeURIComponent('/tr')}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      .catch(() => {});
    const path = new URL(page.url()).pathname;
    await page.close();
    if (!path.startsWith('/tr') || path.startsWith('/tr/giris')) {
      await context.close();
      context = null;
    }
  } else {
    // Tasarımın misafiri 67000'de; uygulamanın ziyaretçisi de aynı yerde başlasın (`place-store` çerezi).
    const answer = encodeURIComponent(JSON.stringify({ country: 'FR', postalCode: '67000' }));
    await context.addCookies([{ name: 'lezzet.place.v2', value: answer, url: APP, sameSite: 'Lax' }]);
  }
  contexts.set(auth, context);
  return context;
}

const cartReady = new Set();
const resultsFile = join(OUT, 'results.json');
const previous = only.length && existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : [];
const fresh = [];

for (const state of selected) {
  const dirName = `${state.id}-${slugify(state.title)}`;
  const dir = join(OUT, state.section, dirName);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const design = await shootDesign(browser, designBase, state, dir);
  const app = await shootApp(state, dir, contextFor, cartReady);

  const designLines = linesOf(design.text);
  const appLines = linesOf(app.text);
  const result = {
    id: state.id,
    section: state.section,
    title: state.title,
    dir: dirName,
    overlay: Boolean(state.overlay),
    appPath: state.app.path ?? null,
    appUrl: app.url ?? null,
    design: { ok: design.ok, logs: design.logs },
    app: { ok: app.ok, skipped: app.skipped ?? null, logs: app.logs },
    icons: {
      designSvg: design.svg,
      designEmoji: [...new Set(design.text.match(EMOJI) ?? [])],
      appSvg: app.svg,
      appEmoji: [...new Set(app.text.match(EMOJI) ?? [])],
    },
    onlyDesign: app.ok ? missingIn(designLines, appLines) : [],
    onlyApp: app.ok ? missingIn(appLines, designLines) : [],
  };
  writeFileSync(join(dir, 'fark.json'), JSON.stringify(result, null, 2));
  if (design.text) writeFileSync(join(dir, 'tasarim.txt'), designLines.join('\n'));
  if (app.text) writeFileSync(join(dir, 'uygulama.txt'), appLines.join('\n'));
  fresh.push(result);

  const appNote = app.skipped ? `atlandı (${app.skipped})` : app.ok ? `✓ ${app.url}` : '✗';
  console.log(`  ${state.id} ${state.title} — tasarım ${design.ok ? '✓' : '✗'} · uygulama ${appNote}${app.logs.length ? ` · ${app.logs.length} kayıt` : ''}`);
}

await browser.close();
server.close();

const merged = [...previous.filter((p) => !fresh.some((f) => f.id === p.id)), ...fresh].sort((a, b) => STATES.findIndex((s) => s.id === a.id) - STATES.findIndex((s) => s.id === b.id));
writeFileSync(resultsFile, JSON.stringify(merged, null, 2));
writeIndex(merged);
console.log(`[design-compare] bitti — ${fresh.length} durum → .design-shots/musteri-web-v1/index.html`);
