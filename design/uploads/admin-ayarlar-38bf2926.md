# Admin — Ayarlar ve Kullanıcı/Rol Yönetimi

## 1. Amaç ve kullanıcı

İşletmenin parametrik değerlerinin tek yerden yönetildiği ve sistem kullanıcılarının (rollerin) tanımlandığı yer. Sistemdeki eşik/limit/varsayılan hiçbir değer koda gömülü değildir — hepsi buradan değişir. Kullanıcı: yönetici (admin).

## 2. İçerik envanteri — ne var, neden

- **Parametrik ayarlar — kapsam mantığıyla:** her ayarın bir **genel** değeri vardır; gereken ayarlar **kanala (B2B/B2C), bölgeye veya ülkeye göre** farklı değer alabilir (ör. minimum sepet B2B'de başka). Sistem en özgül değeri uygular, yoksa genele düşer. Kullanıcı bu mantığı "genel değer + istisnalar" olarak görür
- **Sipariş/teslimat ayarları** — minimum sepet tutarı; ücretsiz kargo eşiği; **sipariş kesim saati** (sonrası ertesi rota gününe); **teslim onayı kapsamı** (imza/foto kimden istenir — B2B varsayılan zorunlu, B2C kapalı); **teslimat özeti e-postası** (otomatik gönderim açık/kapalı)
- **Ödeme ayarları** — online ödemede stok bekletme süresi (ödeme tamamlanmazsa stoğun serbest kalacağı süre, varsayılan 30 dk — altına inemez, ödeme sağlayıcının asgarisi); **kapıda ödeme tavanları** (genel kötüye-kullanım tavanı + nakit için yasal sınır uyarı eşiği ~1.000€); vade süresi varsayılanı (30 gün)
- **Stok/tazelik ayarları** — yaklaşan son tarih eşiği (kalan ömür %, varsayılan %25); önerilen indirim oranı (%30); girişte tazelik kabul eşiği (kalan ömür %, varsayılan %75); KDV varsayılanları
- **Puan/sadakat ayarları** — hangi aksiyon kaç puan (yorum, beğeni anketi, sipariş…); puanın kupona çevrim eşiği ve oranı
- **Kâr hesabı birim maliyetleri** — rota teslimatı sipariş başı birim maliyet; paketleme (soğuk zincir) birim maliyeti; ödeme komisyon oranları — kâr raporlarının girdileri; burada güncellenir, geçmiş siparişlerin sabitlenmiş rakamlarını değiştirmez
- **Her ayarda:** anlaşılır ad + kısa açıklama ("bu neyi etkiler"), geçerli değer, varsayılanı; değişikliğin kimin tarafından ne zaman yapıldığı izi
- **Kullanıcı/rol yönetimi** — sistem kullanıcıları listesi: ad, iletişim, roller (yönetici / depo sorumlusu / kurye), aktiflik. Bir kişi birden çok rol taşıyabilir (başlangıçta her şey tek kişide). Rolün ne görebildiği sabittir (depo fiyat görmez, kurye yalnız kendi teslimatını görür) — burada rol atanır, izin detayı icat edilmez

## 3. Aksiyonlar

- Ayar değerini değiştirme (etkisi anlaşılır biçimde; yanlışlıkla değişime karşı bilinçli onay)
- Bir ayara kanal/bölge/ülke istisnası ekleme veya kaldırma
- Varsayılana döndürme
- Kullanıcı ekleme/pasifleştirme; rol atama/değiştirme

## 4. Durumlar ve varyasyonlar

- **Yalnız genel değer / istisnalı değer** — istisnasız ayar sade görünmeli; istisna varlığı açıkça belli olmalı ("B2B için farklı")
- **Sınırlı değerler** — bazı ayarların alt/üst sınırı vardır (ör. stok bekletme süresi 30 dk altına inemez); sınır ihlali anında ve anlaşılır reddedilir
- **Riskli değişiklik** — geniş etkili ayarlar (minimum sepet, kesim saati) değişmeden önce etki özeti hatırlatılır
- **Tek kullanıcı hali** — başlangıçta tüm roller tek kişide; kullanıcı listesi bu halde de doğal durmalı
- Pasifleştirilen kullanıcının geçmiş kayıtları silinmez, yalnız erişimi kapanır

## 5. Akış bağlantıları

Gelinen: admin ana menü; ilgili sayfalardan bağlam köprüleri (rotalardan kesim saatine, stoktan tazelik eşiklerine, raporlardan birim maliyetlere).
Gidilen: değişikliğin etkilediği sayfaya dönüş.

## 6. Yapmaması gerekenler

- İç anahtar adları ("TTL", "cut_off", "scope_type", "MLOR", "Setting") arayüzde görünmez — her ayar insan diliyle adlandırılır ve açıklanır
- Bu sayfa iş verisi yönetmez: ürün, fiyat, bölge tanımı, müşteri vadesi kendi sayfalarındadır — buraya yalnız sistem-geneli parametreler girer
- Rol izin matrisi düzenlenmez — roller sabit kalıplardır; "özel izin seti" karmaşası kurulmaz
- Geçmişe etki vaadi verilmez — ayar değişikliği geleceğe uygulanır; sabitlenmiş sipariş rakamları değişmez, arayüz bunu ima etmez
- Depo/kurye rolleri bu sayfayı hiç görmez

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: ayarlara seyrek ama bazen aciliyetle girilir ("bugün minimum sepeti düşür", "kesim saatini kaydır") — tek ayarı bulup değiştirmek telefonda hızlı olmalı
- Ayar sayısı fazladır; arama/bulma işlevsel ihtiyaçtır
- Kullanıcı/rol işlemleri nadirdir; nadir kullanımda bile yanlış anlaşılmaya yer bırakmamalı (yanlış rol ataması veri görünürlüğünü değiştirir)
