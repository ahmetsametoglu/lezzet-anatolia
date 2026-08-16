/**
 * Paket sınırı kuralları — STACK §4 "bağımlılık tek yönlü".
 * İhlal `pnpm boundaries` ile hata olarak yakalanır.
 * Workspace bağımlılığı modül adıyla (`@lezzet/<ad>`) eşlenir.
 *
 * **`boundaries` komutu neden İKİ parçalı** (sadeleştirmeyin): `apps/web`'in `@/` takma adı
 * `apps/web/tsconfig.json`'un `paths`'inde tanımlı ve depcruise bunu ancak `--ts-config` ile
 * çözebiliyor. Kökten `--ts-config apps/web/tsconfig.json` ÇALIŞMAZ — TS, `include` yollarını
 * cwd'ye göre çözüp `TS18003` verir; o yüzden web koşusu `pnpm -C apps/web` ile o dizinden
 * başlatılır. Tek parçaya indirilirse `@/` ile yazılan her import HİÇBİR YERE GİTMEYEN bir kenar
 * olur (ölçüldü: 4106 kenarın 1352'si, %33) ve iki bekçi birden körleşir: `no-orphans`'ın tamamı
 * yanlış pozitife döner (yalan söyleyen uyarı okunmaz), `no-circular` ise yalnız GÖRELİ
 * importlardan kurulu döngüleri görür — `@/` üzerinden kurulan bir döngü sessiz kalır.
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
      name: 'ai-scope',
      severity: 'error',
      comment: 'ai yalnız types bilir — DB/logger/iş kuralı yok (bkz. packages/ai/src/types.ts).',
      from: { path: '^packages/ai/' },
      to: { path: '^@lezzet/(?!types$)' },
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
    // `.next-prod` de dışarıda: paralel production derlemesinin çıktısı (`NEXT_DIST_DIR`), kaynak
    // değil. `\.next` kalıbı onu YAKALAMIYOR (araya `-prod` giriyor) ve derlenmiş 283 dosya
    // "orphan" diye uyarıya düşüp gerçek ihlalleri gömüyordu — eslint'te aynısı düzeltilmişti.
    exclude: { path: '(\\.next(-prod)?|\\.turbo|dist)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    },
  },
};
