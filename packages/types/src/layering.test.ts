import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `@lezzet/types` iç düzeninin SÖZLEŞME testi (01.12).
 *
 * Klasör ayrımı (`primitives` / `entities` / `contracts`) yalnız bir yerleşim tercihi olsaydı ilk
 * acele import'ta çözülürdü — kimse fark etmezdi, çünkü yanlış yönlü bir import da DERLENİR.
 * Testin işi tam olarak budur: derleyicinin göremediği bir proje kararını makineye bağlamak.
 *
 * İki şeyi sabitler:
 *   1. **Yön** — `primitives ← entities ← contracts`. Aşağıdaki katman yukarıdakini BİLMEZ. Yön
 *      tersine dönerse yapı taşı bir uç sözleşmesine bağlanır ve paket kendi içinde döngüye girer.
 *   2. **Barrel bütünlüğü** — klasöre eklenen her dosya kendi barrel'ından ihraç edilir. Barrel'a
 *      yazılmayan bir şema hiçbir yerde hata vermez, YALNIZ yoktur: tüketici onu göremez, yazan
 *      kişi de "yazdım" sanır. En sessiz kusur budur.
 *
 * Test import SATIRLARINI okur (AST değil): burada import'lar tek satırlık ve `from '<yol>'`
 * biçimindedir, dolayısıyla düzenli ifade yeterli — ve testin kendisi bağımlılıksız kalır.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url));

/** Katman sırası — küçük olan ALTTAdır ve üstündekini bilmez. */
const RANK = { primitives: 0, entities: 1, contracts: 2 } as const;
type Layer = keyof typeof RANK;
const LAYERS = Object.keys(RANK) as Layer[];

/**
 * Barrel'dan BİLEREK dışa açılmayan dosyalar. Boş bırakılamaz bir liste değil; her satırı bir
 * karardır ve gerekçesi yanında durur.
 */
const NOT_EXPORTED: Record<string, string> = {
  'primitives/db-numeric.ts': 'Sürücü ayrıntısı (numeric → number). Şema yazarının aracı; paketin tüketicisi zaten sayı görür.',
};

const isSource = (f: string) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts';

function filesOf(layer: Layer): string[] {
  return readdirSync(join(SRC, layer)).filter(isSource).sort();
}

/** Yakalama grubu zorunlu olsa da tip `string | undefined` gelir — süzerek daraltıyoruz. */
const captures = (text: string, re: RegExp): string[] => [...text.matchAll(re)].map((m) => m[1]).filter((v): v is string => v !== undefined);

/** Dosyadaki göreli import/export hedefleri (`from './x'` · `from '../y/z'`). */
function relativeTargets(layer: Layer, file: string): string[] {
  return captures(readFileSync(join(SRC, layer, file), 'utf8'), /from '(\.[^']*)'/g);
}

/** Göreli hedefin hangi katmana düştüğü — paket dışı (zod) ve katmansız yollar için `null`. */
function layerOf(fromLayer: Layer, target: string): Layer | null {
  if (target.startsWith('./')) return fromLayer;
  const dir = target.match(/^\.\.\/([^/]+)\//)?.[1];
  return dir !== undefined && (LAYERS as string[]).includes(dir) ? (dir as Layer) : null;
}

describe('paket iç düzeni — katmanlar', () => {
  it('her katmanda dosya var (klasör sessizce boşalmasın)', () => {
    expect(filesOf('primitives').length).toBeGreaterThan(0);
    expect(filesOf('entities').length).toBeGreaterThan(0);
    expect(filesOf('contracts').length).toBeGreaterThan(0);
  });

  it('bağımlılık yönü tek yönlü: primitives ← entities ← contracts', () => {
    const violations: string[] = [];
    for (const layer of LAYERS) {
      // Test dosyaları da taranır: onlar da paketin içindedir ve yanlış yöne bağlanabilirler.
      for (const file of readdirSync(join(SRC, layer)).filter((f) => f.endsWith('.ts'))) {
        for (const target of relativeTargets(layer, file)) {
          const to = layerOf(layer, target);
          if (to && RANK[to] > RANK[layer]) violations.push(`${layer}/${file} → ${to} ('${target}')`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('her katman barrel’ı kendi klasöründeki TÜM dosyaları ihraç eder', () => {
    const missing: string[] = [];
    for (const layer of LAYERS) {
      const barrel = readFileSync(join(SRC, layer, 'index.ts'), 'utf8');
      for (const file of filesOf(layer)) {
        const specifier = `./${file.replace(/\.ts$/, '')}`;
        const exported = barrel.includes(`from '${specifier}'`);
        const excused = `${layer}/${file}` in NOT_EXPORTED;
        if (!exported && !excused) missing.push(`${layer}/${file}`);
        if (exported && excused) missing.push(`${layer}/${file} (ihraç EDİLMEZ deniyordu ama ediliyor — liste bayat)`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('barrel yalnız VAR OLAN dosyaları ihraç eder (silinen dosyanın izi kalmasın)', () => {
    const dangling: string[] = [];
    for (const layer of LAYERS) {
      const present = new Set(filesOf(layer).map((f) => f.replace(/\.ts$/, '')));
      for (const target of captures(readFileSync(join(SRC, layer, 'index.ts'), 'utf8'), /from '\.\/([^']+)'/g)) {
        if (!present.has(target)) dangling.push(`${layer}/index.ts → ./${target}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it('paketin tek kapısı kök barrel: üç katmanı da toplar', () => {
    const root = readFileSync(join(SRC, 'index.ts'), 'utf8');
    for (const layer of LAYERS) expect(root).toContain(`export * from './${layer}'`);
  });
});
