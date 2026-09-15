#!/usr/bin/env node
/**
 * **Commit kapısı** — `pnpm test:commit -- <commit'in yolları>` (kullanıcı kararı 15.09, CLAUDE §4b).
 *
 * Tam paket her commit'in kapısı DEĞİL. Hangi testin koşacağına commit'in yolları karar verir
 * (`test-gate-rules.mjs`):
 *
 *   1. Yollardan biri veritabanını ya da test düzenini koddan bağımsız değiştiriyorsa (migration, seed,
 *      test fikstürü, test yapılandırması ve koşucusu, bağımlılık sürümü) → TAM PAKET. Birim projesi
 *      onun içinde; gerekçe `commit:<yol>` olarak koşucunun geçmişine yazılır.
 *   2. Değilse → birim projesinin tamamı (DB'siz, saniyeler) + yollara içe aktarma zinciriyle bağlı
 *      entegrasyon dosyaları (`vitest related`, test kilidi altında). Zincirde olmayan yol (doküman,
 *      native uygulama, müşteri sayfası) hiçbir entegrasyon dosyası seçmez; koşu boş geçer.
 *
 * **Yollar COMMIT'İN LİSTESİDİR, çalışma ağacının farkı değil:** üç şerit tek ağacı paylaşıyor ve
 * `vitest --changed` başka şeridin yarım işini de "değişen" sayardı.
 *
 * Silinmiş yollar `related`e verilmez (dosya yok); onları içe aktaran dosya da değişmiş olmak zorunda
 * (yoksa tip denetimi kırılır), seçimi o taşır.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fullTriggerOf, normalizePath } from './test-gate-rules.mjs';

const ROOT = join(import.meta.dirname, '..');
const paths = process.argv
  .slice(2)
  .filter((arg) => arg !== '--')
  .map(normalizePath);

if (paths.length === 0) {
  console.error("[test:commit] yol yok — kullanım: pnpm test:commit -- <commit'e girecek yollar>");
  process.exit(2);
}

/** Alt komutun çıkış kodu; sinyalle ölen süreç (status null) düşmüş sayılır. */
const run = (command, args) => spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', env: process.env }).status ?? 1;

const trigger = fullTriggerOf(paths);
if (trigger) {
  console.log(`[test:commit] tam paket — ${trigger.path}: ${trigger.why}`);
  process.exit(run('node', ['scripts/shared-test-run.mjs', `--reason=commit:${trigger.path}`]));
}

console.log('[test:commit] birim projesi (tamamı)');
const unit = run('pnpm', ['exec', 'vitest', 'run', '--project', 'unit']);
if (unit !== 0) process.exit(unit);

const present = paths.filter((path) => existsSync(join(ROOT, path)));
if (present.length === 0) {
  console.log('[test:commit] entegrasyon: yolların hepsi silinmiş — seçilecek dosya yok');
  process.exit(0);
}
console.log(`[test:commit] entegrasyon: ${present.length} yola bağlı dosyalar (vitest related, test kilidi altında)`);
process.exit(
  run('node', [
    'scripts/with-test-lock.mjs',
    'pnpm',
    'exec',
    'vitest',
    'related',
    ...present,
    '--project',
    'integration',
    '--run',
    '--passWithNoTests',
  ]),
);
