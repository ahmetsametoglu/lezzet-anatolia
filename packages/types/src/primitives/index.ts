// Yapı taşları: bir tablo satırını değil, birden çok tablonun paylaştığı bir şekli tarif eden parçalar; paketin en alt katmanı
// olduğu için buradan yukarı import yoktur (yön testi `src/layering.test.ts`). `db-numeric` bilerek dışa açılmaz, çünkü sürücü
// ayrıntısıdır ve tüketici zaten sayı görür.
export * from './enums.schema';
// Vitrin kontenjanı bir ŞEMA değil bir SABİT — ama ölçüt aynı: birden çok tablonun (kategori ·
// koleksiyon · paket) paylaştığı tek bir kural ve artık iki uygulama birden okuyor (web + MCP).
export * from './featured-slots';
export * from './localized-text.schema';
export * from './user-text.schema';
export * from './pagination.schema';
export * from './image.schema';
export * from './image-frames';
