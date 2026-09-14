#!/usr/bin/env node
/*
  CİHAZ KÖPRÜSÜ — "telefon çalışma ortamıma erişebiliyor mu?"

  Uygulama cihazda koşarken Metro'ya (8081), mobil API'ye (3002) ve Supabase'e (54321)
  `localhost` üzerinden bağlanır. Telefonun kendi `localhost`u Mac değildir; arayı `adb reverse`
  tünelleri kurar. Tüneller KALICI DEĞİLDİR: cihaz çıkarılıp takılınca, `adb` yeniden başlayınca
  ya da uyku sonrası düşerler — ve düştüklerinde uygulama "sunucu yok" demez, boş ekran ya da
  sonsuz yükleniyor gösterir. Teşhisi pahalı olan sessiz bir arıza.

  Bu yüzden araç iki şey yapar ve İKİNCİSİ asıl işidir:
    1. üç tüneli kurar (varsa yeniden kurmak zararsızdır),
    2. cihazın İÇİNDEN üç adrese gerçekten ulaşılabildiğini ÖLÇER.

  Ölçüm olmadan "tünel kuruldu" bir iddiadır: `adb reverse` sunucu ayakta değilken de başarıyla
  döner. Ölçüm de yanılmasın diye HTTP kodu okunur — 200 de 404 de "ulaştım" demektir (404 =
  sunucu cevap verdi, o yolu tanımadı); ulaşamama `000`dır.

  ADRESLER ÇOK OLABİLİR: bir cihaz hem USB hem kablosuz görünüyorsa `adb` "more than one device"
  diye reddeder ve komut hiç koşmaz. Araç bu yüzden hedefi kendisi seçer — USB'yi tercih eder,
  çünkü tüneller taşıyıcıya bağlıdır ve USB uyku sonrası daha kararlıdır.

  Kullanım:  pnpm mobile:device
*/

import { execFileSync } from 'node:child_process';

/** Tünellenen portlar — hangisi neden gerekli. */
const PORTS = [
  { port: 8081, ad: 'Metro (JS paketi)' },
  { port: 3002, ad: 'mobil API (/api/v1)' },
  { port: 54321, ad: 'Supabase (auth + veri)' },
];

function adb(args, opts = {}) {
  return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

/** Bağlı cihazları okur; kablosuz kopyaları ayırt edebilmek için ham satırları döner. */
function cihazlar() {
  const out = adb(['devices', '-l']);
  return out
    .split('\n')
    .slice(1)
    .map((satir) => satir.trim())
    .filter((satir) => satir.length > 0 && satir.includes('device '))
    .map((satir) => ({ seri: satir.split(/\s+/)[0], usb: satir.includes('usb:'), ham: satir }));
}

function hedefSec(liste) {
  if (liste.length === 0) return null;
  // USB önce: tüneller taşıyıcıya bağlı ve USB uyku sonrası daha kararlı.
  return liste.find((c) => c.usb) ?? liste[0];
}

/** Cihazın İÇİNDEN adrese vurur; dönen HTTP kodu, ulaşılamazsa `000`. */
function olc(seri, port) {
  try {
    const out = adb(['-s', seri, 'shell', 'curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '5', `http://localhost:${port}/`]);
    return out.trim() || '000';
  } catch {
    return '000';
  }
}

function main() {
  let liste;
  try {
    liste = cihazlar();
  } catch (err) {
    process.stderr.write(`mobile:device: adb çalıştırılamadı — Android platform-tools kurulu mu?\n  ${err.message}\n`);
    process.exit(1);
  }

  const hedef = hedefSec(liste);
  if (hedef === null) {
    process.stderr.write('mobile:device: bağlı cihaz yok. Telefonu USB ile bağla ve USB hata ayıklamayı aç.\n');
    process.exit(1);
  }

  if (liste.length > 1) {
    process.stdout.write(`  not: ${liste.length} adres görünüyor (USB + kablosuz olabilir) — seçilen: ${hedef.seri}\n`);
  }
  process.stdout.write(`cihaz: ${hedef.seri}${hedef.usb ? ' (USB)' : ''}\n`);

  for (const { port } of PORTS) {
    try {
      adb(['-s', hedef.seri, 'reverse', `tcp:${port}`, `tcp:${port}`]);
    } catch (err) {
      process.stderr.write(`  tünel kurulamadı: ${port} — ${err.message}\n`);
    }
  }

  let eksik = 0;
  for (const { port, ad } of PORTS) {
    const kod = olc(hedef.seri, port);
    const ulasti = kod !== '000';
    if (!ulasti) eksik += 1;
    process.stdout.write(`  ${ulasti ? '✓' : '✗'} ${String(port).padEnd(5)} ${ad} → HTTP ${kod}\n`);
  }

  if (eksik > 0) {
    process.stderr.write(
      `\nmobile:device: ${eksik} adrese ulaşılamadı. Tünel kuruldu ama karşı tarafta sunucu yoksa sonuç budur —\n` +
        'Metro (pnpm --filter mobile start), mobil API (pnpm --filter mobile-api dev) ve Supabase ayakta mı?\n',
    );
    process.exit(1);
  }
  process.stdout.write('\nüçü de ulaşılabilir — cihaz çalışma ortamına bağlı.\n');
}

main();
