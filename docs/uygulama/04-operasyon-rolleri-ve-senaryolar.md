# 04 — Operasyon Rolleri ve Mobil Senaryolar (ön hazırlık, TASLAK)

> **Durum: kullanıcıyla tartışılıyor (07.08).** Operasyon yüzeyinin mobil tasarımına girmeden
> önce rol ve ihtiyaç envanteri. Yöntem kullanıcının önerisi: malın SATIN ALINMASINDAN müşteriye
> TESLİMİNE kadar tüm yolculuğu irdele, ardından şikâyet yönetimi ve satış verimliliğine uzan —
> görev birimleri kendiliğinden dökülür. Buradaki hiçbir madde ekran kararı DEĞİLDİR; bu doküman
> "kim, nerede, hangi işi, hangi cihazla" sorusunun envanteridir.

## 0. Ölçülen zemin (koddan — varsayım değil)

- **Personel rolleri DÖRT:** `admin · warehouse · courier · accounting`
  (`user-profile.schema.ts:53` `UserRoleEnum`; `customer` personel değil). Roller dizi —
  bir kişi birden çok rol taşıyabilir.
- **Sipariş durakları:** `draft → confirmed → preparing → ready → out_for_delivery →
  delivered → completed` (+ `cancelled`/`returned`) — `ORDER_LIFECYCLE`. Ödeme AYRI eksen
  (kapıda ödeme: teslim edildi ama ödeme bekliyor olabilir).
- **Depo bir DEĞİŞMEZ** (CLAUDE §1): personelin sabit deposu var; stok/kabul/sevk deposuz yazılamaz.
- **Modül envanteri** (docs/build): stok/kabul 06 · sipariş 07 · depo 10 · kurye-rota 11
  (teslim kanıtı 11.2 ✓) · para 12 · analitik 13 · bildirim 14 · WhatsApp 15 · talep/şikâyet 16 ·
  geri bildirim 17 · çoklu depo/transfer 19.
- **Tedarik modeli VAR** (ilk taslakta "yok" yazılmıştı — yanlış ölçüm, kullanıcı düzeltti 07.08):
  `0010_supply.sql` (supplier · supplier_product · purchase_order · mal kabul) + web operasyonda
  `operations/procurement/` ekranı. İlke (DOMAIN §16): **sistem önerir, siparişi İNSAN verir**;
  sistem tedarikçiye hiçbir şey göndermez.

## 1. Malın yolculuğu — aşama × görev × rol × "mobil mi?"

