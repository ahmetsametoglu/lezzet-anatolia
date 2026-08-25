#!/usr/bin/env node
/**
 * `pnpm ui:shot <yol> [<yol> …]` — ajanlara GÖZ (00.9 Kademe 1, kullanıcı kararı 03.08).
 *
 * ÇALIŞAN dev server'daki sayfayı açar (build yok, DB şartı yok) ve `.ui-shots/<slug>/` altına:
 *   - müşteri yollarında: `desktop.png` (1440×900) + `mobile-web.png` (iPhone 13) — cihaz forku iki yüzüyle
 *     (ad BİLEREK `mobile-web`: native uygulamayla karışmasın — CLAUDE §2)
 *   - operasyon yollarında (`/operations…`): `desktop.png` + `desktop-dark.png` (token'lar dönüyor mu)
 *     — mobil web çekimi YOK: operasyon web'i masaüstü-yalnız (06.08), personelin mobil deneyimi
 *     native uygulamada (`docs/uygulama`)
 *   - `console.txt` — sayfanın konsol hataları/uyarıları + başarısız istekler (boşsa dosya yok)
 *
 * Ekran yapan şerit anlık çağırır ("nasıl görünüyor?"); tasarım/fork denetimi görüntüden okunur.
 * Görüntüler İNCELEME kaynağıdır, assertion değil — hiçbir şeyi kırmaz (00.9 Kademe 2 ayrı iş).
 *
 * Dev server'ı KULLANICI yönetir (CLAUDE §4) — kapalıysa açık mesajla çıkar, kendisi başlatmaz.
 *
 * ── OPERASYON ÇEKİMİ ÖNCE GİRİŞ YAPAR (düzeltildi 25.08) ────────────────────
 * Burada *"dev auth bypass'ıyla açılır"* yazıyordu ve o bypass **19.08'de söküldü** (`guard.ts`
 * künyesi). Araç güncellenmediği için o günden beri her operasyon çekimi giriş sayfasını
 * çekiyordu — ve arıza SESSİZDİ: `page.goto` başarılı olduğu için satır `✓` basıyor, dosya
 * üretiliyor, yalnız içindeki ekran istenen ekran değil. Görüntüye bakmadan "çektim" diyen bir
 * ajan, hiç görmediği bir sayfayı doğrulanmış sayardı.
 *
 * Çözüm bypass'ı geri getirmek değil, aracı bugünkü TEK yola bağlamak: `/auth/dev-login?next=…`
 * gerçek bir oturum kurar (magic-link jetonu tüketilir), yani ekran production'da nasıl
 * davranacaksa öyle davranır. Kapı kapalıysa (`DEV_LOGIN_ENABLED` yok) çekim yine yapılır ama
 * konsol dökümüne not düşülür — sessizce giriş sayfası çekmek yerine sebebini söyler.
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
// Node'da global ama lint'in `scripts/` ortamında tanımlı değil — açıkça almak sessiz bir
// `no-undef`ten iyidir (dosya zaten `node:` önekli importlarla çalışıyor).
import { URL } from 'node:url';
// `@playwright/test` chromium/devices'ı yeniden dışa verir; pnpm'in katı node_modules'ünde
// geçişli `playwright` paketine doğrudan uzanılamaz — kapı bu.
import { chromium, devices } from '@playwright/test';

const BASE = process.env.UI_SHOT_BASE ?? 'http://localhost:3000';
const OUT = join(import.meta.dirname, '..', '.ui-shots');
const paths = process.argv.slice(2).filter((a) => !a.startsWith('-'));

if (paths.length === 0) {
  console.error('kullanım: pnpm ui:shot <yol> [<yol> …]   (ör: pnpm ui:shot /operations/stock /fr)');
  process.exit(2);
}

// Dev server ayakta mı? Kapalıysa Playwright'ın soğuk zaman aşımını beklemeden, net mesajla çık.
try {
  // 15 sn: dev server'ın İLK isteği rotayı derler ve soğukken 3 sn'yi rahat aşar (yaşandı) —
  // erken "kapalı" demek, açık bir server'ı kapalı raporlamaktı. Herhangi bir HTTP cevabı "açık" sayılır.
  await fetch(BASE, { signal: AbortSignal.timeout(15_000), redirect: 'manual' });
} catch {
  console.error(`[ui-shot] ${BASE} cevap vermiyor — dev server kapalı. Başlatması KULLANICININ (CLAUDE §4); istekten sonra yeniden deneyin.`);
  process.exit(1);
}

const slugOf = (p) => p.replaceAll('/', '_').replace(/^_+|_+$/g, '') || 'root';

/**
 * **Operasyon oturumu — BİR KEZ kurulur, tüm çekimlerde paylaşılır.**
 *
 * Her bağlamın kendi girişini yapması denendi ve KIRILDI: `/auth/dev-login` her çağrıda yeni bir
 * magic-link üretiyor, arka arkaya gelen ikinci istek **400** alıyor (ölçüldü 25.08 — aynı yolun
 * açık/karanlık çekimleri). Oturum bir kez kurulup çerezler tekrar kullanılınca hem yarış biter
 * hem çekim hızlanır: derlenmiş rota ikinci kez ısınmaz.
 *
 * `null` = kapı kapalı ya da giriş tutmadı; çağıran bunu konsol dökümüne yazar (sessizce giriş
 * sayfası çekmek, hiç görülmemiş bir ekranı doğrulanmış saydırırdı).
 */
