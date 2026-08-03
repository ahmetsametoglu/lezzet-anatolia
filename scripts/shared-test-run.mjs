#!/usr/bin/env node
/**
 * Tam test paketinin **tek uçuşlu** koşucusu (kullanıcı kararı 03.08).
 *
 * Üç ajan aynı ağacı ve aynı yerel Supabase'i paylaşıyor; üçü de iş bitiminde aynı paketi
 * koşturuyordu — üç koşu, aynı soru, çakışan satırlar. Kural artık şu:
 *
 *   - Koşu YOKKEN tetikleyen koşuyu BAŞLATIR (önceki sonuç klasörü silinir).
 *   - Koşu SÜRERKEN tetikleyen yenisini başlatMAZ: süren koşuya katılır, bitişini bekler ve
 *     AYNI sonucu okur (single-flight). Çıkış kodu da o koşunun kodudur.
 *   - Sonuç herkes için tek yerden okunur: `.test-results/latest.json` (özet) + `run.log` (tam
 *     çıktı). `pnpm test:status` son durumu koşturmadan basar.
 *
 * Katılan ajan için ölçü `startedAt`tir: koşu senin değişikliğinden ÖNCE başladıysa sonuç senin
 * kodunu içermez — bitince bir kez daha tetikle (bu sefer koşucu sensin).
 *
 * Kilit `with-test-lock.mjs` ile AYNI dizindir: eski kuyruk kullanıcıları (ör. ölçüm koşuları)
 * ve bu koşucu birbirini görür, DB'ye aynı anda iki paket vurmaz.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const LOCK = join(tmpdir(), 'lezzet-anatolia-test.lock');
const RESULTS = join(ROOT, '.test-results');
const LATEST = join(RESULTS, 'latest.json');
const LOG = join(RESULTS, 'run.log');
const VITEST_JSON = join(RESULTS, 'vitest.json');
/** Kilit sahibi çökmüş olabilir (Ctrl-C, kill -9): bu yaştan sonra kilit devralınır. */
const STALE_MS = 15 * 60 * 1000;
const POLL_MS = 2000;

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function summaryLine(result) {
  if (!result) return 'sonuç yok (henüz hiç koşu yapılmadı ya da koşucu çöktü)';
  if (result.status === 'running') return `koşu sürüyor (pid ${result.ownerPid}, başlangıç ${result.startedAt})`;
  const t = result.tests;
  const counts = t ? `${t.passed}/${t.total} geçti${t.failed ? `, ${t.failed} DÜŞTÜ` : ''}` : 'sayım okunamadı';
  return `${result.status.toUpperCase()} — ${counts} (başlangıç ${result.startedAt}, süre ${Math.round((result.durationMs ?? 0) / 1000)}s, log: .test-results/run.log)`;
}

// ── --status: koşturmadan son durumu bas ──────────────────────────────────────
if (process.argv.includes('--status')) {
  const result = readJson(LATEST);
  console.log(summaryLine(result));
  process.exit(result?.status === 'passed' ? 0 : result?.status === 'failed' ? 1 : 2);
}

// ── Kilidi almayı dene: alan KOŞUCU olur, alamayan KATILIMCI ─────────────────
function tryAcquire() {
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, 'owner.json'), JSON.stringify({ pid: process.pid, at: Date.now() }));
      return true;
    } catch {
      const owner = readJson(join(LOCK, 'owner.json'));
      const dead = owner?.pid ? !isAlive(owner.pid) : true;
      const stale = !owner || Date.now() - owner.at > STALE_MS;
      if (dead || stale) {
        console.warn(`[test] sahipsiz kilit devralınıyor (pid ${owner?.pid ?? '?'})`);
        rmSync(LOCK, { recursive: true, force: true });
        continue;
      }
      return false; // canlı bir koşu var → katılımcı yolu
    }
  }
}

if (!tryAcquire()) {
  // KATILIMCI: yeni koşu BAŞLATMA, süreni bekle, aynı sonucu oku (single-flight).
  const running = readJson(LATEST);
  console.log(`[test] koşu zaten sürüyor — katılıyorum, sonucu bekliyorum (${running?.startedAt ?? 'başlangıç bilinmiyor'})`);
  for (;;) {
    await sleep(POLL_MS);
    const result = readJson(LATEST);
    if (result && result.status !== 'running' && !existsSync(LOCK)) {
      console.log(`[test] ${summaryLine(result)}`);
      if (result.startedAt) {
        console.log('[test] not: koşu senin değişikliğinden ÖNCE başladıysa bir kez daha tetikle.');
      }
      process.exit(result.exitCode ?? (result.status === 'passed' ? 0 : 1));
    }
    if (!existsSync(LOCK) && (!result || result.status === 'running')) {
      console.error('[test] koşucu sonuç yazmadan öldü — yeniden tetikleyin.');
      process.exit(1);
    }
  }
}

// ── KOŞUCU: önceki sonucu sil, koş, sonucu yaz, kilidi bırak ─────────────────
const release = () => rmSync(LOCK, { recursive: true, force: true });
process.on('exit', release);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    try {
      writeFileSync(LATEST, JSON.stringify({ ...readJson(LATEST), status: 'aborted', finishedAt: new Date().toISOString() }, null, 2));
    } catch {
      // Sonuç yazılamıyorsa da kilit bırakılmalı — katılımcılar "koşucu öldü" yolundan çıkar.
    }
    release();
    process.exit(1);
  });
}

rmSync(RESULTS, { recursive: true, force: true }); // her koşu önceki veriyi siler (kullanıcı kararı)
mkdirSync(RESULTS, { recursive: true });
const startedAt = new Date().toISOString();
const startMs = Date.now();
writeFileSync(LATEST, JSON.stringify({ status: 'running', ownerPid: process.pid, startedAt }, null, 2));
console.log(`[test] koşu başladı (${startedAt}) — sonuç: .test-results/latest.json`);

const child = spawn(
  'pnpm',
  ['exec', 'vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${VITEST_JSON}`],
  { cwd: ROOT, env: process.env },
);
const log = createWriteStream(LOG);
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    process.stdout.write(chunk); // koşucunun kendi ekranı
    log.write(chunk); // katılımcıların okuyacağı ortak kopya
  });
}

child.on('close', (code) => {
  const json = readJson(VITEST_JSON);
  const tests = json
    ? { total: json.numTotalTests, passed: json.numPassedTests, failed: json.numFailedTests }
    : null;
  const result = {
    status: code === 0 ? 'passed' : 'failed',
    exitCode: code ?? 1,
    tests,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
    log: '.test-results/run.log',
  };
  log.end();
  writeFileSync(LATEST, JSON.stringify(result, null, 2));
  console.log(`[test] ${summaryLine(result)}`);
  process.exit(code ?? 1);
});
