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
// `/me/addresses` — adres varlık şemasından türer; yazma gövdesi ve "cevap hep güncel liste"
// kuralı dosya başlığında.
export * from './address-api.schema';
// Puan cüzdanı — bakiye/eşik/kuponlar + puan→kupon çevirme. Kupon AYRI bir tablo değil,
// `customerId`si dolu bir indirim satırı; şema bu yüzden indirim ve puan varlıklarından türer.
export * from './points-api.schema';
// Sipariş (müşteri) — "Siparişlerim" listesi + sipariş detayı; keyset sayfalı liste ve dört
// duraklı zaman çizgisi. Adresleme REFERANS numarasıyla (gerekçe dosya başlığında).
export * from './order-api.schema';
// Talep/şikâyet (müşteri) — "Taleplerim" listesi + mesajlaşma detayı + yeni talep gövdesi;
// durum makinesi ve kanal kuralları `@lezzet/application`ın talep kapısında.
export * from './ticket-api.schema';
// Geri bildirim akışı — davet + oy/yorum/tamamlama; token oturum yerine geçer, kimlik alanları
// bilerek zarf dışında (gerekçeler dosya başlığında).
export * from './feedback-api.schema';
// Yer çözümü — onboarding posta kodu adımı; dört hâl ayrık, depo kimliği bilerek dışarıda (19.9).
export * from './place-api.schema';
// Katalog — kategori/ürün/varyant/stok varlık şemalarından türer.
export * from './catalog-api.schema';
// Vitrin (ana ekran) — katalog kartını ve kategori/koleksiyon/tarif varlık şemalarını türetir;
// yalnız müşteriden bağımsız bölümler (kullanıcı kararı 08.08).
export * from './home-api.schema';
// Tarif detayı — tarif varlık şemasından türer; satır fiyat/stok alanları motorun vitrin
// indirgemesinin aynasıdır (gerekçe dosya başlığında).
export * from './recipe-api.schema';
// Paket detayı — bundle/ürün varlık şemalarından türer; tek fiyat kuralı ve `soldOut`suz kapsam
// dosya başlığında.
export * from './package-api.schema';
// Kurye — gün listesi, kapıda teslim/tahsilat, kanıt yükleme, gün kapanışı. Kaynağı
// `@lezzet/application`ın kurye kapıları; kanıt ve kapanış varlık şemalarından türer.
export * from './courier-api.schema';
// Depo — hazırlık kuyruğu/onayı, mal kabul, sayım-düzeltme, transfer, kurye dönüşü (D1–D6).
// Kaynağı `@lezzet/application`ın depo kapıları; parti/kabul/transfer varlık şemalarından türer.
export * from './warehouse-api.schema';
// Bildirim — tablo değil, müşteriye giden mesajın veri şekli; üç yer okur (şablon `packages/email`,
// sürücü `packages/notify`, veriyi kuran uygulama kapısı).
export * from './notification.schema';
