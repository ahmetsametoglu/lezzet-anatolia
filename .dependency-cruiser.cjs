/**
 * Paket sınırı kuralları — STACK §4 "bağımlılık tek yönlü".
 * İhlal `pnpm boundaries` ile hata olarak yakalanır.
 *
 * **HEDEF ÇÖZÜLMÜŞ YOLLA EŞLENİR, MODÜL ADIYLA DEĞİL — sadeleştirmeyin.** Bu satır 26.08'e kadar
 * *"workspace bağımlılığı modül adıyla (`@lezzet/<ad>`) eşlenir"* diyordu ve YANLIŞTI: depcruise
 * workspace importunu çözer, `@lezzet/domain-core` kenarda `packages/domain-core/src/index.ts`
 * olarak görünür. Sonucu dört kuralın (`types-is-pure`, `domain-core-scope`, `database-scope`,
 * `ai-scope`) **doğduklarından beri hiç ateşlenememesiydi** — ve altlarında gerçek bir ihlal
 * duruyordu. `pnpm boundaries` yine de her koşuda yeşil dönüyordu: yeşillik "ihlal yok" değil,
 * "bakamıyorum" demekti. Yanlış beyanın kendisi arızayı görünmez kıldı, çünkü okuyan kalıbı
 * sorgulamak yerine künyeye güvendi.
 *
 * Kalıplar bu yüzden İKİ hâli birden kabul eder: çözülmüş yol (asıl hâl) ve ham modül adı (paket
 * kurulu değilse depcruise dizeyi bırakır). Bekçinin ısırdığını `scripts/boundaries.test.ts`
 * sabitliyor — depcruise'u koşturmaz, çünkü depo temizken koşu her hâlde yeşil döner ve tam da
 * gizlemek istediğimiz körlüğü gizler; kalıpları gerçek yol biçimine karşı sınar.
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
