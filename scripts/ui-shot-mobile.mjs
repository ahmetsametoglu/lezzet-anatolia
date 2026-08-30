#!/usr/bin/env node
/**
 * `pnpm ui:shot:mobile [<yol> …]` — NATİVE UYGULAMA için göz (web'deki `ui:shot`un kardeşi;
 * ad BİLEREK "mobile": müşteri web'inin cihaz forku `mobile-web`dir, bu araç native uygulamayı
 * çeker — CLAUDE §2 iki-"mobil" ayrımı).
 *
 * İKİ KOL: **fiziksel Android cihaz** (`adb`) ve **iOS simülatörü** (`simctl`). İkisi de çalışan
 * dev-client'ı yakalar, derleme yapmaz:
 *   - yol verilirse önce derin bağlantıyla oraya gider (`lezzetanatolia://<yol>` — expo-router
 *     yolu rotaya çevirir), kısa bir yerleşme beklemesi sonrası çeker
 *   - yol verilmezse ekranda O AN ne varsa onu çeker (`current/` slug'ı)
 *   - çıktı: `.ui-shots-mobile/<slug>/native-app.png` + yanında `device.txt` — web'inkinden AYRI
 *     klasör (kullanıcı kararı 07.08, doc 21: web'in `.ui-shots/`'u her çekimde slug klasörünü
 *     topluca siler, paylaşılsa native görüntüleri sessizce yutardı). Maestro çıktıları da buraya.
 *
 * `device.txt` NİÇİN VAR: iki kol aynı dosya adına yazıyor ve görüntüye bakan ajan hangi cihazın
 * çekildiğini dosyadan okuyamıyordu — konsol söylüyordu, dosya söylemiyordu. Bir gün 360 dp
 * Android karesiyle 393 dp simülatör karesi karışır ve "tasarımdan farklı" diye yazılan şey
 * viewport farkı olurdu.
 *
 * KOL SEÇİMİ ÖLÇÜLÜR, VARSAYILMAZ: `UI_SHOT_PLATFORM=android|ios` verilmişse o; verilmemişse
 * bağlı Android cihazı VARSA o tercih edilir (v3 geçişinde doğrulama fiziksel cihazda yapılıyor —
 * `docs/uygulama/gunluk-operasyon-v3-gecisi.md` yetki bölümü), yoksa açık simülatöre düşülür.
 * Seçim her koşuda konsola yazılır.
 *
 * Konsol dökümü YOK: native istemcinin log altyapısı henüz kurulmadı (01-teknoloji §9 açık
 * sorusu); araç Kademe 1 "göz"dür, assertion değil — hiçbir şeyi kırmaz.
 *
 * Ön şartların hepsi ÖLÇÜLÜR, eksikse net mesajla çıkar:
 *   cihaz/simülatör var mı → uygulama kurulu mu → (yol verildiyse) Metro ayakta mı.
 * Dev server'ı (Metro) KULLANICI yönetir (CLAUDE §4) — kapalıysa araç başlatmaz. Metro kapısı
 * yalnız DERİN BAĞLANTI kipinde: rotaya gitmek çalışan JS ister; dev-client Metro'suz başlatıcı
 * ekranında kalır ve "rota görüntüsü" diye o okunurdu. Argümansız kip ise tanımı gereği dürüst —
 * ekranda ne varsa onu çeker, başlatıcıysa başlatıcı görünür.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const SCHEME = 'lezzetanatolia';
const BUNDLE_ID = 'com.lezzetanatolia.app';
const METRO = process.env.UI_SHOT_METRO ?? 'http://localhost:8081';
// Derin bağlantı sonrası yerleşme payı: navigasyon + veri çekimi. Parametrik (CLAUDE §4).
const WAIT_MS = Number(process.env.UI_SHOT_WAIT_MS ?? 2000);
// Paket tazelendikten sonra ilk çizime kadar geçen süre (ölçüldü 30.08: ~8 sn). Parametrik.
const RELOAD_MS = Number(process.env.UI_SHOT_RELOAD_MS ?? 9000);
const OUT = join(import.meta.dirname, '..', '.ui-shots-mobile');

const simctl = (args, opts = {}) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', ...opts });
const adb = (args, opts = {}) => execFileSync('adb', args, { encoding: 'utf8', ...opts });

/**
 * Bağlı Android cihazları — seri numarasıyla.
 *
 * SERİ ZORUNLU, VARSAYILMAZ: aynı telefon USB ve kablosuz TLS ile **iki kez** listeleniyor
 * (ölçüldü 28.08 ve 30.08: `5cf6c351` + `adb-5cf6c351-…_adb-tls-connect._tcp`) ve serisiz her
 * komut `more than one device/emulator` ile düşüyor. TLS ikizi elenir: kablosuz giriş USB
 * serisini kendi adının içinde taşıyor, yani aynı cihaz — ikisini iki cihaz saymak, "birden çok
 * cihaz var, ilkini seçtim" diye yanlış bir uyarı bastırırdı.
 */
