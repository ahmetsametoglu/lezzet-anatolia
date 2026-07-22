/**
 * Paket sınırı kuralları — STACK §4 "bağımlılık tek yönlü".
 * İhlal `pnpm boundaries` ile hata olarak yakalanır.
 * Workspace bağımlılığı modül adıyla (`@lezzet/<ad>`) eşlenir.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: "Döngüsel bağımlılık yasak; ortak parça types/helper'a iner.",
      from: {},
      to: { circular: true },
    },
    {
      name: 'packages-not-to-apps',
      severity: 'error',
      comment: 'Paketler uygulamaları ASLA bilmez.',
      from: { path: '^packages/' },
      to: { path: '(^@lezzet/(web|backend)$|^apps/)' },
    },
    {
      name: 'types-is-pure',
      severity: 'error',
      comment: 'types hiçbir iç pakete bağlanmaz (yalnız zod).',
      from: { path: '^packages/types/' },
      to: { path: '^@lezzet/(?!types$)' },
    },
    {
      name: 'domain-core-scope',
      severity: 'error',
      comment: 'domain-core yalnız types + helper bilir.',
      from: { path: '^packages/domain-core/' },
      to: { path: '^@lezzet/(?!(types|helper)$)' },
    },
    {
      name: 'database-scope',
      severity: 'error',
      comment: 'database yalnız types + helper bilir.',
      from: { path: '^packages/database/' },
      to: { path: '^@lezzet/(?!(types|helper)$)' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Bağlantısız modül (config/kabuk dosyaları hariç).',
      from: {
        orphan: true,
        pathNot: ['\\.d\\.ts$', 'src/index\\.ts$', 'config\\.(ts|js|mjs|cjs)$'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
  },
};
