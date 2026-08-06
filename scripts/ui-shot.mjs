#!/usr/bin/env node
/**
 * `pnpm ui:shot <yol> [<yol> …]` — ajanlara GÖZ (00.9 Kademe 1, kullanıcı kararı 03.08).
 *
 * ÇALIŞAN dev server'daki sayfayı açar (build yok, DB şartı yok) ve `.ui-shots/<slug>/` altına:
 *   - müşteri yollarında: `desktop.png` (1440×900) + `mobile.png` (iPhone 13) — cihaz forku iki yüzüyle
 *   - operasyon yollarında (`/operations…`): `desktop.png` + `desktop-dark.png` (token'lar dönüyor mu)
 *     — mobil çekim YOK: operasyon web'i masaüstü-yalnız (06.08), mobil deneyim native uygulamada
 *     (`docs/uygulama`)
 *   - `console.txt` — sayfanın konsol hataları/uyarıları + başarısız istekler (boşsa dosya yok)
 *
 * Ekran yapan şerit anlık çağırır ("nasıl görünüyor?"); tasarım/fork denetimi görüntüden okunur.
 * Görüntüler İNCELEME kaynağıdır, assertion değil — hiçbir şeyi kırmaz (00.9 Kademe 2 ayrı iş).
 *
 * Dev server'ı KULLANICI yönetir (CLAUDE §4) — kapalıysa açık mesajla çıkar, kendisi başlatmaz.
 * Operasyon sayfaları dev auth bypass'ıyla açılır (guard.ts, seed'li DEV_ADMIN kimliği).
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
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
for (const path of paths) {
  const dir = join(OUT, slugOf(path));
  rmSync(dir, { recursive: true, force: true }); // her çekim öncekini siler — bayat görüntü okunmasın
  const allLogs = [];
  allLogs.push(...(await shoot(browser, path, 'desktop', { viewport: { width: 1440, height: 900 } })));
  if (path.startsWith('/operations')) {
    // Mobil çekim yok (masaüstü-yalnız, 06.08); onun yerine karanlık mod: `data-theme` sistem
    // tercihinden türer (theme-toggle.tsx) — emülasyon yeter.
    allLogs.push(...(await shoot(browser, path, 'desktop-dark', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })));
  } else {
    allLogs.push(...(await shoot(browser, path, 'mobile', { ...devices['iPhone 13'] })));
  }
  if (allLogs.length > 0) writeFileSync(join(dir, 'console.txt'), allLogs.join('\n') + '\n');
}
await browser.close();
console.log(`[ui-shot] bitti — görüntüler: .ui-shots/`);
