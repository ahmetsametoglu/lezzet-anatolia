import { readFileSync } from 'node:fs';
import path from 'node:path';

/*
  APP.CONFIG'İN NODE-ESM BEKÇİSİ (21.121 oturumu, 26.08).

  `app.config.ts` Metro'dan ÖNCE, Node'un kendi ESM yükleyicisiyle değerlendirilir ve Node
  uzantısız göreli importa `.ts` eklemez. Bu iki kez kırdı (MB-42: design-tokens girişi ·
  26.08: i18n girişine eklenen `./locale` yeniden-ihracı) ve ikisinde de belirti aynıydı:
  `expo start` → `ERR_MODULE_NOT_FOUND`, hata mesajı sebebini söylemiyor. Hiçbir jest/vitest
  koşusu bunu KENDİLİĞİNDEN yakalayamaz — test koşucuları Node'un değil kendi çözümleyicisini
  kullanır; arıza yalnız `expo start`ta görünürdü.

  Bekçi kuralı iki parça hâlinde ÇİVİLER (statik ölçüm — Node davranışının kendisini değil,
  onu kıran iki deseni arar):
  1. `app.config.ts` bir `@lezzet/*` paketinin GİRİŞİNİ import edemez — yalnız alt yol ihracı
     (`@lezzet/pkg/leaf`). Girişler uzantısız yeniden-ihraç taşır ve taşımaya devam edecek.
  2. Alt yolun çözüldüğü dosya YAPRAK kalmalı: uzantısız göreli DEĞER importu/ihracı olamaz
     (`import type` / `export type` muaf — derlemede silinir, çalışma anında bağ bırakmaz).
*/

const mobileRoot = path.resolve(__dirname, '../..');
const appConfigSource = readFileSync(path.join(mobileRoot, 'app.config.ts'), 'utf8');
/* Paket kökleri workspace düzeninden: `exports` haritalı bir paketin package.json'u require ile
   çözülemez (harita yalnız listelediği yolları açar) — dosya sistemi yolu tek güvenilir kapı. */
const packagesRoot = path.resolve(mobileRoot, '../../packages');

/** Bir kaynaktaki import/ihraç hedefleri — `import type`/`export type` işaretiyle. */
function moduleRefs(source: string): { spec: string; typeOnly: boolean }[] {
  // Yorumlar ÖNCE atılır: künyeler ders anlatırken `export … from './locale'` örneği yazar ve
  // bekçi onları gerçek import sanıp yalancı kırmızı üretiyordu (ilk koşuda ölçüldü).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const refs: { spec: string; typeOnly: boolean }[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^'";]*?from\s+['"]([^'"]+)['"]/g;
  for (const match of code.matchAll(pattern)) {
    refs.push({ spec: match[2]!, typeOnly: match[1] !== undefined });
  }
  return refs;
}

/** `@lezzet/pkg/leaf` → dosya yolu (paketin `exports` haritası üzerinden). */
function resolveLeaf(spec: string): string {
  const [, pkg, ...leafParts] = spec.split('/');
  const pkgDir = path.join(packagesRoot, pkg!);
  const pkgJson = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8')) as {
    exports?: Record<string, string>;
  };
  const target = pkgJson.exports?.[`./${leafParts.join('/')}`];
  if (target === undefined) throw new Error(`${spec}: paketin exports haritasında alt yol yok`);
  return path.join(pkgDir, target);
}

describe('app.config.ts · Node ESM bekçisi', () => {
  const lezzetRefs = moduleRefs(appConfigSource).filter((ref) => ref.spec.startsWith('@lezzet/'));

  it('bekçinin ölçtüğü bir şey var — config en az bir @lezzet modülü okuyor', () => {
    expect(lezzetRefs.length).toBeGreaterThan(0);
  });

  it('hiçbir @lezzet paketi GİRİŞİNDEN import edilmez — yalnız alt yol', () => {
    for (const ref of lezzetRefs) {
      // `@lezzet/pkg` iki parçadır, alt yol üç: giriş importu ERR_MODULE_NOT_FOUND tuzağıdır.
      expect(ref.spec.split('/').length).toBeGreaterThan(2);
    }
  });

  it('alt yol modülleri YAPRAK: uzantısız göreli değer importu/ihracı taşımaz', () => {
    for (const ref of lezzetRefs.filter((entry) => !entry.typeOnly)) {
      const file = resolveLeaf(ref.spec);
      const offending = moduleRefs(readFileSync(file, 'utf8')).filter(
        (inner) => inner.spec.startsWith('.') && !inner.typeOnly,
      );
      // Düşerse: o modüle değer importu eklendi — `expo start` bir sonraki açılışta
      // ERR_MODULE_NOT_FOUND ile kesilir (paths.ts künyesindeki yasak).
      expect({ leaf: ref.spec, offending }).toEqual({ leaf: ref.spec, offending: [] });
    }
  });
});
