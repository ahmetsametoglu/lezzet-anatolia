// Sözleşmeler burada, çünkü üreten ile tüketen aynı şemayı çağırınca alan adı değişikliği iki tarafı derlemede kırar. Uç ya da
// şablonun ne alıp ne döndürdüğü buraya, tablonun kolonları `../entities`e girer.
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
// B2B başvurusu — resmî kayıt okuması + AB vergi doğrulaması + başvurunun yazımı/durumu. Alan
// denetimi ŞEMADA DEĞİL motorda; bağ uçta derleme kilidiyle kurulur (gerekçe dosya başlığında).
export * from './b2b-api.schema';
// Keşif turu — aday ürün destesi + kaydırma + ziyaretçi turunun hesaba bağlanması. Kart katalog
// kartından TÜRETİLMEZ: aday ürün fiyat/stok/varyant taşımaz (gerekçe dosya başlığında).
export * from './discover-api.schema';
// Yer çözümü — onboarding posta kodu adımı; dört hâl ayrık, depo kimliği bilerek dışarıda (19.9).
export * from './place-api.schema';
// İlan edilen teslimat tutarları — bilgi metinlerinin okuduğu ayarlar; sepetin kapsamıyla
// karıştırılmaz (gerekçe dosya başlığında).
export * from './delivery-terms-api.schema';
// Katalog — kategori/ürün/varyant/stok varlık şemalarından türer.
export * from './catalog-api.schema';
// Vitrin (ana ekran) — katalog kartını ve kategori/koleksiyon/tarif varlık şemalarını türetir;
// yalnız müşteriden bağımsız bölümler.
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
export * from './courier-return-api.schema';
// Depo — hazırlık kuyruğu/onayı, mal kabul, sayım-düzeltme, transfer, kurye dönüşü (D1–D6).
// Kaynağı `@lezzet/application`ın depo kapıları; parti/kabul/transfer varlık şemalarından türer.
export * from './warehouse-api.schema';
// Sepet gövdesi fiyat taşımaz, çünkü istemcinin yazabildiği tutar siparişin parasını belirleyemez. Cevap görünüm değil satırdır:
// toplam iki yerde hesaplanırsa bir gün iki farklı sayı gösterir.
export * from './cart-api.schema';
// Checkout — "Siparişi tamamla" ekranının anlık görüntüsü (adres · teslimat · ödeme) + siparişi
// açan gövde ve ADLI retleri. Gövde yalnız SEÇİM taşır: tutar, kargo ücreti, indirim ve teslimat
// türü istemciden hiç kabul edilmez, hepsi sunucuda çözülür.
export * from './checkout-api.schema';
// Bildirim — tablo değil, müşteriye giden mesajın veri şekli; üç yer okur (şablon `packages/email`,
// sürücü `packages/notify`, veriyi kuran uygulama kapısı).
export * from './notification.schema';
// Davet karşılaması — paylaşılan davet bağlantısı uygulamada açıldığında sorulan tek soru. Dört
// hâl ayrık; getirenin YALNIZ adı geçer, kimlik alanları sözleşmede hiç yok (gerekçe dosyada).
export * from './invite-api.schema';
// Canlı zilin istemciye bakan yüzü — kanal adı + olay adı. Şema değil, iki dizgelik sözleşme:
// zili çalan sunucu ile onu duyan İKİ istemci (web · native) aynı adı bilsin diye (gerekçe dosyada).
export * from './me-notifications.schema';
export * from './realtime.contract';
// WhatsApp bağı — doğrulanmış numaralar ve bağlama kodu; kodu tüketen webhook'tur.
export * from './me-whatsapp.schema';
// Sosyal gelen kutusu — üç Meta kanalının mobil operasyon yüzü (kuyruk · sohbet · cevap · mod ·
// taslak). Varlık şemasından `pick` ile türer; ham alan taşır, hesaplanmış etiket taşımaz.
export * from './social-api.schema';
// Yerinde satış — depo kapısı ve kuryenin aracı. Depo ve müşteri gövdede YOK: ilki
// personelin künyesinden, ikincisi anonim alıcıdan gelir; ikisini de istemciye sormak, kararı
// istemciye vermek olurdu.
export * from './sale-api.schema';
// Yönetim + Para bölümleri — karar kuyruğu, gün özeti, tahsilat izleme, gün sonu mutabakatı.
export * from './management-api.schema';
export * from './money-api.schema';
// Operasyon KABUĞU — bölümlerin değil, kabuğun kendi künyesi (personelin çalıştığı tesis).
export * from './operations-api.schema';
