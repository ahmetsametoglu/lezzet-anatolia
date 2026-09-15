#!/usr/bin/env node
/*
  TASARIM FARKI — "hangi EKRAN değişti?"

  Claude Design tasarımı TEK BÜYÜK dosya olarak geliyor (`Mobil - Musteri v3.dc.html`, ~2000 satır)
  ve `git diff` ham hâliyle yüzlerce satır gösteriyor; hangi ekranın değiştiği o yığından okunmuyor
  (kullanıcı 09.08: *"tek bir büyük dosya geleceği için buradaki değişiklikleri tespit etmem kolay
  olacak mı bilmiyorum"*).

  Dosyanın kendi düzeni bir tutamak veriyor: her ekranın durumu `vHome` · `vKesif` · `vRecipe` ·
  `vPackage` gibi bir ada bağlı ve o adlar dosyada ekranların BAŞINDA geçiyor. Betik değişen her
  satırı, kendisinden ÖNCE gelen en yakın ekran adına yazıyor — çıktı "şu ekranlarda şu kadar satır
  oynadı" listesi oluyor.

  YAKLAŞIKTIR ve öyle olduğunu söyler: ortak stil bloğu ya da tepe bölüm hiçbir ekrana ait değildir,
  onlar "(ekran dışı)" altında toplanır. Amaç kararı vermek değil, NEREYE bakılacağını söylemek.

  Kullanım:  pnpm --filter mobile design:diff [dosya]
  Varsayılan dosya: design/project/Mobil - Musteri v3.dc.html
  Karşılaştırma: çalışma ağacı ↔ HEAD (yani "gelen tasarım" commit'lenmeden ÖNCE koşulur).
*/

import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '../../..');
const DEFAULT_FILE = 'design/project/Mobil - Musteri v3.dc.html';
/** Ekran adı deseni — `v` + Büyük harf + devamı (`vHome`, `vTalepNew`). */
const SCREEN = /\bv[A-Z][A-Za-z]+\b/;

const target = process.argv[2] ?? DEFAULT_FILE;
const rel = relative(REPO, resolve(REPO, target));

function git(...args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

let head;
try {
  head = git('show', `HEAD:${rel}`);
} catch {
  console.error(`Dosya HEAD'de yok: ${rel}`);
  process.exit(1);
}

const diff = git('diff', '--unified=0', '--', rel);
if (diff.trim() === '') {
  console.log(`Değişiklik yok: ${rel}`);
  process.exit(0);
}

/* HEAD'in satırlarından "kaçıncı satırdan itibaren hangi ekran" haritası çıkarılır. Eski dosya
   kullanılır çünkü satır numaraları da eski dosyanınkidir (`-` tarafı); yeni bloklar en yakın
   eski bağlama yazılır ve bu yaklaşıklık künyede söylenmiştir. */
const lines = head.split('\n');
const owner = [];
let current = '(ekran dışı)';
for (const line of lines) {
  const found = SCREEN.exec(line);
  if (found !== null) current = found[0];
  owner.push(current);
}

const tally = new Map();
let hunkLine = 0;
for (const line of diff.split('\n')) {
  const hunk = /^@@ -(\d+)(?:,\d+)? \+/.exec(line);
  if (hunk !== null) {
    hunkLine = Number(hunk[1]);
    continue;
  }
  if (line.startsWith('+++') || line.startsWith('---')) continue;
  if (!line.startsWith('+') && !line.startsWith('-')) continue;

  const screen = owner[Math.max(0, hunkLine - 1)] ?? '(ekran dışı)';
  const seen = tally.get(screen) ?? { added: 0, removed: 0 };
  if (line.startsWith('+')) seen.added += 1;
  else {
    seen.removed += 1;
    hunkLine += 1;
  }
  tally.set(screen, seen);
}

const rows = [...tally.entries()].sort((a, b) => b[1].added + b[1].removed - (a[1].added + a[1].removed));
const width = Math.max(...rows.map(([name]) => name.length));

console.log(`\n${rel}\n`);
for (const [name, { added, removed }] of rows) {
  console.log(`  ${name.padEnd(width)}  +${String(added).padStart(4)}  -${String(removed).padStart(4)}`);
}
console.log(`\n  Ekran eşlemesi YAKLAŞIKTIR — satırın hangi ekrana ait olduğu, kendisinden önceki`);
console.log(`  en yakın \`vXxx\` işaretinden okunur. Tam metin için: git diff -- "${rel}"\n`);
