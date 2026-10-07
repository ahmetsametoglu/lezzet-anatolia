import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  customerAppColors,
  customerColors,
  flattenDarkTokens,
  flattenThemeTokens,
  operationsAppColors,
  operationsBrand,
} from '../packages/design-tokens/src/index';

/**
 * Yazı ile zemininin kontrastı, metinde eşik 4,5:1. Çiftler web sınıf dizilerinden ve `fill`/`bg` ile `text` tablolarından, native
 * stil nesnelerinden ve ana yazı rollerinin zeminlerinden toplanır; operasyon çiftleri açık ve koyu temada ölçülür.
 */
// Bir bileşen yazıyı zemininin renginde çizerse ya da taban listesinde olmayan yeni bir eşik altı çift eklenirse kırmızıya döner.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const THRESHOLD = 4.5;

type Palette = Record<string, string>;

const colorsOf = (tokens: Record<string, string>): Palette =>
  Object.fromEntries(
    Object.entries(tokens)
      .filter(([name]) => name.startsWith('--color-'))
      .map(([name, value]) => [name.slice('--color-'.length), value]),
  );

const WEB: Palette = { ...colorsOf(flattenThemeTokens()), white: '#ffffff', black: '#000000' };
const OPS_DARK: Palette = { ...WEB, ...colorsOf(flattenDarkTokens()) };
// Native temaların birleşim sırası `packages/mobile-kit/src/theme/unistyles.ts`teki gibidir.
const NATIVE_CUSTOMER: Palette = { ...customerColors, ...customerAppColors };
const NATIVE_OPS: Palette = { ...customerColors, ...customerAppColors, ...operationsAppColors, ...operationsBrand };