| # | Aşama | Görevler | Rol | Yer/An | Mobil ihtiyaç değerlendirmesi |
| --- | --- | --- | --- | --- | --- |
| A | **Satın alma kararı** | eksik ürün tespiti, öneri inceleme, tedarikçiye sipariş kaydı | admin | masa (+yolda karar) | **mobil ORTA, kapsamda**: model hazır (`purchase_order`) — "azalan stok uyarısı → öneriyi onayla → sipariş kaydı" mobil hızlı-aksiyon; kalem kalem kurma masada. Arka uçta eksik çıkarsa talep açılır (kullanıcı 07.08: arka uç varlığı plan kısıtı değildir) |
| B | **Mal kabul (intake)** | koli sayımı, SKT/parti girişi, fire/hasar notu, etiket | warehouse | depo rampası — MASADAN UZAK | **mobil ŞART adayı**: eldeki koli sayılırken masaüstüne yürünmüyor; fotoğraf (hasar kanıtı) cihaz kamerasıyla doğal |
| C | **Depolama & stok bakımı** | sayım/düzeltme, SKT taraması, yakın-SKT ayıklama, fire | warehouse | raf arası | **mobil güçlü**: sayım listesi elde; yakın-SKT taraması raf önünde yapılır |
| D | **Depolar arası transfer** | sevk kaydı, yolda/teslim alındı işaretleme (19) | warehouse (+taşıyan) | iki depo + yol | **mobil güçlü**: `received` işareti malın indiği rampada atılır, masada değil |
| E | **Sipariş hazırlama** | toplama listesi, eksik bildirme, `preparing→ready` | warehouse | raf arası | **mobil ŞART adayı**: toplama listesi eldeki cihazda; web masaüstünde kalıyor (kullanıcı kararı 06.08: operasyon webi yalnız masaüstü) |
| F | **Sevkiyat & rota** | rota görüntüleme, sıradaki durak, navigasyon | courier | araç/saha | **mobil ZORUNLU**: kuryenin masaüstü yüzeyi fiilen kullanılamaz — native'in varlık sebebi |
| G | **Teslim** | teslim kanıtı (foto/imza — 11.2 kapısı hazır), kapıda ödeme tahsilat işareti, teslim edilemedi akışı | courier | kapı önü | **mobil ZORUNLU**: kanıt fotoğrafı cihaz kamerası; ödeme eksende ayrı — "teslim + tahsilat" tek ekranda |
| H | **İade/hasar** | iade kabulü, hasar kaydı, stok dönüşü | courier (sahada) + warehouse (depoda) | kapı önü + rampa | **mobil güçlü**: kanıt yine kamera |
| I | **Müşteri iletişimi** | talep/şikâyet cevabı (16), WhatsApp (15), sipariş sorusu | admin | her yer/her an | **mobil güçlü**: bildirim gelir → kısa cevap yazılır; uzun içerik masada kalabilir |
| J | **Para & mutabakat** | kasa/tahsilat izleme, gün sonu, iade onayı (12) | accounting | masa ağırlıklı | **mobil ZAYIF**: okuma-özet yeter (gün cirosu, bekleyen tahsilat); yazma işleri masaüstünde |
| K | **Satış verimliliği** | analitik (13), fiyat/teklif kararı, yakın-SKT kampanyası, vitrin düzeni | admin | masa + yolda okuma | **mobil ORTA**: özet kartlar + acil müdahale (ör. "bugün SKT'si dolan 3 parti → indirime çek"); derin analiz masada |
| L | **Süreç tetikleyicileri** | yeni sipariş, stok eşiği, şikâyet, iade — anında haber | HEPSİ | her yer | **native'in kozu: push bildirim (14 ile koordineli)** — rol bazlı bildirim yönlendirmesi tasarımın omurgası |

## 2. İlk okuma — rol başına mobil profil (taslak)

- **courier — mobil olmadan ÇALIŞAMAZ.** Rota + teslim + kanıt + kapıda ödeme. En dar, en derin
  yüzey: az ekran, büyük düğme, tek elle, güneş altında okunur.
- **warehouse — mobil, masaüstünün önüne geçer.** Kabul + toplama + sayım + transfer. Liste-işaretle
  düzeni; ileride barkod/QR okuma (cihaz kamerası) doğal büyüme yolu.
- **admin — mobil TAMAMLAYICIDIR.** Bildirim → hızlı aksiyon (şikâyete cevap, siparişe müdahale,
  parti indirimi); kurulum/ayar/derin analiz masaüstünde kalır.
- **accounting — mobil yalnız OKUR.** Özet kartlar; yazma yok (v1'de belki hiç yok).

## 3. Kararlar (kullanıcı, 07.08)

1. **Kadro: bugün tek kişi çok şapka; İLERİDE her şapkaya bir kişi.** Tasarım sonucu: TEK birleşik
   kabuk, içinde ROL BÖLÜMLERİ — bölümler kişinin rollerine göre görünür/gizlenir. Bugünkü çok
   şapkalı kişi hepsini yan yana görür; yarın kurye işe alındığında aynı uygulama ona yalnız kurye
   bölümünü gösterir. Rol-değiştirme anahtarı YOK (mod değiştirmek unutulur; yetki zaten süzüyor).
2. **Depo cihazı: telefon; barkod/QR v2** — etiketleme süreciyle birlikte açılır. v1 düzeni
   liste-işaretle.
3. **Tedarik kapsamda.** Arka ucun bugünkü durumu hareket planını KISITLAMAZ — senaryo yazılır,
   eksik arka uç çıkarsa talep açılır (zaten model büyük ölçüde var, §0).
4. **Sıra: TEK SÜRÜM — dört rol birlikte çıkar.** Aşamalı rol teslimi yok; senaryo çalışması ve
   tasarım brief'i baştan DÖRT rolü de kapsar. (Uygulama içi yapım sırası yine bizde — ama
   müşteriye/personele "çıktı" tek seferde denir.)

