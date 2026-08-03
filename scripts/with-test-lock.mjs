#!/usr/bin/env node
/**
 * Yerel veritabanına vuran işleri **tek sıraya** sokar.
 *
 * Üç ajan aynı çalışma ağacını ve aynı yerel Supabase'i paylaşıyor. Aynı anda koşan iki entegrasyon
 * paketi birbirinin satırlarını ve paylaşılan `settings` kayıtlarını ezer; ortaya çıkan şey "hata"
 * değil, **tekrarlanmayan bir düşüş** olur — ve yalancı bir düşüş, yavaş bir koşudan pahalıdır:
 * kimse olmayan bir hatayı teşhis etmeye vakit ayırmamalı (29.07'de tam olarak bu oldu).
 *
 * **Kuyruk artık DDL'i de kapsıyor** (besleme şeridinin notu, 03.08). Koşuların çakışması çözülmüştü
 * ama koşu SÜRERKEN şema değişmesi çözülmemişti: `db:reset` ortasında PostgREST'in şema önbelleği
 * düşüyor ve paket `Could not find the table 'public.account' in the schema cache` diye 13 dosyada
 * birden kırmızıya dönüyordu — kod hatası değil, altyapı. Ölçüldü: 156 test hiç koşamadan kesildi.
 * `db:reset` KULLANICININ kararıdır ve öyle kalıyor; değişen tek şey, sürmekte olan bir koşunun
 * bitmesini beklemesi. Reset'in 90 saniye gecikmesi, yalancı bir kırmızı paketin teşhisinden ucuz.
 *
 * Sahibin `kind`'ı yazılır (`test` | `ddl`) çünkü `shared-test-run.mjs` ikisini AYIRMAK ZORUNDA:
 * kilidi bir DDL tutuyorken "süren koşuya katıl" yolu bir öncekinin sonucunu yeni sanardı.
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
/** `--kind=ddl` ilk argüman olarak verilir; verilmezse iş bir test koşusudur. */
const KIND_ARG = process.argv[2]?.startsWith('--kind=') ? process.argv[2].slice('--kind='.length) : null;
const KIND = KIND_ARG ?? 'test';
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
      writeFileSync(join(LOCK, 'owner.json'), JSON.stringify({ pid: process.pid, at: Date.now(), kind: KIND }));
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
      // Mesaj iki okuru da hedefliyor: sıraya giren bir test koşusu da, `db:reset` bekleyen
      // KULLANICI da bunu görüyor. "Takıldı mı" diye düşünmesin diye ne beklendiği yazılı.
      console.warn(
        `[test-lock] DB'ye dokunan bir iş sürüyor (${owner.kind ?? 'test'}, pid ${owner.pid}) — sıradayım, o bitince başlayacağım…`,
      );
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

const [command, ...args] = process.argv.slice(KIND_ARG ? 3 : 2);
try {
  execFileSync(command, args, { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status ?? 1);
}
