/**
 * Paket sınırı kuralları (STACK §4): kalıplar hedefi hem çözülmüş yolla (`packages/<ad>/src/index.ts`) hem ham modül adıyla
 * eşler, çünkü depcruise workspace importunu çözer ve yalnız modül adına bakan kural hiçbir kenarı göremez; bunu
 * `scripts/boundaries.test.ts` sabitler. `boundaries` komutu web'i kendi dizininden ayrıca koşar, çünkü `@/` takma adı ancak
 * `apps/web/tsconfig.json` ile çözülür ve çözülmeyen kenarlar `no-orphans`ı yanlış pozitife, `no-circular`ı körlüğe iter.
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
      to: { path: '^(packages/(?!types/)|@lezzet/(?!types$))' },
    },
    {
      name: 'domain-core-scope',
      severity: 'error',
      comment: 'domain-core yalnız types + helper bilir.',
      from: { path: '^packages/domain-core/' },
      to: { path: '^(packages/(?!(types|helper|domain-core)/)|@lezzet/(?!(types|helper)$))' },
    },
    {
      name: 'database-scope',
      severity: 'error',
      comment: 'database yalnız types + helper bilir.',
      from: { path: '^packages/database/' },
      to: { path: '^(packages/(?!(types|helper|database)/)|@lezzet/(?!(types|helper)$))' },
    },
    {
      name: 'ai-scope',
      severity: 'error',
      comment: 'ai yalnız types bilir — DB/logger/iş kuralı yok (bkz. packages/ai/src/types.ts).',
      from: { path: '^packages/ai/' },
      to: { path: '^(packages/(?!(types|ai)/)|@lezzet/(?!types$))' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Bağlantısız modül (config/kabuk dosyaları hariç).',
      from: {
        orphan: true,
        // `packages/mobile-kit` hariç: tüketeni olan native uygulamalar bu koşuda taranmaz ve her kit modülü yetim görünürdü;
        // kitin ölü dosyasını `knip` görür, çünkü uygulamanın derin importunu izler.
        pathNot: ['\\.d\\.ts$', 'src/index\\.ts$', 'config\\.(ts|js|mjs|cjs)$', '^packages/mobile-kit/'],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // `.next-prod` production derlemesinin çıktısıdır, kaynak değil; `\.next` kalıbı araya `-prod` girdiği için onu yakalamaz.
    exclude: { path: '(\\.next(-prod)?|\\.turbo|dist)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
  },
};