## 4. Sonraki adım

Senaryo kartları (§5 — rol × aşama × "ekran anı") kullanıcıyla birlikte olgunlaştırılır; bitince
Claude Design'a ekran-öncesi brief bu dokümandan türetilir. Ekran işine kullanıcı onayı olmadan
girilmez (operasyon yüzeyi V2 — komple yeniden kurgu, kullanıcı kararı 07.08).

## 5. Senaryo kartları (TASLAK — tartışılıyor)

Kart biçimi: **Tetik** (iş neden başlar) → **An** (kişi nerede, elinde ne var) → **İş** (uygulamada
ne yapar) → **Sistemin cevabı**. Tek kabuk + rol bölümleri (§3.1); "🔔" = push bildirimle başlar.

### courier — "Yol" bölümü

| # | Kart | Tetik → An → İş → Cevap |
| --- | --- | --- |
| K1 | Günün rotası | Vardiya başı → araçta → rotayı açar, durak sırasını görür → her durakta adres+sipariş özeti+ödeme durumu (kapıda ödeme tutarı BÜYÜK yazar) |
| K2 | Sıradaki durak | Duraktan ayrılırken → tek elle → "sıradaki"ne kaydırır → navigasyona köprü (harita uygulamasına link; canlı harita v2 — kullanıcı kararı 07.08) |
| K3 | Teslim + kanıt | Kapıda → müşteri karşısında → foto/imza alır, teslimi işaretler → sipariş `delivered`, müşteriye bildirim. Kapı HAZIR (11.2: yükleme + süreli imzalı okuma) |
| K4 | Kapıda tahsilat | Ödeme `pending` + yöntem kapıda → aynı ekranda → tahsilatı işaretler (nakit/kart) → ödeme ekseni TÜRETİLİR, muhasebe defterine düşer. **Kapı imzasına baştan `idempotencyKey`** (kuyruk yeniden-denemesi parayı iki kez yazamasın — denetim sözleşmesi) |
| K5 | Teslim edilemedi | Kapı açılmadı → kapı önünde → sonuç seçer: `unreachable` (ulaşılamadı) / `refused` (kabul etmedi) + foto → `refused` iadeye (`returned`); `unreachable` gün kapanışında BEKLEYEN listesine — **yeniden planlama otomatiği YOK, karar operatörde** (kapı VAR: `markUndelivered`) |
| K6 | Sahada iade | Müşteri ürünü geri verdi → kapıda → iade kaydı + hasar fotoğrafı → `returned` akışı + depoya dönüş listesine girer |
| K7 | Günü kapat | Rota bitti → araçta/depoya dönüşte → kapanış dökümünü onaylar: teslim edilenler · bekleyenler · dönen mallar · **üstündeki NAKİT** → gün kapanır, nakit teslimi para defterine düşer (DOMAIN §7; motor webde VAR: `day-close`). Denetim uyarısıydı: kapıda-ödeme nakdi başka hiçbir kartın konusu değil |

### warehouse — "Depo" bölümü

