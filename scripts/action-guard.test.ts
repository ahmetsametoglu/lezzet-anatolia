import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Sunucu eylemi tarayıcıdan doğrudan çağrılabilen bir uçtur ve veritabanına servis anahtarıyla gider; veritabanı dışarıya kapalı
 * olduğu için tek kapı eylemin kimlik ya da yetki çağrısıdır.
 */
// Kimlik ya da yetki çağırmayan yeni bir sunucu eylemi eklenirse ya da herkese açık liste bayatlarsa kırmızıya döner. Yanlış rolü
// (yönetici yerine personel) yakalamaz.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB = join(ROOT, 'apps/web');
const GUARD_FILE = join(WEB, 'lib/guard.ts');
/** Kapı eylemin kendisinde ya da en çok iki adım ötedeki yardımcıda aranır (`setWarehouseContextAction` → `writeWarehouseContext`). */
const MAX_DEPTH = 2;

/** Kapısız olması bilinçli eylemler: kimliği bağlantıdaki jeton taşır ya da çıktısı herkese açık veridir. */
const PUBLIC_ACTIONS: Record<string, string> = {
  'app/(customer)/[locale]/product/[slug]/actions.ts › loadMoreReviewsAction': 'yayımlanmış yorumlar herkese açık',
  'app/(customer)/[locale]/feedback/[token]/actions.ts › voteAction': 'kimlik bağlantıdaki davet jetonundan çözülür',
  'app/(customer)/[locale]/feedback/[token]/actions.ts › reviewAction': 'kimlik bağlantıdaki davet jetonundan çözülür',
  'app/(customer)/[locale]/feedback/[token]/actions.ts › completeAction': 'kimlik bağlantıdaki davet jetonundan çözülür',
  'app/(customer)/[locale]/unsubscribe/[token]/actions.ts › unsubscribeAction': 'kimlik e-postadaki abonelik jetonundan çözülür',
  'app/(customer)/[locale]/invite/[code]/actions.ts › acceptInviteAction': 'davet kodunu çereze yazar; giriş sonra yapılır',
  'app/(customer)/[locale]/professionals/actions.ts › lookupSiretAction': 'kayıt formu; şirket sicili herkese açık',
  'app/(customer)/[locale]/professionals/actions.ts › checkVatAction': 'kayıt formu; KDV numarası doğrulaması herkese açık',
  'lib/auth/otp-actions.ts › sendEmailOtp': 'girişin kendisi',
  'lib/auth/otp-actions.ts › verifyEmailOtp': 'girişin kendisi',
  'lib/observability/report-client-error.ts › reportClientErrorAction': 'tarayıcı hatası kaydı; oturum düşmüşken de gelmeli',
};

interface NamedFunction {
  body: ts.Node;
  exported: boolean;
  isFunction: boolean;
}

const parsed = new Map<string, ts.SourceFile>();

function parse(file: string): ts.SourceFile {
  let source = parsed.get(file);
  if (!source) {
    const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
    parsed.set(file, source);
  }
  return source;
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function functionsOf(source: ts.SourceFile): Map<string, NamedFunction> {
  const out = new Map<string, NamedFunction>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      out.set(statement.name.text, { body: statement.body, exported: isExported(statement), isFunction: true });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const init = declaration.initializer;
        out.set(declaration.name.text, {
          body: init,
          exported: isExported(statement),
          isFunction: ts.isArrowFunction(init) || ts.isFunctionExpression(init),
        });
      }
    }
  }
  return out;
}

function isServerModule(source: ts.SourceFile): boolean {
  const first = source.statements[0];
  return Boolean(first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === 'use server');
}

function calledNames(node: ts.Node): Set<string> {
  const out = new Set<string>();
  const visit = (current: ts.Node): void => {
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      if (ts.isIdentifier(callee)) out.add(callee.text);
      else if (ts.isPropertyAccessExpression(callee)) out.add(callee.name.text);
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return out;
}

function resolveModule(from: string, specifier: string): string | null {
  const base = specifier.startsWith('@/') ? join(WEB, specifier.slice(2)) : specifier.startsWith('.') ? join(dirname(from), specifier) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file: string): Map<string, { file: string; name: string }> {
  const out = new Map<string, { file: string; name: string }>();
  for (const statement of parse(file).statements) {
    const bindings = ts.isImportDeclaration(statement) ? statement.importClause?.namedBindings : undefined;
    if (!bindings || !ts.isNamedImports(bindings) || !ts.isStringLiteral((statement as ts.ImportDeclaration).moduleSpecifier)) continue;
    const target = resolveModule(file, ((statement as ts.ImportDeclaration).moduleSpecifier as ts.StringLiteral).text);
    if (!target) continue;
    for (const element of bindings.elements) out.set(element.name.text, { file: target, name: (element.propertyName ?? element.name).text });
  }
  return out;
}

function reachesGuard(file: string, body: ts.Node, guards: ReadonlySet<string>, depth = 0): boolean {
  const names = calledNames(body);
  if ([...names].some((name) => guards.has(name))) return true;
  if (depth >= MAX_DEPTH) return false;
  const local = functionsOf(parse(file));
  const imported = importsOf(file);
  for (const name of names) {
    const own = local.get(name);
    if (own && own.body !== body && reachesGuard(file, own.body, guards, depth + 1)) return true;
    const external = imported.get(name);
    const target = external ? functionsOf(parse(external.file)).get(external.name) : undefined;
    if (external && target?.exported && reachesGuard(external.file, target.body, guards, depth + 1)) return true;
  }
  return false;
}

function serverModules(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) serverModules(path, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && readFileSync(path, 'utf8').includes('use server')) {
      if (isServerModule(parse(path))) out.push(path);
    }
  }
  return out;
}

describe('sunucu eylemlerinde kimlik/yetki kapısı', () => {
  const guards = new Set([...functionsOf(parse(GUARD_FILE))].filter(([, fn]) => fn.exported).map(([name]) => name));
  const actions = serverModules(WEB).flatMap((file) =>
    [...functionsOf(parse(file))]
      .filter(([, fn]) => fn.exported && fn.isFunction)
      .map(([name, fn]) => ({ key: `${relative(WEB, file)} › ${name}`, guarded: reachesGuard(file, fn.body, guards) })),
  );
  const unguarded = new Set(actions.filter((action) => !action.guarded).map((action) => action.key));

  it('kapısız eylem yalnız herkese açık listede', () => {
    expect(actions.length).toBeGreaterThan(0);
    expect([...unguarded].filter((key) => !(key in PUBLIC_ACTIONS))).toEqual([]);
  });

  it('herkese açık liste bayat değil', () => {
    expect(Object.keys(PUBLIC_ACTIONS).filter((key) => !unguarded.has(key))).toEqual([]);
  });
});
