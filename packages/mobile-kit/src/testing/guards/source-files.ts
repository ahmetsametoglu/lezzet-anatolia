import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/*
  BEKÇİLERİN ORTAK TARAYICISI (21.310) — native uygulamaların ve kitin kaynak bekçileri aynı dosya
  kümesini tarar: test olmayan `.tsx`. Küme tek yerde tanımlı; bekçi başına ayrı yazılsaydı biri bir gün
  testleri de saymaya başlardı ve iki bekçi aynı ağaçta farklı şeyler ölçerdi.
*/

/** `dir` altındaki test olmayan `.tsx` dosyaları (`node_modules` hariç). */
export function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules') out.push(...sourceFiles(full));
    } else if (full.endsWith('.tsx') && !full.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Kitin kaynak kökü — kit kendi kaynağını kendi testinde tarar, uygulamalar kendilerininkini. */
export const KIT_SRC = path.resolve(__dirname, '..', '..');
