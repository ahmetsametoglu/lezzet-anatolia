# Design Zemini — Claude Design İçin

Bu klasör **Claude Design'a verilecek** tasarım girdilerini içerir. Her sayfa için ayrı bir markdown dosyası vardır (`pages/`); bu dosya bir kez okunan ortak zemindir.

> **Kural:** Bu dosyalar mimari dokümantasyondan (`docs/architecture/`) türetilmiştir ve **kendine yeterlidir** — Claude Design mimari doküman okumaz. Çelişki görünürse mimari kazanır; dosya güncellenir.

## Ürün ve kitle

**Lezzet Anatolia** — Strasbourg merkezli donuk Türk gıdası satış sistemi. İki müşteri tipi: **B2C** (son tüketici; Türk diasporası + yerel Fransız/Alman müşteri) ve **B2B** (restoran/market; toptan fiyat, hacimli sipariş). Satış: web sitesi + WhatsApp; teslimat: kendi aracıyla rota içi kapı teslimi veya kargo.

**Diller:** TR / FR / DE. Sayfa **her an tek dilde** görüntülenir — dil URL'den gelir, kullanıcı dil değiştirebilir. "Çok dilli" demek aynı ekranda birden çok dil demek **değildir**; tasarım tek dilli ekran tasarlar, ama metinler üç dilde de var olacağı için uzunluk farkına dayanıklı olmalıdır (Almanca uzun yazılır).

## Altın kural

**Sade ve anlaşılır.** Sistemin içindeki karmaşıklık (parti takibi, rezervasyon mantığı, KDV işlemleri, türetilmiş durumlar) **arayüze sızmaz**. Her ekran, kullanıcısının sezgisine uyar: müşteri alışveriş yapar, depocu hazırlar, kurye teslim eder, admin yönetir — hiçbiri sistemin iç modelini öğrenmek zorunda kalmaz.

## Stil ve sunum kararları Claude Design'ındır

- Stil **verilmiyor** — renk, tipografi, doku, karakter tamamen Claude Design'ın kararı.
- **Sunum kararları da verilmiyor.** Biz her sayfa için yalnız **hangi bilgi/aksiyon var ve neden** olduğunu söyleriz. O bilginin **nasıl** gösterileceği — hiyerarşi, gruplama, katlama/açma, hangi komponent, hangi etkileşim deseni — tamamen Claude Design'ın kararıdır. Claude Design bu kararları **uzman bir tasarımcı ve kullanıcı deneyimi uzmanı** gözüyle verir: kullanıcının sezgisel hareketini düşünür, hangi bilgi öne çıkarsa hangi bilgi geride durursa sayfanın daha sade ve anlaşılır olacağını kendisi tartar. Bu sorumluluğun kendisinde olduğunu bilir ve bu konuda **dikkatli** davranır — altın kural (sadelik) her sunum kararının ölçütüdür.
- Bu ilke **bütün yüzeyler için** geçerlidir — müşteri kadar admin/depo/kurye tarafı da: formlar, diyaloglar ve kullanıcıyla etkileşen her komponent kurgulanırken **bir bakışta kavranabilirlik** hedeflenir; bunun için gruplama, renklendirme, ayırma, sıralama gibi bütün yaklaşımları Claude Design kendisi seçer ve uygular. Operasyon ekranı "iç araç" diye özensiz bırakılmaz — tam tersine, hız ve hatasızlık için en dikkatli kurgulanan yerdir.
- Sayfa dokümanlarında yanlışlıkla bir sunum önerisi kalmışsa **bağlayıcı değildir**; içerik listesi bağlayıcıdır.
- **Admin/operasyon tarafı ile müşteri tarafı farklı stillerde kurgulanabilir** (iki ayrı stil evreni serbest): müşteri tarafı marka/iştah/güven anlatır, operasyon tarafı hız ve netlik ister.
- Her sayfa **web ve mobil** için özelleşir. Operasyon ekranları (admin, depo, kurye) **telefon önceliklidir**.

## Komponent bazlı tasarım (zorunlu yaklaşım)

