# 09 — Admin Yüzeyi: Komponentler ve Sayfalar

## Kapsam

Yönetim panelinin inşası: önce Claude Design'dan gelen **operasyon evreni komponent envanteri** kodlanır, sonra sayfalar bu parçalardan kurulur (`design/pages/admin-*.md` birebir). Bu modülün sayfaları: dashboard, ürünler, fiyatlar, siparişler (elle giriş dahil), müşteriler, B2B onay, talepler, stok görünümü, tedarik/satın alma, rotalar, ayarlar. **Para/raporlar `12`'de, analitik `13`'te, WhatsApp izleme `15`'te, geri bildirim yönetimi `17`'de** — aynı komponent setini kullanırlar ama burada kodlanmazlar. İş mantığı yazılmaz — sayfalar 05-07'nin servislerini ve domain-core'u çağırır. Telefon önceliklidir (STACK §7 cihaz çatallanması).

## Okunacaklar

- `design/pages/admin-*.md` (bu modüldeki 11 sayfa) + operasyon evreni komponent envanteri (Claude Design çıktısı)
- `DOMAIN.md §2` (roller/izinler), `§5` (fiyat/pazarlık), `§7` (vade/limit), `§10` (B2B onay, birleştirme), `§16` (tedarik)
- `STACK.md §7` (guard + sayfa deseni), `§9` (primitif/adaptör), `§13` (admin yüzey izolasyonu — **taslak, netleşecek**)
- `FEATURES.md` (Yönetim/admin, Tedarik, GDPR silme)

## Bağımlılık

