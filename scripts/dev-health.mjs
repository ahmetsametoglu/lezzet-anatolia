#!/usr/bin/env node
/**
 * Dev server sağlık kapısı — `pnpm dev:health` (kullanıcı kararı 09.08).
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Next dev server, dokunulan her rotayı derleyip belleğinde tutuyor. Uzun oturumlarda bu birikim
 * gigabaytlara çıkıyor (ÖLÇÜLDÜ 09.08: 37 dakikalık bir oturumda **3,2 GB**; tek bir e2e dosyası
 * koşarken 600 MB → 1284 MB). Şikâyet "testler RAM yiyor" diye geliyor ama ölçüm başka söylüyor:
 * Chromium en çok tüketen ilk altı sürecin içinde bile değil — yükü derleme birikimi yapıyor.
 *
 * Çare basit ve bilinen: dev server'ı ara ara yeniden başlatmak. Bu script o kararı ölçüye bağlar —
 * "bugün ağır hissettim" yerine "RSS eşiği aştı".
 *
 * ── KİM ÇALIŞTIRIR ───────────────────────────────────────────────────────────
 * **Yalnız DENETİM şeridi** (kullanıcı kararı): üç ajan aynı dev server'ı paylaşıyor ve ikisi
 * birden yeniden başlatırsa ortada, kimsenin beklemediği bir kesinti doğar. Öteki şeritler için
 * kural değişmedi — dev server'a DOKUNMAZLAR (`CLAUDE.md §4`).
 *
 * ── NEDEN `nohup` ────────────────────────────────────────────────────────────
 * Yeniden başlatılan süreç, onu başlatan ajan oturumundan BAĞIMSIZ yaşamalı: oturum kapanınca
 * kullanıcının dev server'ı da ölseydi, "yardım" kullanıcının işini bölerdi. Çıktı log dosyasına
 * gider (`.test-results/dev-server.log`) — kullanıcının terminalinde artık görünmeyeceği için
 * bakılacak yer o.
 */
import { execSync, spawn } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Eşik: bu değerin üstünde yeniden başlatma ÖNERİLİR. 2 GB — ölçülen 3,2 GB'ın belirgin altında,
 *  taze bir sunucunun (~600 MB) belirgin üstünde: normal çalışmayı kesmez, birikimi yakalar. */
const THRESHOLD_MB = Number(process.env.DEV_RSS_LIMIT_MB ?? 2048);
const ROOT = resolve(import.meta.dirname, '..');
const LOG = resolve(ROOT, '.test-results/dev-server.log');

/** Dev server'ın portu — paralel production kopyası 3001'de (`prod:web:start`). */
const DEV_PORT = Number(process.env.DEV_PORT ?? 3000);

/**
 * Dev server sürecini **PORTUNDAN** bulur, adından değil.
 *
 * ── NEDEN PORT (düzeltme 21.08, ölçüldü) ─────────────────────────────────────
 * Eskiden `ps` çıktısındaki İLK `next-server` satırı alınıyordu. O gün doğruydu: ortada tek bir
 * Next süreci vardı. **14.08'de paralel production sunucusu gelince yanlışa döndü** ve kimse fark
 * etmedi, çünkü script yine bir sayı basıyordu — yanlış sürecin sayısını.
 *
 * ÖLÇÜLDÜ (21.08): iki `next-server` ayaktayken script 3001'deki PRODUCTION sunucusunu seçip
 * **108 MB** yazdı; gerçek dev server (3000) o sırada **548 MB**'daydı. İki sonucu vardı ve
 * ikincisi daha ağır: *(1)* eşik pratikte hiç tetiklenemezdi — production kopyası donmuş bir
 * derlemedir, dokunulan rotayı derleyip biriktirmez, yani 2 GB'a hiç çıkmaz; script "temiz" diyerek
 * susardı. *(2)* `--apply` tetikleseydi **yanlış sunucuyu** durdururdu: production kopyası ölür,
 * yerine bir dev server açılır ve 3001 sessizce kapanırdı.
 *
 * Belirti yoktu, çünkü ölçüm aracının kendisi bozulmuştu — ölçtüğünü sandığı şeyi ölçmüyordu.
 *
 * **Port ADDAN daha sağlam bir kimlik:** iki süreç de `next-server` diye görünür ve komut satırları
 * ayırt etmeye yetmez, ama biri 3000'i öteki 3001'i dinler. Kaç Next süreci olursa olsun kural
 * değişmez. `-sTCP:LISTEN` şart: filtresiz `lsof` porta BAĞLANMIŞ olanları da döndürür (ölçüldü —
 * açık bir tarayıcı sekmesi Chrome sürecini listeye sokuyordu).
 */