| # | Kart | Tetik → An → İş → Cevap |
| --- | --- | --- |
| D1 | 🔔 Yeni sipariş → toplama | `confirmed` düştü → raf arasında telefonla → toplama listesini açar, kalem kalem işaretler; eksikse "eksik" der → tamamlanınca `ready`. Eksikte motor (`shortfall`, 10.3) ÖNERİ üretir (müşteriye sor / kalanı gönder), **karar Y2'de** — depoya düşürülmez. **Depo ekranı PARAYI GÖRMEZ** (fark tutarı bu ekrana yazılmaz — motor künyesi kuralı) |
| D2 | Mal kabul | Tedarikçi aracı rampada → koli başında → `purchase_order` kalemlerine karşı sayar; SKT/parti girer; hasara foto → parçalı kabul stok partilerini açar (`purchase_order_item` bağı). Çevrimdışı ÇALIŞMAZ — bağlantı şartı |
| D3 | Yakın-SKT turu | Sabah rutini → raf önünde → SKT listesi tarih sırasında; parti işaretler → parti teklif adayına düşer (indirim kararı admin'in — Y3 kartıyla buluşur) |
| D4 | Sayım/düzeltme | Periyodik ya da şüphe → raf önünde → sayım listesi; fark + ZORUNLU sebep girer → `adjust_stock_batch` (kapı VAR, 0009) sıralı referans üretir (`IMH-26-0012` deseni) — **numara ekranda gösterilir**, kâğıt tutanakla eşleşir |
| D5 | Transfer al/ver | Araç geldi/çıkıyor → rampada → transferi `in_transit`/`received` işaretler → iki deponun stoku birlikte doğru kalır (19). `received` KUYRUKSUZ: bağlantı şartı (mal rafta ↔ sistem "yolda" çelişkisi sayım/satışla kesişir — denetim uyarısı, kararımız bağlantı şartı) |
| D6 | Kurye dönüşü | Rota bitti → rampada → gün kapanışının DÖNÜŞ DÖKÜMÜNE karşı malı kabul eder (döküm hazır: `day-close`) → stok DÖNÜŞ kaydı `0020_order_return` modeline bağlı — YARIM; implement öncesi arka-uc talebi bizden |

### admin — "Yönetim" bölümü (mobil = bildirim + hızlı aksiyon; kurulum masada)

| # | Kart | Tetik → An → İş → Cevap |
| --- | --- | --- |
| Y1 | 🔔 Şikâyet/talep | Yeni talep (16) → her yerde → okur, kısa cevap yazar ya da üstlenir → müşteriye cevap; uzun işlem masaya not |
| Y2 | 🔔 Sipariş istisnası | Eksik toplama (D1'den) / iptal isteği / ödeme düşmedi → her yerde → karar verir; eksikte MOTORUN önerisi ekranda (müşteriye sor / kalanı gönder — `shortfall` oran+tutar ölçütü) → sipariş akışı devam eder. Para bilgisi BU ekranda görünebilir (D1'de değil) |
| Y3 | Yakın-SKT kampanyası | D3'ün listesi doldu → yolda/masada → partiye indirim oranı onaylar → teklif açılır, vitrine düşer |
| Y4 | 🔔 Azalan stok → sipariş | Eşik altı uyarısı → her yerde → sistemin önerisini görür, kalemleri onaylar → `purchase_order` kaydı (sistem TEDARİKÇİYE GÖNDERMEZ — DOMAIN §16). **DÜZELTME (mobil ölçümü 07.08, denetimin "alan yok" tespiti YANLIŞTI):** eşik VAR ve iki katmanlı (`product_variant.min_stock_qty` 0005:103 + depo istisnası `warehouse_variant_threshold` 0031:67), öneri motoru VAR (`reorder.service` — yoldaki düşülür, koli katına yuvarlar), taslak/gönderim kapıları VAR (procurement actions). Gerçek boşluk yalnız 🔔 TETİK: eşik-altı OLAYI + push altyapısı (cihaz jetonu modeli repoda hiç yok) — uygulamayla birlikte kurulacak |
| Y5 | Gün özeti | Gün sonu → her yerde → ciro · sipariş sayısı · şikâyet · yarının rotası tek kartta → yalnız okuma |
| Y6 | 🔔 WhatsApp sipariş | WhatsApp'tan sipariş niyeti (15) → her yerde → **v1: masaya erteleme dalı** (elle sipariş kapısı bugün yalnız kapıda-satış; `whatsapp` kaynağı modelde hazır, kayıt kapısı 15.x ile) → sipariş masada kurulur |

### accounting — "Para" bölümü (mobil YALNIZ OKUR)

| # | Kart | Tetik → An → İş → Cevap |
| --- | --- | --- |
| M1 | Tahsilat izleme | Gün içi → her yerde → bekleyen kapıda-ödemeler + günün tahsilatı (K4'ten canlı) → yalnız okuma |
| M2 | Gün sonu mutabakat özeti | Gün sonu → her yerde → kasa/kart/havale dökümü, uyuşmazlık işareti → uyuşmazlık varsa masada çözülür (yazma masaüstünde) |

### Kesişen omurga (denetim yorumlarıyla güncel, 07.08)

- **Bildirim yönlendirme tablosu** (14 ile koordineli): hangi olay hangi ROLE gider — kişi çok
  şapkalıysa aynı cihaza düşer, roller ayrılınca yönlendirme bedavaya doğru kalır.
- **Çevrimdışılık — karar:** kuyruklu çalışan yalnız SAHA kartları (K3/K4/K5); depo kartları
  bağlantı şartlı (D2/D5 — mal rafta ↔ sistem çelişkisi sayım/satışla kesişir).
- **Bayat geçiş reddi GÖRÜNÜR olmalı:** kuyruklu `delivered` senkronlanmadan sipariş webden iptal
  edildiyse motor geçişi reddeder — app bu reddi YUTMAZ, ekrana taşır (sessiz-catch yasağının
  mobil karşılığı). Kurye "teslim ettim" sanırken sistemin `cancelled` demesi görünür bir çelişki
  olmalı.
- **K4 tahsilat idempotent:** kapı imzasında `idempotencyKey` BAŞTAN (checkout emsali) — sonradan
  eklemek göç ister.
- **Kural APP'E GÖMÜLMEZ:** hangi geçişin geçerli olduğunu app bilmez, motora sorar
  (`domain-core` paylaşılan; çapraz-istemci kural ya DB'de ya paylaşılan pakette —
  `not-mobil-sepet-yarisi-web-native` ilkesinin operasyon yüzü).
- **Tek elle + eldivenle kullanım**: courier/warehouse kartlarında büyük hedefler; onay yıkıcıysa
  (iptal, fark girişi) iki adım.
- **Uygulama iş listesi (envanter ölçümünden, 07.08):** operasyon uçlarının HİÇBİRİ mobile-api'de
  yok (tüm kapılar Next server action — native çağıramaz; her kart için `/api/v1` ucu açılacak) ·
  push altyapısı (jeton modeli + gönderim, 14 ile koordineli) · K5'in not/foto kalıcılığı + K3
  imzalı-yükleme ucu · D6 akıbet kapısının depocuya açılması (bugün admin guard'ı) · Y5 "gün
  özeti" birleştirme ucu (parçalar hazır, birleştiren kapı yok). Bazı kapılar webde de tüketicisiz
  (hazırlık kuyruğu, mal kabul, transfer) — native bunların İLK tüketicisi olacak.
- ~~Webe bildirilen arıza (defter, 07.08): `markUndelivered` imzasındaki `note` gövdede hiçbir
  yere yazılmıyor~~ **DÜZELTİLDİ (08.08, denetim; kodda doğrulandı):** not artık geçişle ATOMİK —
  `order_status_log.note` (0012) + `transition_order_status(p_note)` + `day.ts:181` geçiriyor.
  Kurye terfisi (21.10) bu sürümü birebir taşır; yerel DB'de kolonun görünmesi `db:refresh`
  bekliyor (kullanıcı kararı).