Tasarım, tekrar eden **komponentlerden** kurulur — buton, kart, form alanı, tablo/liste, durum rozeti, boş-durum, uyarı, modal vb. Sayfalar bu parçaların kompozisyonudur.

- Claude Design, tasarımın yanında bir **komponent envanteri sayfası** üretir: her komponentin adı, varyantları (ör. buton: birincil/ikincil/tehlike), durumları (normal/hover/devre dışı/yükleniyor/hata) ve hangi sayfalarda kullanıldığı.
- **Neden:** biz önce komponentleri kodlayacağız, sayfaları bu kodlanmış parçalarla inşa edeceğiz. Admin/operasyon tarafında bu yaklaşım kesindir; müşteri tarafında da mümkün olduğunca aynı disiplin uygulanır (sayfaya özgü serbest bölgeler olabilir, ama form/liste/kart gibi parçalar ortak kalır).
- İki stil evreni (müşteri / admin) **ayrı komponent setleri** olabilir; her evrenin kendi envanteri çıkar.

## Çalışma sırası — sayfa sayfa, onaylı ilerleme

- Tasarım **tek seferde her şey üretilerek yapılmaz.** Sayfa sayfa ilerlenir: bir sayfa tasarlanır → kullanıcıya sunulur → beğenilmezse revize edilir → **onaydan sonra** sıradaki sayfaya geçilir.
- **Başlangıç kritiktir:** her stil evreni için önce **tek bir temsilî sayfayla tasarım dili kurulur** (öneri: müşteri evreni için ürün detay, admin evreni için sipariş listesi/detay). Dil onaylanmadan o evrende başka sayfa üretilmez — beğenilmeyen bir dille 20 sayfa üretmek, 20 sayfa çöpe atmaktır.
- **Komponent envanteri onaylı sayfalardan adım adım büyür.** Yeni sayfa mümkün olduğunca mevcut (onaylanmış) komponentleri kullanır; yeni komponent gerekiyorsa bu açıkça belirtilir ve envantere eklenir.
- Sonradan gelen bir geri bildirim bir komponenti değiştirirse, o komponenti kullanan **önceki sayfalara etkisi** açıkça söylenir — sessiz tutarsızlık bırakılmaz.

## Faz yok (kapsam kuralı)

Yapım sırası bizde fazlıdır ama **tasarım kapsamında faz yoktur**: `pages/` altındaki **tüm** sayfalar tasarlanır — hiçbir sayfa "ileriki faz" diye atlanmaz. Süreç yine yukarıdaki gibi **sayfa sayfa ve onaylıdır**; "faz yok" kapsamı anlatır, "hepsini bir anda üret" demek değildir.

## Sayfa dokümanı şablonu

Her `pages/*.md` dosyası şu başlıkları taşır:

1. **Amaç ve kullanıcı** — sayfa tek cümlede ne işe yarar, kim kullanır (rol)
2. **İçerik envanteri** — sayfada hangi bilgiler var ve **neden**
3. **Aksiyonlar** — kullanıcı ne yapabilir
4. **Durumlar ve varyasyonlar** — boş/dolu/hata; B2B–B2C farkı; önemli kenar durumları
5. **Akış bağlantıları** — bu sayfaya nereden gelinir, nereye gidilir
6. **Yapmaması gerekenler** — bu sayfada asla görünmeyecek bilgiler (karmaşıklık sızıntısı önlemi)
7. **Web / mobil notları** — yalnız **işlevsel** farklar ve kullanım bağlamı (ör. "kurye sahada tek elle, eldivenle kullanır"); yerleşim/etkileşim kararı tasarımcınındır

## Sayfa listesi

