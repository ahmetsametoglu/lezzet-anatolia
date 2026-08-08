#!/usr/bin/env node
/**
 * `pnpm ui:shot:mobile [<yol> …]` — NATİVE UYGULAMA için göz (web'deki `ui:shot`un kardeşi;
 * ad BİLEREK "mobile": müşteri web'inin cihaz forku `mobile-web`dir, bu araç native uygulamayı
 * çeker — CLAUDE §2 iki-"mobil" ayrımı).
 *
 * ÇALIŞAN iOS simülatöründeki dev-client'ı yakalar (derleme yok):
 *   - yol verilirse önce derin bağlantıyla oraya gider (`lezzetanatolia://<yol>` — expo-router
 *     yolu rotaya çevirir), kısa bir yerleşme beklemesi sonrası çeker
 *   - yol verilmezse ekranda O AN ne varsa onu çeker (`current/` slug'ı)
 *   - çıktı: `.ui-shots-mobile/<slug>/native-app.png` — web'inkinden AYRI klasör (kullanıcı
 *     kararı 07.08, doc 21: web'in `.ui-shots/`'u her çekimde slug klasörünü topluca siler,
 *     paylaşılsa native görüntüleri sessizce yutardı). Maestro çıktıları da ileride buraya.
 *
 * Konsol dökümü YOK: native istemcinin log altyapısı henüz kurulmadı (01-teknoloji §9 açık
 * sorusu); araç Kademe 1 "göz"dür, assertion değil — hiçbir şeyi kırmaz.
 *
 * Ön şartların hepsi ÖLÇÜLÜR, varsayılmaz; eksikse net mesajla çıkar:
 *   simülatör açık mı → uygulama kurulu mu → (yol verildiyse) Metro ayakta mı.
 * Dev server'ı (Metro) KULLANICI yönetir (CLAUDE §4) — kapalıysa araç başlatmaz. Metro kapısı
 * yalnız DERİN BAĞLANTI kipinde: rotaya gitmek çalışan JS ister; dev-client Metro'suz başlatıcı
 * ekranında kalır ve "rota görüntüsü" diye o okunurdu. Argümansız kip ise tanımı gereği dürüst —
 * ekranda ne varsa onu çeker, başlatıcıysa başlatıcı görünür.
 *
 * Android: dev-client daha derlenmedi (21.7 kalanı); derlendiğinde bu araç `adb`li ikinci bir
 * kolla genişler — bugün iOS-yalnız olması bilinçli kapsam, eksik değil.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const SCHEME = 'lezzetanatolia';
const BUNDLE_ID = 'com.lezzetanatolia.app';
const METRO = process.env.UI_SHOT_METRO ?? 'http://localhost:8081';
// Derin bağlantı sonrası yerleşme payı: navigasyon + veri çekimi. Parametrik (CLAUDE §4).
const WAIT_MS = Number(process.env.UI_SHOT_WAIT_MS ?? 2000);
const OUT = join(import.meta.dirname, '..', '.ui-shots-mobile');

const simctl = (args, opts = {}) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', ...opts });

// 1) Açık simülatör — birden çoksa İLKİ alınır ve söylenir (sessiz seçim, yanlış cihazın
//    görüntüsünü "doğru" diye okutur).
const { devices } = JSON.parse(simctl(['list', 'devices', 'booted', '-j']));
const booted = Object.values(devices).flat().filter((d) => d.state === 'Booted');
if (booted.length === 0) {
  console.error('[ui-shot-mobile] açık iOS simülatörü yok — önce uygulamayı başlatın (dev server sizde: pnpm --filter @lezzet/mobile ios).');
  process.exit(1);
}
const device = booted[0];
if (booted.length > 1) console.log(`[ui-shot-mobile] ${booted.length} açık simülatör var; ilki kullanılıyor: ${device.name}`);

// 2) Uygulama kurulu mu? (`get_app_container` kurulu değilse hata verir)
try {
  simctl(['get_app_container', device.udid, BUNDLE_ID], { stdio: 'pipe' });
} catch {
  console.error(`[ui-shot-mobile] ${BUNDLE_ID} bu simülatörde kurulu değil — pnpm mobile:rebuild:ios ile derleyin.`);
  process.exit(1);
}

const slugOf = (p) => p.replaceAll('/', '_').replace(/^_+|_+$/g, '') || 'root';
const paths = process.argv.slice(2).filter((a) => !a.startsWith('-'));

// 3) Metro ayakta mı? — yalnız derin bağlantı kipinde şart (başlıktaki gerekçe).
if (paths.length > 0) {
  try {
    await fetch(`${METRO}/status`, { signal: AbortSignal.timeout(3_000) });
  } catch {
    console.error(`[ui-shot-mobile] ${METRO} cevap vermiyor — dev server (Metro) kapalı. Başlatması KULLANICININ (CLAUDE §4); istekten sonra yeniden deneyin.`);
    process.exit(1);
  }
}

/** Tek çekim: (varsa) derin bağlantı + görüntü. */
async function shoot(path) {
  const slug = path === null ? 'current' : slugOf(path);
  const dir = join(OUT, slug);
  rmSync(dir, { recursive: true, force: true }); // her çekim öncekini siler — bayat görüntü okunmasın
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'native-app.png');
  if (path !== null) {
    // openurl uygulamayı öne de getirir; ayrı bir `launch` gerekmez.
    simctl(['openurl', device.udid, `${SCHEME}:/${path.startsWith('/') ? path : `/${path}`}`]);
    await sleep(WAIT_MS);
  }
  simctl(['io', device.udid, 'screenshot', file], { stdio: 'pipe' });
  console.log(`  ✓ ${path ?? '(ekrandaki)'} → ${slug}/native-app.png`);
}

if (paths.length === 0) await shoot(null);
for (const path of paths) await shoot(path);
console.log(`[ui-shot-mobile] bitti — görüntüler: .ui-shots-mobile/ (cihaz: ${device.name})`);