/** Göreli parlaklık (WCAG); yalnız düz `#rrggbb` ölçülür, saydam değerin altındaki renk bilinmez. */
function luminance(color: string | undefined): number | null {
  const hex = color && /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string | undefined, b: string | undefined): number | null {
  const [la, lb] = [luminance(a), luminance(b)];
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

interface Finding {
  key: string;
  ratio: number;
  where: string;
}

const findings = new Map<string, Finding>();

function check(scope: string, palette: Palette, text: string, background: string, where: string): void {
  // Devre dışı hâlin rengi okunabilirlik eşiğine tabi değildir.
  if (text.startsWith('disabled') || background.startsWith('disabled')) return;
  const ratio = contrast(palette[text], palette[background]);
  if (ratio === null || ratio >= THRESHOLD) return;
  const key = `${scope} · ${text} / ${background}`;
  if (!findings.has(key)) findings.set(key, { key, ratio, where });
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function walk(file: string, visit: (node: ts.Node, sf: ts.SourceFile, where: () => string) => void): void {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const rel = relative(ROOT, file);
  const step = (node: ts.Node) => {
    visit(node, sf, () => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
    ts.forEachChild(node, step);
  };
  step(sf);
}

/** Durum önekli (`hover:`), saydamlıklı (`/40`) ve keyfi (`[…]`) sınıflar başka bir anın rengidir; `text-ops-sm` gibi boy sınıfı renk değildir. */
function colorClasses(classList: string): { backgrounds: string[]; texts: string[] } {
  const backgrounds: string[] = [];
  const texts: string[] = [];
  for (const cls of classList.split(/\s+/)) {
    const match = /^(bg|text)-([a-z0-9-]+)$/.exec(cls);
    if (!match?.[2] || !(match[2] in WEB)) continue;
    (match[1] === 'bg' ? backgrounds : texts).push(match[2]);
  }
  return { backgrounds, texts };
}

function checkWeb(backgrounds: string[], texts: string[], where: string): void {
  for (const background of backgrounds) {
    for (const text of texts) {
      if (background.startsWith('ops-') || text.startsWith('ops-')) {
        check('web ops açık', WEB, text, background, where);
        check('web ops koyu', OPS_DARK, text, background, where);
      } else {
        check('web müşteri', WEB, text, background, where);
      }
    }
  }
}

const classText = (node: ts.Node): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
  return null;
};

// Aynı dizideki iki sınıf aynı öğededir; ayrı anahtarlardaki `fill`/`bg` ile `text` ise üst üste çizilen hap ve yazısıdır.
for (const file of [...sourceFiles(join(ROOT, 'apps/web/app')), ...sourceFiles(join(ROOT, 'apps/web/components'))]) {
  walk(file, (node, sf, where) => {
    const text = classText(node);
    if (text !== null) {
      const { backgrounds, texts } = colorClasses(text);
      if (backgrounds.length > 0 && texts.length > 0) checkWeb(backgrounds, texts, where());
    }
    if (ts.isObjectLiteralExpression(node)) {
      const values = (names: string[]) =>
        node.properties.flatMap((p) =>
          ts.isPropertyAssignment(p) && names.includes(p.name.getText(sf)) ? [classText(p.initializer) ?? ''] : [],
        );
      const fills = values(['fill', 'bg']).flatMap((v) => colorClasses(v).backgrounds);
      const texts = values(['text']).flatMap((v) => colorClasses(v).texts);
      if (fills.length > 0 && texts.length > 0) checkWeb(fills, texts, where());
    }
  });
}

// Native'de aynı stil nesnesindeki `backgroundColor` ile `color` aynı öğenin zemini ve yazısıdır.
const NATIVE: [string, [string, Palette][]][] = [
  ['apps/mobile-customer/src', [['native müşteri', NATIVE_CUSTOMER]]],
  ['apps/mobile-operations/src', [['native operasyon', NATIVE_OPS]]],
  [
    'packages/mobile-kit/src',
    [
      ['native müşteri', NATIVE_CUSTOMER],
      ['native operasyon', NATIVE_OPS],
    ],
  ],
];
for (const [dir, scopes] of NATIVE) {
  for (const file of sourceFiles(join(ROOT, dir))) {
    walk(file, (node, sf, where) => {
      if (!ts.isObjectLiteralExpression(node)) return;
      const tokenOf = (e: ts.Expression): string | null => {
        if (ts.isPropertyAccessExpression(e) && e.expression.getText(sf).endsWith('colors')) return e.name.text;
        if (ts.isElementAccessExpression(e) && e.expression.getText(sf).endsWith('colors') && ts.isStringLiteral(e.argumentExpression)) {
          return e.argumentExpression.text;
        }
        return null;
      };
      let background: string | null = null;
      let text: string | null = null;
      for (const p of node.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        if (p.name.getText(sf) === 'backgroundColor') background = tokenOf(p.initializer);
        if (p.name.getText(sf) === 'color') text = tokenOf(p.initializer);
      }
      if (background && text) for (const [scope, palette] of scopes) check(scope, palette, text, background, where());
    });
  }
}

// Ana yazı rolleri zemini kalıtımla alır, aynı dizide görünmez; sayfa ve kart zeminleri açıkça ölçülür.
const OPS_TEXT = ['ops-ink', 'ops-strong', 'ops-body', 'ops-muted'];
const OPS_SURFACE = ['ops-bg', 'ops-card', 'ops-white'];
const ROLES: { scope: string; palette: Palette; texts: string[]; surfaces: string[] }[] = [
  { scope: 'web müşteri', palette: WEB, texts: ['ink', 'body', 'muted'], surfaces: ['cream', 'card', 'cream-deep'] },
  { scope: 'web ops açık', palette: WEB, texts: OPS_TEXT, surfaces: OPS_SURFACE },
  { scope: 'web ops koyu', palette: OPS_DARK, texts: OPS_TEXT, surfaces: OPS_SURFACE },
  { scope: 'native müşteri', palette: NATIVE_CUSTOMER, texts: ['ink', 'body', 'muted'], surfaces: ['cream', 'card'] },
  { scope: 'native operasyon', palette: NATIVE_OPS, texts: ['ink', 'body', 'muted'], surfaces: ['cream', 'card', 'panel'] },
];
for (const { scope, palette, texts, surfaces } of ROLES) {
  for (const text of texts) for (const surface of surfaces) check(scope, palette, text, surface, 'yazı rolü');
}

// BEKLEYEN(K.69): taban listesindeki çiftler renk kademesi kararıyla kapanır; liste yalnız küçülür.
const BASELINE: readonly string[] = JSON.parse(readFileSync(join(ROOT, 'scripts/contrast-baseline.json'), 'utf8'));

describe('yazı-zemin kontrastı', () => {
  it('eşik altındaki her çift taban listesinde; yeni açık testi düşürür', () => {
    const fresh = [...findings.values()]
      .filter((f) => !BASELINE.includes(f.key))
      .map((f) => `${f.ratio.toFixed(2)}:1  ${f.key}  ← ${f.where}`);
    expect(fresh).toEqual([]);
  });

  it('taban listesindeki her çift hâlâ eşik altında; düzelen çift listeden çıkar', () => {
    expect(BASELINE.filter((key) => !findings.has(key))).toEqual([]);
  });
});
