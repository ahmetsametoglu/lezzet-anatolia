// SÖZLEŞMELER — bir tablonun aynası DEĞİL, iki tarafın konuştuğu ortak dil (01.12). Üreten ile
// tüketen aynı şemayı çağırsın diye buradadır: alan adı değişirse iki taraf birden DERLEME anında
// kırılır, üretimde değil.
//
// Ölçüt: dosya "şu uç / şu şablon ne alır, ne döndürür" sorusunu yanıtlıyorsa buraya girer; "şu
// tablo hangi kolonları taşır" sorusunu yanıtlıyorsa `../entities`e.
//
// Bu katman en üsttedir: `entities` + `primitives` okur, buradan aşağıya kimse bakmaz.
export * from './auth.schema';
// `/me` — profil VARLIK şemasından türer.
export * from './me-api.schema';
// Katalog — kategori/ürün/varyant/stok varlık şemalarından türer.
export * from './catalog-api.schema';
// Bildirim — tablo değil, müşteriye giden mesajın veri şekli; üç yer okur (şablon `packages/email`,
// sürücü `packages/notify`, veriyi kuran uygulama kapısı).
export * from './notification.schema';