function findDev() {
  let pid;
  try {
    // `-t` yalnız pid basar; `-sTCP:LISTEN` dinleyeni bağlananlardan ayırır.
    pid = execSync(`lsof -nP -iTCP:${DEV_PORT} -sTCP:LISTEN -t`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split('\n')[0];
  } catch {
    // `lsof` hiçbir şey bulamayınca 1 ile çıkar — port boş demektir, arıza değil.
    return null;
  }
  if (!pid) return null;
  const row = execSync(`ps -o pid,ppid,rss,etime,command -p ${pid}`, { encoding: 'utf8' }).split('\n')[1];
  if (!row) return null;
  const [foundPid, ppid, rss, etime, ...cmd] = row.trim().split(/\s+/);
  /* Portu dinleyen şey bir Next süreci mi — değilse dokunmayız. Başka bir uygulama 3000'i tutmuş
     olabilir ve onu "dev server sandık" diye öldürmek, aracın düzeltmeye çalıştığı hatanın daha
     kötü bir sürümü olurdu. */
  if (!cmd.join(' ').includes('next')) {
    console.log(`· ${DEV_PORT} portunu Next olmayan bir süreç tutuyor (pid ${foundPid}) — dokunulmadı.`);
    return null;
  }
  return { pid: Number(foundPid), ppid: Number(ppid), rssMb: Math.round(Number(rss) / 1024), etime };
}

const apply = process.argv.includes('--apply');
const dev = findDev();

if (!dev) {
  console.log(`· dev server ${DEV_PORT} portunda çalışmıyor — yapacak bir şey yok.`);
  process.exit(0);
}

const over = dev.rssMb > THRESHOLD_MB;
console.log(`· dev server (:${DEV_PORT}) pid ${dev.pid} · ${dev.rssMb} MB · ${dev.etime} ayakta (eşik ${THRESHOLD_MB} MB)`);

if (!over) {
  console.log('✓ eşiğin altında — yeniden başlatma gerekmiyor.');
  process.exit(0);
}

console.log(`⚠ eşik aşıldı (${dev.rssMb} MB).`);
if (!apply) {
  console.log('Kuru koşu. Yeniden başlatmak için: pnpm dev:health --apply');
  process.exit(0);
}

// Sıra: önce sarmalayıcıyı (pnpm/next dev), sonra sunucuyu — tersi olursa sarmalayıcı ölen çocuğu
// yeniden doğurur ve iki sunucu yarışır.
for (const pid of [dev.ppid, dev.pid]) {
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`  · ${pid} durduruldu`);
  } catch {
    // Zaten ölmüş olabilir (sarmalayıcı çocuğunu da götürür) — sorun değil.
  }
}

mkdirSync(resolve(ROOT, '.test-results'), { recursive: true });
const log = openSync(LOG, 'a');
// `detached` + `unref`: süreç bu script'ten ve onu çağıran ajan oturumundan bağımsız yaşar.
const child = spawn('pnpm', ['--filter', '@lezzet/web', 'run', 'dev'], {
  cwd: ROOT,
  detached: true,
  stdio: ['ignore', log, log],
});
child.unref();

console.log(`✓ dev server yeniden başlatıldı (pid ${child.pid}) — çıktı: ${LOG}`);
console.log('  İlk istek rotaları yeniden derleyecek; birkaç saniye yavaş olması normaldir.');
