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

/** `next-server` sürecini ve onu doğuran `next dev` sarmalayıcısını bulur. */
function findDev() {
  const out = execSync('ps -eo pid,ppid,rss,etime,command', { encoding: 'utf8' });
  const rows = out.split('\n').slice(1);
  const server = rows.find((r) => r.includes('next-server') && !r.includes('grep'));
  if (!server) return null;
  const [pid, ppid, rss, etime] = server.trim().split(/\s+/);
  return { pid: Number(pid), ppid: Number(ppid), rssMb: Math.round(Number(rss) / 1024), etime };
}

const apply = process.argv.includes('--apply');
const dev = findDev();

if (!dev) {
  console.log('· dev server çalışmıyor — yapacak bir şey yok.');
  process.exit(0);
}

const over = dev.rssMb > THRESHOLD_MB;
console.log(`· next-server pid ${dev.pid} · ${dev.rssMb} MB · ${dev.etime} ayakta (eşik ${THRESHOLD_MB} MB)`);

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
