// @lezzet/types — Zod şemaları + domain tipler (TEK KAYNAK).
// Artımlı büyür: her modül yalnız ihtiyacı olan şemayı ekler (docs/build/01-types.md tam envanter).
//
// ÜÇ EKSEN, ÜÇ KLASÖR (01.12 — kullanıcı kararı 08.08): tek düzlemde 48 dosya durduğunda "bu bir
// tablo mu, bir uç sözleşmesi mi, yoksa herkesin kullandığı bir yapı taşı mı" sorusu ancak dosyayı
// AÇARAK yanıtlanıyordu. Klasör bu soruyu ada değil yere bağlar; bağımlılık yönü de
// (`primitives ← entities ← contracts`) böylece makineyle zorlanabilir hâle gelir
// (`src/layering.test.ts`).
//
// DIŞA GÖRÜNÜM DEĞİŞMEZ: paketin tek kapısı burasıdır (`exports: { ".": "./src/index.ts" }`) ve
// derin import yoktur — tüketici hiçbir zaman `@lezzet/types/entities/...` yazmaz. Klasör iç
// düzendir; bir dosya eksenler arasında yer değiştirdiğinde tüketicinin import satırı oynamaz.
export * from './primitives';
export * from './entities';
export * from './contracts';