async function operationsState(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(`${BASE}/auth/dev-login`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Kapı `next` verilmezse yöneticiyi kendi panosuna atar; oturum kurulduysa artık `/operations`tayız.
    const ok = new URL(page.url()).pathname.startsWith('/operations');
    return ok ? await context.storageState() : null;
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

/** Tek sayfanın tek varyantını çek: görüntü + konsol dökümü. */
async function shoot(browser, path, variant, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') logs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('requestfailed', (req) => logs.push(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  const dir = join(OUT, slugOf(path));
  mkdirSync(dir, { recursive: true });
  try {
    await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30_000 });
    // Guard yolu geri çevirdiyse çekim yine olur ama İÇERİĞİ yanlıştır; sessiz kalmak yerine söylenir.
    if (path.startsWith('/operations') && !new URL(page.url()).pathname.startsWith('/operations')) {
      logs.push(
        `[ui-shot] operasyon oturumu açılamadı — ${page.url()} çekildi. ` +
          '`DEV_LOGIN_ENABLED=true` ve `NEXT_PUBLIC_SITE_URL` yerel mi (auth/dev-login künyesi)?',
      );
    }
    await page.screenshot({ path: join(dir, `${variant}.png`), fullPage: true });
    console.log(`  ✓ ${path} → ${slugOf(path)}/${variant}.png${logs.length ? ` (${logs.length} konsol kaydı)` : ''}`);
  } catch (err) {
    logs.push(`[ui-shot] sayfa açılamadı: ${err.message}`);
    console.error(`  ✗ ${path} (${variant}) — ${err.message.split('\n')[0]}`);
  }
  await context.close();
  return logs.map((l) => `— ${variant} —\n${l}`);
}

const browser = await chromium.launch();
// Oturum yalnız operasyon yolu istendiyse kurulur: müşteri çekimi ziyaretçi gözüyle yapılmalı,
// giriş yapmış bir bağlamda vitrin başka bir sayfadır.
const needsAuth = paths.some((p) => p.startsWith('/operations'));
const storageState = needsAuth ? await operationsState(browser) : null;
if (needsAuth && storageState === null) {
  console.error('[ui-shot] operasyon oturumu kurulamadı — çekimler giriş sayfasını gösterecek (console.txt).');
}
const opsContext = { viewport: { width: 1440, height: 900 }, ...(storageState ? { storageState } : {}) };

for (const path of paths) {
  const dir = join(OUT, slugOf(path));
  rmSync(dir, { recursive: true, force: true }); // her çekim öncekini siler — bayat görüntü okunmasın
  const allLogs = [];
  const base = path.startsWith('/operations') ? opsContext : { viewport: { width: 1440, height: 900 } };
  allLogs.push(...(await shoot(browser, path, 'desktop', base)));
  if (path.startsWith('/operations')) {
    // Mobil web çekimi yok (masaüstü-yalnız, 06.08); onun yerine karanlık mod: `data-theme` sistem
    // tercihinden türer (theme-toggle.tsx) — emülasyon yeter.
    allLogs.push(...(await shoot(browser, path, 'desktop-dark', { ...base, colorScheme: 'dark' })));
  } else {
    allLogs.push(...(await shoot(browser, path, 'mobile-web', { ...devices['iPhone 13'] })));
  }
  if (allLogs.length > 0) writeFileSync(join(dir, 'console.txt'), allLogs.join('\n') + '\n');
}
await browser.close();
console.log(`[ui-shot] bitti — görüntüler: .ui-shots/`);
