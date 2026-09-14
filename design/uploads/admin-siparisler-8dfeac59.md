# Admin — Siparişler

## 1. Amaç ve kullanıcı

Tüm siparişlerin izlendiği, yönetildiği ve gerektiğinde elle girildiği ekran: liste + sipariş detayı + yeni sipariş girişi. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

### Liste

- **Sipariş satırı** — referans no, müşteri, tutar, durum, ödeme durumu, teslimat günü/tipi; günlük operasyonun ana görünümü
- **Filtre/arama** — durum, ödeme durumu, kanal (B2B/B2C), kaynak (web/whatsapp/door/manual), teslimat günü, tarih aralığı, müşteri adı/telefon. "Bugün teslim edilecekler" ve "ödemesi bekleyenler" en sık sorgulardır
- **Dikkat isteyenler** — limit aşan vadeli sipariş (admin onayı bekler), gecikmiş vadeli ödeme, iade sürecindeki siparişler ayırt edilebilmeli

### Detay

- **Sipariş kimliği** — referans no, kanal, kaynak, tarih, hediye işareti; sonradan eşleşen resmî fatura no
- **Müşteri ve teslimat** — müşteri (detayına köprü), adres (sipariş anındaki kopyası), teslimat tipi (rota/kargo), teslimat günü, atanmış kurye
- **Kalemler** — ürün/varyant, adet, karşılanan adet (eksikte düşer), sabitlenmiş birim fiyat, kalem indirim payı, paket grubu (paketten gelen kalemler paket adıyla gruplu görünür); toplam, indirim, kargo ücreti
- **Durum ve geçmişi** — mevcut durum + izinli geçişler; her geçişin kim/ne zaman kaydı (audit). Geçişler esnektir ama serbest değildir — yalnız izin verilenler sunulur
- **Ödeme** — ödeme durumu (türetilir: tahsil − iade vs karşılanan tutar), yöntem, tahsilat/iade hareketleri; vadeli siparişte vade bilgisi
- **Teslim kanıtı** — varsa imza/foto, onaylayan, zaman ("eksik geldi" ihtilafının sigortası)
- **Bağlı talepler** — bu siparişe açılmış talep varsa görünür

### Elle sipariş girişi (manual / door)

- **Müşteri seçimi** — telefon/ad ile bul-veya-oluştur; kanal müşteriden otomatik türetilir, elle seçilmez
- **Kalem girişi** — ürün/varyant + adet; **fiyat alanı liste fiyatıyla dolu gelir** (müşteriye göre çözülmüş), pazarlık varsa üstüne yazılır. **Pazarlıklı fiyat yalnız yetkili (admin) girer**; liste fiyatı neydi görünür kalır, kim ne girdi iz kaydına yazılır. Girilen fiyat hedef marjın altındaysa **uyarı gösterilir ama işlem engellenmez** — karar satıcının
- **Kapı önü (door) hızlı satış** — tek akışta: ürün seç → ödeme al → kapat; ara durumlar atlanır, stok anında düşer
- **Hediye sipariş işareti** — patron ikramı; operasyon ve iç muhasebe tam normal, yalnız muhasebe export'una girmez — işaretin anlamı girişte net olmalı

## 3. Aksiyonlar

- Durum değiştirme (yalnız izinli geçişler); iptal — ödenmişse tutarın tamamının otomatik iade edildiği bilgisiyle
- İade sürecini başlatma (teslim sonrası iade/hasar; kısmi iadede kalem ve adet seçilir, fark indirimli birim fiyattan iade edilir)
- Kalem düzenleme (henüz hazırlanmamış siparişte ekleme/çıkarma/adet değiştirme; stok yeniden ayrılır/bırakılır)
- Elle sipariş girme (manual/door), pazarlıklı fiyat girme (yalnız yetkili)
- Müşteri detayına, bağlı talebe geçme

## 4. Durumlar ve varyasyonlar

- **Tam yol / hızlı satış** — aynı sipariş varlığı, farklı geçişler; hızlı satışta ara durumlar hiç görünmez
- **B2B / B2C** — B2B'de vade bilgisi ve teslim kanıtı beklenir; B2C'de çoğu zaman yok
- **Kısmi karşılama** — sipariş edilen ≠ karşılanan; fark ve para çözümü (otomatik iade veya düşük tahsilat) anlaşılır olmalı
- **Limit aşan vadeli sipariş** — admin kararı bekler: tek seferlik onay veya müşteri limitini artırma (müşteri detayına köprü)
- **Ulaşılamadı / reddedildi** — yolda dönen siparişler; stok etkisinin depoya girişte işlendiği bilinmeli, admin kapıda stok düzeltmeye çalışmamalı
- **Boş liste** (filtre sonucu) ve yoğun gün (onlarca sipariş) halleri

## 5. Akış bağlantıları

Gelinen: dashboard (bugünün siparişleri, limit aşan vadeli), müşteri detay (siparişleri), talepler (bağlı sipariş), stok (bu parti kimlere gitti).
Gidilen: müşteri detay, talep detay, elle sipariş girişi; iade akışı buradan tetiklenir.

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; depo hazırlık listesini, kurye kendi teslimatlarını ayrı ekranlarında görür — fiyat/marj/pazarlık bilgisi o yüzeylere taşınmaz. Kurye fiyat değiştiremez — fiyat sipariş oluşurken bellidir
- Parti/lot detayı sipariş listesinde ve kaleminde öne çıkmaz — parti karmaşıklığı depo hazırlık ekranının işidir; burada yalnız iz sürme gerektiğinde (iade/geri çağırma bağlamında) erişilir
- Ödeme durumu elle set edilmez — türetilir; ekran "durumu değiştir" değil, tahsilat/iade gerçeğini gösterir
- İzin verilmeyen durum geçişi hiç sunulmaz — hata mesajıyla öğretmek yerine seçenek baştan yoktur
- Müşteri-yüzü sipariş diliyle iç dil ayrışır: müşteriye giden bildirimlerin metni bu ekranın iç terimlerinden (rezervasyon, marj, pazarlık) beslenmez

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: durum değiştirme, günün siparişlerini süzme ve **kapı önü hızlı satış** telefonda tek elle, hızla yapılmalı — hızlı satış depo kapısında müşteri beklerken kullanılır
- Elle sipariş girişi (telefonla gelen siparişi yazma) telefonda pratik olmalı; çok kalemli B2B girişi masaüstünde de rahat akmalı
