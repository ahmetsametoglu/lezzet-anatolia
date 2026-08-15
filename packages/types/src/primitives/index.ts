// YAPI TAŞLARI — hiçbir varlığa ait olmayan, varlıkların İÇİNDE yaşayan parçalar: proje-geneli
// enum'lar, çok dilli metin, kullanıcı metni + çeviri torbası, görsel künyesi/kırpma, sayfalama
// sözleşmesi, sürücü seviyesi `numeric` dönüşümü (01.12).
//
// Ölçüt: dosya bir TABLO satırını değil, birden çok tablonun paylaştığı bir ŞEKLİ tarif ediyorsa
// buraya girer. Bu katman paketin en altıdır — `entities` ve `contracts` buradan okur, buradan
// yukarı hiçbir import yoktur (yön testi: `src/layering.test.ts`).
//
// `db-numeric` BİLEREK dışa açılmaz: sürücü ayrıntısıdır, şema yazarının aracıdır. Paketin
// tüketicisi zaten sayı görür — o dönüşümü kendi yapması gerekmez.
export * from './enums.schema';
// Vitrin kontenjanı bir ŞEMA değil bir SABİT — ama ölçüt aynı: birden çok tablonun (kategori ·
// koleksiyon · paket) paylaştığı tek bir kural ve artık iki uygulama birden okuyor (web + MCP).
export * from './featured-slots';
export * from './localized-text.schema';
export * from './user-text.schema';
export * from './pagination.schema';
export * from './image.schema';
