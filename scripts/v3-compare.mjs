#!/usr/bin/env node
/*
  KARŞILAŞTIRMA ÇİFTİ ÜRETİR — cihaz karesi + tasarım karesi, ikisi de ARŞİVE.

    pnpm v3:compare <alan> <rota|-> <tasarımNo> <etiket>
    pnpm v3:compare depo /warehouse 01 hub
    pnpm v3:compare depo - 05 kalem-karti-acik      # rota yerine "-": EKRANDAKİ hâli çeker

  ── NİÇİN VAR (kullanıcı kararı 30.08) ──────────────────────────────────────
  Uyuşmazlık notu **iki görsel** demektir: cihazda ne görünüyor, tasarım ne diyor. İkisi de
  girdinin yanında DURMALI — yoksa not, gördüğünü bir daha gösteremeyen bir cümleye döner.

  Bugünkü iki kaynak da GEÇİCİ ve bu bir kusur değil, tasarımları öyle: `ui-shot-mobile.mjs` her
  çekimde slug klasörünü siliyor (bayat görüntü okunmasın diye) ve `.design-shots/` üretilen bir
  klasör. Yani bir girdiye o yolları yazmak, bir sonraki çekimde girdiyi görselsiz bırakır.

  Bu araç çifti **girdinin kendi adıyla** arşive kopyalar: `docs/uygulama/v3-gorsel/<alan>/`.
  Klasör repoya gitmez (gitignore) — kareler v3 geçişiyle birlikte doğar ve onunla ölür; kalıcı
  olan, notun içindeki ölçümdür.

  Çekimi kendisi yapmaz, `ui-shot-mobile.mjs`'yi ÇAĞIRIR — cihaz seçimi, Metro kapısı ve seri
  ayıklaması tek yerde kalsın (CLAUDE §1: duplication yok).
*/
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [alan, rota, tasarimNo, etiket] = process.argv.slice(2);
if (!alan || !rota || !tasarimNo || !etiket) {
  console.error('kullanım: pnpm v3:compare <alan> <rota|-> <tasarımNo> <etiket>');
  console.error('  örnek : pnpm v3:compare depo /warehouse 01 hub');
  process.exit(1);
}

const ROOT = join(import.meta.dirname, '..');
const DESIGN_DIR = join(ROOT, '.design-shots', 'operasyon-mobil-v3');
const ARCHIVE = join(ROOT, 'docs', 'uygulama', 'v3-gorsel', alan);

/* 1) Tasarım karesi — numaradan bulunur. Yoksa üretilir; "bulamadım" demek yerine üretmek doğru,
      çünkü klasör zaten türetilmiş bir çıktı ve kaynağı repoda duruyor. */
if (!existsSync(DESIGN_DIR)) {
  console.log('[v3-compare] tasarım kareleri yok — design-shot koşuyor…');
  execFileSync('node', [join(ROOT, 'scripts', 'design-shot.mjs')], { stdio: 'inherit' });
}
const designFile = readdirSync(DESIGN_DIR).find((f) => f.startsWith(`${tasarimNo}-`) && f.endsWith('.png'));
if (designFile === undefined) {
  console.error(`[v3-compare] ${tasarimNo} numaralı tasarım karesi yok — ${DESIGN_DIR} içine bakın.`);
  process.exit(1);
}

/* 2) Cihaz karesi — çekimi ui-shot-mobile yapar. Rota "-" ise ekrandaki hâl (`current` slug'ı):
      çekmece açık, liste kaydırılmış gibi durumlar derin bağlantıyla kurulamaz, elle kurulur. */
const slug = rota === '-' ? 'current' : rota.replaceAll('/', '_').replace(/^_+|_+$/g, '');
/* TAZELEME VARSAYILAN. Bu aracın çekimleri neredeyse hep bir DEĞİŞİKLİĞİN ardından isteniyor;
   bayat paket çekmek notun tamamını yanlış yapar (ölçüldü 30.08: HEAD temizken dört rota üst üste
   hata ekranı verdi, tazeleyince dördü de açıldı). `--no-reload`: ekranda elle kurulmuş bir durum
   varsa (açık çekmece, girilmiş adet) tazeleme onu sıfırlar — o zaman kapatılır. */
const reloadArgs = process.argv.includes('--no-reload') ? [] : ['--reload'];
execFileSync('node', [join(ROOT, 'scripts', 'ui-shot-mobile.mjs'), ...(rota === '-' ? [] : [rota]), ...reloadArgs], { stdio: 'inherit' });
const devicePng = join(ROOT, '.ui-shots-mobile', slug, 'native-app.png');
if (!existsSync(devicePng)) {
  console.error(`[v3-compare] cihaz karesi üretilemedi (${devicePng}).`);
  process.exit(1);
}

/* 3) Arşiv: ikisi aynı adı taşır, sonekleri ayırır — girdide yan yana yazılınca hangisinin ne
      olduğu dosya adından okunur. */
mkdirSync(ARCHIVE, { recursive: true });
const base = `${tasarimNo}-${etiket}`;
/* ÖNCEKİ KARE SAKLANIR (ölçüldü 30.08: bir kanıt karesi böyle kayboldu). Aynı etikete ikinci kez
   çekmek "düzeltmeden önce / sonra" demektir ve öncesi silinirse karşılaştırma tek yanlı kalır —
   üstelik ekrandaki durum bu arada değişmiş olabilir (o sefer başlamıştı) ve eski hâl bir daha
   kurulamaz. Yalnız BİR kuşak saklanır; daha fazlası arşivi çöpe çevirir. */
const cihazPng = join(ARCHIVE, `${base}-cihaz.png`);
if (existsSync(cihazPng)) copyFileSync(cihazPng, join(ARCHIVE, `${base}-cihaz-onceki.png`));
copyFileSync(devicePng, cihazPng);
copyFileSync(join(DESIGN_DIR, designFile), join(ARCHIVE, `${base}-tasarim.png`));
writeFileSync(join(ARCHIVE, `${base}.txt`), `rota: ${rota}\ntasarım: ${designFile}\n`);

const rel = `v3-gorsel/${alan}/${base}`;
console.log(`
[v3-compare] çift hazır — girdiye yapıştırın:

- **Cihaz:** [${base}-cihaz.png](${rel}-cihaz.png)
- **Tasarım:** [${base}-tasarim.png](${rel}-tasarim.png) (${designFile})
`);