### Müşteri (vitrin) — kendi stil evreni
| Dosya | Sayfa |
| --- | --- |
| `musteri-anasayfa.md` | Ana sayfa / vitrin |
| `musteri-katalog.md` | Katalog: kategori + arama/filtre listesi |
| `musteri-urun-detay.md` | Ürün detay (varyant, indirimli teklif, yorum/skor) |
| `musteri-paket-detay.md` | Paket (bundle) detay |
| `musteri-sepet.md` | Sepet |
| `musteri-checkout.md` | Checkout: teslimat + ödeme + hızlı doğrulama (misafir) |
| `musteri-hesap.md` | Hesap: profil, adresler, dil, izinler, puanlar |
| `musteri-siparisler.md` | Sipariş listesi + tek tuş tekrar sipariş |
| `musteri-siparis-detay.md` | Sipariş detay + durum + "bir sorun mu var?" |
| `musteri-talep.md` | Talep/şikâyet oluşturma ve takip |
| `musteri-kesif.md` | Keşif/swipe: aday ürün beğenisi |
| `musteri-geri-bildirim.md` | Alım-sonrası anket (link ile gelinen akış) |
| `musteri-professionnels.md` | B2B self-servis kayıt (SIRET'li) |
| `musteri-statik.md` | Statik/yasal sayfa şablonu + SSS |
| `musteri-giris.md` | Giriş / hızlı doğrulama (Google, e-posta OTP) |

### Admin (yönetim) — kendi stil evreni, komponent disiplini kesin
| Dosya | Sayfa |
| --- | --- |
| `admin-dashboard.md` | Genel bakış: bugünün siparişleri, uyarılar, kritik göstergeler |
| `admin-urunler.md` | Ürün/varyant/kategori/koleksiyon/paket yönetimi (çok dilli giriş + AI çeviri) |
| `admin-fiyatlar.md` | Fiyat yönetimi: kanal, müşteriye özel, hedef marj/uyarılar |
| `admin-siparisler.md` | Sipariş listesi + detay + elle sipariş girişi (pazarlıklı fiyat dahil) |
| `admin-musteriler.md` | Müşteri listesi + detay (vade/limit, izinler, birleştirme, GDPR silme) |
| `admin-b2b-onay.md` | B2B başvuru onayı (kontrol kartı) |
| `admin-talepler.md` | Talep/şikâyet kuyruğu ve yazışma |
| `admin-stok.md` | Stok görünümü: partiler, yaklaşan tarihli, near-expiry teklif açma |
| `admin-satin-alma.md` | Stok girişi / tedarikçi / satın alma |
| `admin-para.md` | Para hareketleri, hesaplar, banka import |
| `admin-raporlar.md` | Kârlılık (ürün/kanal/fire), muhasebe export |
| `admin-analitik.md` | Analitik: kaynak/huni/kampanya ROI/segmentler + AI içgörü |
| `admin-geri-bildirim.md` | Yorum moderasyonu, ürün skorları, swipe analizi, puan yönetimi |
| `admin-rotalar.md` | Rota bölgeleri + gün planı + kurye atama |
| `admin-ayarlar.md` | Parametrik ayarlar + kullanıcı/rol yönetimi |
| `admin-whatsapp.md` | WhatsApp konuşma izleme (ajan devir alma dahil) |

### Depo — operasyon stil evreni (admin ile ortak olabilir)
| Dosya | Sayfa |
| --- | --- |
| `depo-hazirlik.md` | Sipariş hazırlama: FEFO parti önerisi + eksik işaretleme |
| `depo-stok-giris.md` | Mal kabul: parti + DLC + lot + MLOR uyarısı |
| `depo-imha-sayim.md` | İmha/fire/sayım düzeltmesi + sıcaklık kaydı |

### Kurye — operasyon stil evreni
| Dosya | Sayfa |
| --- | --- |
| `kurye-gun.md` | Günün teslimat listesi (rota sırası) |
| `kurye-teslimat.md` | Teslimat ekranı: teslim onayı (imza/foto), ulaşılamadı/reddedildi, tahsilat |
| `kurye-kapanis.md` | Gün kapanışı ve kasa mutabakatı |

### Ortak
| Dosya | Sayfa |
| --- | --- |
| `komponent-envanteri.md` | Claude Design'ın üreteceği envanterin beklenen biçimi (iki stil evreni için ayrı ayrı) |
