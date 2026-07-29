#!/usr/bin/env node
/**
 * Yerel veritabanına vuran testleri **tek sıraya** sokar.
 *
 * Üç ajan aynı çalışma ağacını ve aynı yerel Supabase'i paylaşıyor. Aynı anda koşan iki entegrasyon
 * paketi birbirinin satırlarını ve paylaşılan `settings` kayıtlarını ezer; ortaya çıkan şey "hata"
 * değil, **tekrarlanmayan bir düşüş** olur — ve yalancı bir düşüş, yavaş bir koşudan pahalıdır:
 * kimse olmayan bir hatayı teşhis etmeye vakit ayırmamalı (29.07'de tam olarak bu oldu).
 *
 * Beklemek çakışmaktan ucuzdur. Kilit **kuyruk kurar, iş reddetmez**.
 *
 * `flock` macOS'ta yok; `mkdir` her POSIX sisteminde atomiktir ve yeter.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCK = join(tmpdir(), 'lezzet-anatolia-test.lock');
/** Kilit sahibi çökmüş olabilir (Ctrl-C, kill -9): bu yaştan sonra kilit devralınır. */
const STALE_MS = 15 * 60 * 1000;
const POLL_MS = 2000;

function heldBy() {
  try {
    return JSON.parse(readFileSync(join(LOCK, 'owner.json'), 'utf8'));
  } catch {
    return null;
  }
}

function acquire() {
  for (;;) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, 'owner.json'), JSON.stringify({ pid: process.pid, at: Date.now() }));
      return;
    } catch {
      const owner = heldBy();
      // Sahibi yaşıyor mu — ölü bir sürecin kilidi ertesi gün de kimseyi bekletmemeli.
      const dead = owner?.pid ? !isAlive(owner.pid) : true;
      const stale = !owner || Date.now() - owner.at > STALE_MS;
      if (dead || stale) {
        console.warn(`[test-lock] sahipsiz kilit devralınıyor (pid ${owner?.pid ?? '?'})`);
        rmSync(LOCK, { recursive: true, force: true });
        continue;
      }
      console.warn(`[test-lock] başka bir koşu sürüyor (pid ${owner.pid}); sıradayım…`);
      execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${POLL_MS})`]);
    }
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const release = () => rmSync(LOCK, { recursive: true, force: true });

acquire();
process.on('exit', release);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    release();
    process.exit(1);
  });
}

const [command, ...args] = process.argv.slice(2);
try {
  execFileSync(command, args, { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status ?? 1);
}