`04-auth-kimlik` (guard'lar), `05-katalog`, `06-stok`, `07-siparis` bitmiş olmalı. Ayrıca **tasarım onayı sayfa sayfa bağlayıcıdır**: onaylanmamış sayfa kodlanmaz; envantere girmemiş komponentle sayfa kurulmaz (`design/README.md` çalışma sırası).

## Başlarken verilecek izah (örnek)

> "Yönetim panelini kuruyoruz. Önce tasarımdan gelen parça listesini (buton, kart, liste, form alanı, uyarı gibi) tek tek kodluyoruz; sayfalar sonra bu hazır parçaların birleşimi oluyor — böylece her ekran aynı görünür ve bir parçayı düzeltince her yer düzelir. Panel telefon öncelikli: patron çoğu işi telefondan yapacak. Sayfalar iş kuralı içermez; kararları daha önce yazdığımız motora ve servislere sorar. Panel adresi arama motorlarına kapalı ve her istekte oturum+rol kontrolünden geçiyor."

## Görevler

- [ ] (09.1) **[Önce netleştir]** Route izolasyonu: `(admin)` route group + `/admin` middleware'de toptan oturum+rol kontrolü (sayfa içi guard tekrarıyla çift kat) + `noindex` — STACK §13 taslak notu gereği seçenekler konuşulup karar alınır, sonra kodlanır
  - *Bitti:* oturumsuz/rolsüz istek middleware'de dönüyor; `/admin` yanıtları noindex başlığı taşıyor
- [~] (09.2) **Operasyon evreni komponent envanteri** — envanterdeki her komponent varyant ve durumlarıyla (normal/devre dışı/yükleniyor/hata/boş) `components/ui` + `components/form` katmanında kodlanır; iç galeri sayfasında hepsi görülür
  - *Bitti:* envanter listesi ile kodlanan komponentler birebir; galeri sayfasında her varyant/durum görsel olarak duruyor
- [ ] (09.3) **Dashboard** — bugünün siparişleri, bekleyen işler (B2B başvuru, limit aşan vadeli, açık talep, yaklaşan tarihli parti), kritik göstergeler, gecikmiş vade, uyuşmayan kapanış; hepsi ilgili ekrana köprü
  - *Bitti:* her bekleyen iş sayacı gerçek sorgudan geliyor; boş kuyruk "temiz" halini gösteriyor
- [~] (09.4) **Ürünler** · `touches: apps/web/app/(operations)/operations/products/**` · **beyan alanları 05.10'a bağlı** — ürün/varyant/kategori/koleksiyon/paket CRUD; çok dilli giriş + AI çeviri önerisi (öneri düzenlenebilir/reddedilebilir); **yasal beyanların tamamı** (içindekiler · alerjen sabit listesi · çapraz bulaşma · besin değerleri · saklama-hazırlama) + kapak ve galeri görselleri; aday ürün etkinleştirme; paket kalem fiyat doğrulaması
  - *Bitti:* atanmış fiyat toplamı ≠ paket fiyatı kaydı reddediliyor; AI önerisi onaysız yayına gitmiyor; müşteri ürün detay sayfasının **her** bölümünün girildiği bir yer var — "beyan eksik" göstergesi bu alanların hepsini sayar
- [ ] (09.5) **Fiyatlar** — kanal fiyatları + güncel maliyet/marj görünümü, marj-altı uyarı listesi, auto_price aç/kapa, müşteriye özel fiyat, müşteri indirim oranları görünümü
  - *Bitti:* fiyatı eksik varyant görünür; auto_price açık üründe elle fiyat yerine hedef marj düzenleniyor
- [ ] (09.6) **Fiyatlar: indirim/kupon + near-expiry teklif** — kupon/otomatik kampanya CRUD (koşullar, tek-en-büyük bilgisi), kişisel kuponlar; teklif önerisi listesi → teklif açma/güncelleme/kapatma (önerilen %30 parametrik; karar admin'in)
  - *Bitti:* teklif açılan parti müşteri tarafında tek fiyat + miktar tavanıyla görünüyor; parti tükenince teklif kalkıyor
- [ ] (09.7) **Siparişler: liste + detay** — filtre/arama (durum, ödeme, kanal, kaynak, gün), dikkat isteyenler; detayda kalemler (paket gruplu), yalnız izinli durum geçişleri, ödeme/tahsilat görünümü, teslim kanıtı, bağlı talepler, iade başlatma
  - *Bitti:* izin verilmeyen geçiş hiç sunulmuyor; iptalde otomatik iade bilgisiyle akıyor
- [ ] (09.8) **Siparişler: elle giriş** — müşteri bul-veya-oluştur; kalem fiyatı liste fiyatıyla dolu gelir, **pazarlıklı fiyat üstüne yazılır** (yalnız admin; liste fiyatı + kim/ne girdi iz kaydı); marj-altı uyarı engelsiz; door hızlı satış (`draft → completed`); hediye işareti
  - *Bitti:* pazarlık iz kaydından "kapıda verilen indirim" türetilebiliyor; hızlı satışta stok fiiliden anında düşüyor
- [ ] (09.9) **Müşteriler: liste + detay** — telefon/ad arama, daraltmalar; detayda kimlik/adresler, sipariş geçmişi, **vade/limit yönetimi** (açık bakiye ve gecikme türetilmiş), **ödeme karnesi** (ciro, ort. ödeme günü, gecikme — karar admin'in), cod_allowed, fiyat ilişkisi, izin görüntüleme (salt-okunur), edinim bilgisi
  - *Bitti:* limit/vade değişiklikleri anında checkout kararına yansıyor; karne alanları sipariş verisinden hesaplanıyor
- [ ] (09.10) **Müşteriler: birleştirme + GDPR silme** — birleştirmede hedef/kaynak ve taşınacaklar onaydan önce net; RPC ile siparişler/puanlar/konuşmalar taşınır, kaynak kapanır. GDPR silme: kişisel veri silinir/anonimleşir, sipariş kayıtları muhasebe bütünlüğü için kalır; iki işlem de bilinçli onaylı
  - *Bitti:* birleştirme sonrası kaynak müşteriyle hiçbir aktif bağ kalmıyor; silinen müşterinin siparişleri anonim duruyor
- [ ] (09.11) **B2B onay** — kuyruk + kontrol kartı: Sirene/Annuaire verisi (aktiflik, faaliyet kodu, kuruluş yılı), adres-rota uyumu, mükerrer kontrolü, DE'de VIES sonucu, `packages/ai` tek cümle özet, Google/Haritalar linki; tek dokunuş onay/ret (yanlışlıkla tetiklenmez)
  - *Bitti:* onay toptan fiyatı açıyor ama vade açmıyor; API ulaşılamazsa kart "doğrulanamadı" halini gösteriyor
- [ ] (09.12) **Talepler** — kuyruk (durum/tip daraltma, AI'nın yanıtladıkları ayırt edilir) + detay (sipariş bağı, kalemler, fotoğraflar, yazışma); cevap → e-posta bildirimi; iade tetikleme köprüsü; AI'dan devralma; elle talep açma
  - *Bitti:* durum döngüsü `open → in_progress → resolved` (yeniden açılabilir) çalışıyor; devralınan talepte AI susuyor
- [ ] (09.13) **Stok görünümü** — varyant bazında fiili/ayrılmış/kullanılabilir; parti listesi (kalan raf ömrü %, lot, konum, alış fiyatı); yaklaşan tarihli uyarılar + teklif kararı (fiyatlar sayfasıyla aynı karara çıkar); **lot/geri çağırma sorgusu** ("bu parti kimlere gitti" — OrderItemBatch'ten); imha/fire geçmişi
  - *Bitti:* lot numarasından sipariş+müşteri listesine tek sorguda ulaşılıyor; DLC'si geçmiş partide yalnız imha yolu görünüyor
- [ ] (09.14) **Tedarik / satın alma** — tedarikçi kartları (vade, türetilen borç), ürün-kod eşlemesi, "sipariş zamanı" önerisi (eşik altı, tedarikçiye gruplu) → tek dokunuş PO taslağı → temiz liste/PDF (gönderim insana ait) → durum takibi; satın alma kaydı (fiyatlı stok girişi, paketleme hesabı, PO'dan dolu form + fark)
  - *Bitti:* öneri → taslak → gönderildi → kabul zinciri uçtan uca; eksik gelen kalem fark olarak görünüyor
- [ ] (09.15) **Rotalar** — bölge CRUD (posta kodları + haftalık günler; bir kod tek bölge), günün rota listesi (hazırlık durumu bağlamıyla), kurye atama, siparişi başka güne taşıma, kesim saati etkisi görünümü
  - *Bitti:* bölge değişikliği checkout gün hesabına yansıyor; atanmamış sipariş listede ayırt ediliyor
- [ ] (09.16) **Ayarlar** — kapsamlı Setting yönetimi (genel değer + kanal/bölge/ülke istisnaları; anlaşılır ad/açıklama; alt sınır kontrolü — TTL 30 dk altına inemez; değişiklik izi) + kullanıcı/rol yönetimi (çoklu rol, pasifleştirme)
  - *Bitti:* istisna eklenen ayar çözücüde globali eziyor; sınır ihlali anlaşılır reddediliyor

## Netleşecekler

- **Admin izolasyon ayrıntısı (STACK §13 taslak):** middleware kapsamı, anon key'in tarayıcı kapsamı, RLS'nin admin tablolarındaki rolü — ilk görevden önce tek konuşmada karar.
- **Sirene tarafında hangi uç:** Annuaire des Entreprises / Sirene API seçimi ve alan eşlemesi (ücretsiz uçlar; kayıt akışı 04/08'de kuruluysa aynı istemci kullanılır).

---

**Modül durumu (26.07.2026):** ürün/katalog ekranları çalışıyor, gerisi açık.
- **Var:** `/operations/products` — ürün listesi + form (RHF, çok dilli sekmeler, alerjen, varyant düzenleyici, görsel yükleme), kategori/koleksiyon CRUD + sürükle-bırak sıralama + koleksiyon üyeliği, cihaz çatallı düzen (desktop/mobile), operasyon komponent kütüphanesi (`components/operation/ui` + `form`), 404/500 ekranları.
- **Kısmi:** komponent envanteri — kullanılan komponentler yazıldı, iç galeri sayfası yok. Ürünler — paket (Bundle) CRUD ve aday ürün etkinleştirme yok; AI çeviri önerisi UI'da bağlı ama arka ucu bilinçli stub (`packages/ai` boş).
- **Token katmanı (27.07):** operasyon `§0` envanterle birebir yeniden kuruldu — 9 kademeli gri skalası, **yeni mavi aile** (bilgi/aday kayıt), her ailenin koyu/kenarlık/nokta katmanları, etkileşim durumları. 54 ham hex kullanımı + 12 sabit `bg-white`/`text-white` token'a çevrildi; **operasyon yüzeyinde ham hex kalmadı.**
- **Karanlık mod (27.07):** envanter §0.6 değerleriyle kuruldu — token ADLARI değişmez, yalnız değerleri döner; hiçbir bileşene dokunulmadı. Tercih üç değerli (sistem · açık · koyu), sidebar'ın dibindeki **tema anahtarıyla** seçilir ve `localStorage`'ta yaşar; `<html data-theme>` boyamadan önce `ThemeScript` ile yazılır (FOUC yok). CSS tek blok: koyu değerler iki kez yazılmaz.
- **Dialog ayrışması düzeltildi (27.07):** örtü `bg-[rgba(…)]` keyfi değeriyle yazıldığı için Tailwind sınıfı **hiç üretmemiş** — dialog arkası tamamen şeffaftı (koyu temada panel sınırı büsbütün kayboluyordu). Örtü `ops-scrim` token'ına bağlandı (koyuda daha koyu), panel zemini envanterin dediği `ops-white`'a (kart-altı → sayfa ve karttan açık) alındı, 1px kenarlık eklendi.
- **Engel:** yasal beyan alanları (içindekiler/besin/saklama/çapraz bulaşma) ve galeri — veri modeli 26.07'de `DATA_MODEL`'e yazıldı, migration + şema + form tasarımı bekliyor (bkz. `BACKLOG §3`).