function androidDevices() {
  let raw;
  try {
    raw = adb(['devices'], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return []; // adb yok ya da sunucu kalkmadı — Android kolu yoktur, hata değil
  }
  const serials = raw
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([serial]) => serial);
  const usb = serials.filter((s) => !s.startsWith('adb-'));
  return usb.length > 0 ? usb : serials;
}

function bootedSimulators() {
  try {
    const { devices } = JSON.parse(simctl(['list', 'devices', 'booted', '-j'], { stdio: ['ignore', 'pipe', 'ignore'] }));
    return Object.values(devices).flat().filter((d) => d.state === 'Booted');
  } catch {
    return []; // Xcode araçları yok — iOS kolu yoktur
  }
}

/** Seçilen kol: `{ platform, label, open(path), capture(file) }`. */
function resolveTarget() {
  const forced = process.env.UI_SHOT_PLATFORM;
  const serials = forced === 'ios' ? [] : androidDevices();
  const booted = forced === 'android' ? [] : bootedSimulators();

  if (serials.length > 0) {
    const serial = process.env.ANDROID_SERIAL ?? serials[0];
    if (serials.length > 1 && process.env.ANDROID_SERIAL === undefined) {
      console.log(`[ui-shot-mobile] ${serials.length} Android cihazı bağlı; ilki kullanılıyor: ${serial} (ANDROID_SERIAL ile seçin)`);
    }
    // Uygulama kurulu mu? Kurulu değilse çekim başlatıcı ekranını "rota" diye okuturdu.
    const installed = adb(['-s', serial, 'shell', 'pm', 'list', 'packages', BUNDLE_ID], { stdio: ['ignore', 'pipe', 'ignore'] });
    if (!installed.includes(BUNDLE_ID)) {
      console.error(`[ui-shot-mobile] ${BUNDLE_ID} ${serial} cihazında kurulu değil — pnpm mobile:rebuild:android ile derleyin.`);
      process.exit(1);
    }
    const model = adb(['-s', serial, 'shell', 'getprop', 'ro.product.model'], { stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return {
      platform: 'android',
      label: `${model} (${serial})`,
      open: (path) => adb(['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `${SCHEME}://${path}`], { stdio: ['ignore', 'pipe', 'ignore'] }),
      /* React Native'in kendi tazeleme yayını — dev-client paketi Metro'dan yeniden indirir.
         Ölçüldü 30.08: bayat paket yüzünden dört rota üst üste kırmızı hata ekranı verdi
         (`operationsTheme doesn't exist`), kod ise HEAD'de temizdi; tazeleyince dördü de açıldı.
         Yani tazelemeyen bir çekim, düzeltilmiş bir ekranı "hâlâ bozuk" diye raporlayabilir. */
      reload: () => adb(['-s', serial, 'shell', 'am', 'broadcast', '-a', `${BUNDLE_ID}.RELOAD_APP`], { stdio: ['ignore', 'pipe', 'ignore'] }),
      /* "Bu kare istenen ekran mı?" — ÇEKİM BAŞARILI GÖRÜNÜP YANLIŞ EKRAN VERİYORDU (30.08, üç kez):
         dev-client'ın kırmızı hata ekranı, Metro derleme hatası ve başlatıcı ekranı da düzgün bir
         PNG üretiyor ve araç `✓` basıyor. 25.08'de web tarafında aynı arıza yaşanmıştı ("görüntüye
         bakmadan 'çektim' diyen ajan, hiç görmediği bir sayfayı doğrulanmış sayar").
         Sınama ucuz ve dolaylı: operasyon ekranlarının üst şeridi TASARIMIN KREMİ (ölçüldü:
         242,240,232 = #F2F0E8). Hata ekranında orası kırmızı bant, başlatıcıda beyaz. Ham
         `screencap` 16 baytlık başlık + RGBA veriyor, yani PNG çözmeye gerek yok. */
      looksWrong: () => {
        try {
          const raw = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap'], { maxBuffer: 64 * 1024 * 1024 });
          const width = raw.readUInt32LE(0);
          const i = 16 + (140 * width + Math.floor(width / 2)) * 4; // durum çubuğunun hemen altı, orta
          const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
          const kremMi = Math.abs(r - 242) < 14 && Math.abs(g - 240) < 14 && Math.abs(b - 232) < 14;
          return kremMi ? null : `üst şerit ${r},${g},${b} — operasyon kremi (242,240,232) değil`;
        } catch {
          return null; // sınama yapılamadıysa susmak doğru: araç göz, bekçi değil
        }
      },
      /* `exec-out` ikili akışı bozmadan verir (`shell` CRLF'e çevirir ve PNG bozulur). */
      capture: (file) => writeFileSync(file, execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 })),
    };
  }

  if (booted.length > 0) {
    const device = booted[0];
    if (booted.length > 1) console.log(`[ui-shot-mobile] ${booted.length} açık simülatör var; ilki kullanılıyor: ${device.name}`);
    try {
      simctl(['get_app_container', device.udid, BUNDLE_ID], { stdio: 'pipe' });
    } catch {
      console.error(`[ui-shot-mobile] ${BUNDLE_ID} bu simülatörde kurulu değil — pnpm mobile:rebuild:ios ile derleyin.`);
      process.exit(1);
    }
    return {
      platform: 'ios',
      label: device.name,
      // openurl uygulamayı öne de getirir; ayrı bir `launch` gerekmez.
      open: (path) => simctl(['openurl', device.udid, `${SCHEME}:/${path}`]),
      capture: (file) => simctl(['io', device.udid, 'screenshot', file], { stdio: 'pipe' }),
      reload: null, // simülatörde karşılığı yok; `--reload` istenirse söylenip atlanır
      looksWrong: () => null, // ham piksel okuma simctl'de yok; sınama Android kolunda
    };
  }

  console.error(
    forced === undefined
      ? '[ui-shot-mobile] ne bağlı Android cihazı ne açık iOS simülatörü var — cihazı bağlayın ya da simülatörü açın (dev server sizde: pnpm --filter @lezzet/mobile ios).'
      : `[ui-shot-mobile] UI_SHOT_PLATFORM=${forced} istendi ama o kolda cihaz yok.`,
  );
  process.exit(1);
}

const slugOf = (p) => p.replaceAll('/', '_').replace(/^_+|_+$/g, '') || 'root';
const paths = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const target = resolveTarget();
console.log(`[ui-shot-mobile] kol: ${target.platform} · ${target.label}`);

// Metro ayakta mı? — yalnız derin bağlantı kipinde şart (başlıktaki gerekçe).
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
    target.open(path.startsWith('/') ? path : `/${path}`);
    await sleep(WAIT_MS);
  }
  target.capture(file);
  const suphe = target.looksWrong();
  writeFileSync(
    join(dir, 'device.txt'),
    `${target.platform} · ${target.label}\nyol: ${path ?? '(ekrandaki)'}\n${suphe === null ? '' : `UYARI: beklenen ekran olmayabilir — ${suphe}\n`}`,
  );
  console.log(`  ${suphe === null ? '✓' : '⚠'} ${path ?? '(ekrandaki)'} → ${slug}/native-app.png`);
  if (suphe !== null) console.log(`     ${suphe} — hata ekranı / başlatıcı / yanlış rota olabilir, KAREYE BAKIN`);
}

/* `--reload`: çekimlerden ÖNCE bir kez tazele (her kare için değil — bir tazeleme turun tamamını
   kapsar ve her seferinde 9 saniye beklemek turu boşuna uzatırdı). */
if (process.argv.includes('--reload')) {
  if (target.reload === null) {
    console.log('[ui-shot-mobile] --reload iOS kolunda yok, atlandı.');
  } else {
    target.reload();
    console.log(`[ui-shot-mobile] paket tazelendi, ${RELOAD_MS / 1000} sn bekleniyor…`);
    await sleep(RELOAD_MS);
  }
}

if (paths.length === 0) await shoot(null);
for (const path of paths) await shoot(path);
console.log(`[ui-shot-mobile] bitti — görüntüler: .ui-shots-mobile/ (cihaz: ${target.label})`);
