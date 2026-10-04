# İki iş tek sistem — QUALITE ve Lezzet

> **Statü: KARAR ALINDI (03–04.10.2026), uygulama başlamadı.** Özelliğin tek kaydı bu dosya: kararlar, sonuçları, yol haritası ve
> açık sorular burada tutulur; iş `docs/KALAN.md`'ye satır olarak açılmaz. Muhasebe tarafının kararları
> [`kasa-muhasebe.md`](kasa-muhasebe.md)'dedir; bu dosya onların iki işe genişlemesidir.

**QUALITE** şirketin adıdır ve restoran ile marketlere toptan satış yapan iştir; **Lezzet** markamızdır ve çevrim içi
satış yapan iştir. İkisi aynı tüzel kişilik (QUALITE SAS) altındadır: muhasebede tek şirkettir, iki işin ayrımı iç takip içindir.

## 1. Kararlar (kullanıcı, 03–04.10)

| # | Karar | Sonucu |
|---|---|---|
| 1 | **İki işin bütün kayıtları bizim sistemde** — müşteri, sipariş, alış, gider, banka, stok | Kayıt doğduğu yerde işini taşır; Pennylane iki işi kategoriyle ayırır ve muhasebeciye giden dosya oradan çıkar (`kasa-muhasebe.md` 2. karar). Toptan ekibi alışı ve gideri Pennylane'e doğrudan girmez, çünkü her kaydın tek giriş yeri olur. |
| 2 | **Gider fişi bizim mobil uygulamadan girilir**, fotoğrafla | Fişten otomatik okuma ayrı bir iştir (§3, E fazı). |
| 3 | **Ayrımın tek alanı "iş"** (`qualite` · `lezzet`), serbest etiket değil | Etiket unutulunca kayıt sessizce yanlış işe yazılırdı; alan zorunludur ve varsayılanı karşı taraftan ya da hesaptan gelir. |
| 4 | **İki işe birden alınan mal ayrı fatura ve ayrı ödemeyle alınır** | Belge bölünmez. |
| 5 | **Bölünemeyen ortak gider (kira, personel, enerji, ortak araç) tek işe yazılır** | İş alanı tek değerdir, oran tutmaz. |
| 6 | **Stok depo üzerinden ayrılır:** her depo bir işe aittir, etiketsiz depo Lezzet'tir | Mal kabul, parti, rezervasyon, sipariş, sayım ve fire işini deposundan alır; depo bu kayıtların hepsinde zorunlu olduğu için yeni alan gerekmez. Dayanak: iki işin malı fiziksel olarak ayrı duruyor, aynı rafta değil. |
| 7 | **QUALITE yalnız profesyonel müşteriye satar;** müşteriyi QUALITE müşterisi operasyondan admin yapar, müşteri kendisi seçemez | Bireysel ve etiketsiz müşteri Lezzet'tir. Siparişin işi deposundan gelir; müşterinin işi yalnız hangi depoların seçilebileceğini belirler. |
| 8 | **İki iş arasında mal geçişi yoktur;** olursa depo transferiyle yapılır ve sonraki siparişte mahsuplaşılır | Muhasebede tek şirket olduğu için iç fatura ya da iç devir kaydı açılmaz. |
| 9 | **QUALITE ayrı kurye düzeni kurmaz:** teslimat bölgesi ve sefer iki işe ortaktır | QUALITE siparişi aynı rotanın Lezzet seferinde taşınır ve teslim edilir. |

**Dayanak (ölçüm ve araştırma, 03.10):** Pennylane'in yerleşik stok modülü yok (yardım merkezi: *"Pennylane ne dispose pas
de module natif dédié à la gestion des stocks"*); stok için önerdiği Stockpit ayrı abonelikli ikinci bir sistemdir.
Bizim sistemde depo, parti ve maliyeti, son kullanma, tedarik siparişi, mal kabul, transfer, sayım ve fire zaten var.
Pennylane'de faturaya ve banka hareketine analitik kategori yazılıyor (test şirketinde ölçüldü).

## 2. Sonuçları

- **Crédit Mutuel de eşlenir.** QUALITE'nin ödemeleri bizde QUALITE belgeleriyle izah edilir; `kasa-muhasebe.md` 15.
  kararın "yalnız Revolut eşlenir" kısmı bununla değişir. Lezzet'in nakdi yine Crédit Mutuel'e yatırılıp Revolut'a
  gönderilir; artık iki uç da eşli hesaptır.
- **Pennylane kategorisi işten yazılır** ("Lezzet", "QUALITE"; "Activité" grubunda); `kasa-muhasebe.md` 16. karar
  genişler. Banka hareketine de bağının işinden kategori yazılır.
- **E-fatura okuyucusu** (`kasa-muhasebe.md` 7. adım) iki işi de kapsar; işi tedarikçinin varsayılan işinden okur.
- **Muhasebe düzeni** değişir: toptan ekibinin "Pennylane'e doğrudan girme" kuralı alış ve gideri de kapsar.
- **İş ekseni sipariş eksenlerinden bağımsızdır:** kanal (`b2b`/`b2c`) müşterinin şirket olup olmadığını söyler, hangi
  işin müşterisi olduğunu söylemez; QUALITE'nin restoranı da Lezzet'in B2B müşterisi de `b2b`dir.
- **Bölgeye QUALITE deposu eklenir** (9. karar). Posta kodu yine tek bölgeye düşer; QUALITE müşterisinin siparişi bölgenin
  QUALITE deposuna, Lezzet'inki bölgenin bugünkü deposuna yazılır. Sefer bölge ve gün üzerinden kurulur ve o günün rota
  siparişlerini deposuna bakmadan alır (`open_delivery_run`); teslim yalnız kuryenin siparişe atanmış olmasına bakar ve stok
  siparişin kendi deposundan düşer (`deliver_order`). Bölgeyi işe göre ikiye bölmek bunu bozardı, çünkü kurye aynı anda tek
  sefer sürebiliyor (`depart_delivery_run` → `another_running`). Seferin çıkış noktası bölgenin Lezzet deposudur; QUALITE deposu
  başka adresteyse durak sıralaması oraya uğramayı bilmez.
- **QUALITE'nin kargo deposu yoktur** (varsayılan): QUALITE deposu tanımlı bölgenin dışındaki QUALITE müşterisi "teslimat
  noktası belirlenemedi" mesajını alır, Lezzet deposuna düşmez.
- **QUALITE etiketi B2B onaylı profesyonel müşteriye verilir,** çünkü toptan fiyat onaysız açılmaz (`effectiveChannelOf`).
- **Kapı ve araç satışının işi deposundan gelir;** anonim alıcı işe göre bölünmez. QUALITE deposundan anonim kapı satışı
  yapılmaz, çünkü QUALITE yalnız profesyonele satar.
- **İşler arası transfer bugünkü hâliyle çalışır** (8. karar): alış fiyatı yeni partiye taşınır, müşteriye söz verilmiş mal
  sevk edilemez, tedarikçinin lot numarası kopyalandığı için geri çağırma iki depoyu da bulur, para kaydı doğmaz. Kaynak deponun
  eşiği delinirse tedarik önerisi açığı sonraki siparişe yazar; mahsup buradan yürür. O malın alış faturası Pennylane'de kaynak
  işin kategorisinde kalır.

## 3. Yol haritası

| Faz | İş | Ön şart |
|---|---|---|
| A | **Para tarafında iş.** Belgede ve belgesiz harekette zorunlu iş alanı; tedarikçi, cari ve hesapta varsayılan iş; formlarda seçim; Pennylane kategorisi belgenin işinden; banka satırının işi bağından; para ekranında iş süzgeci ve iki işin özeti; Crédit Mutuel eşlemesi. | — |
| B | **Satış ve stokta iş (depo modeli).** Depoda ve müşteride iş; bölgeye QUALITE deposu; depo çözümü, gel-al teklifi ve vitrinin "hiç var mı" toplamı müşterinin işine göre; tedarik siparişinde iş; satış raporları iki iş için (§5). | A |
| C | **Gider fişi mobilde.** Fotoğraf, iş, tür, tutar ve KDV ile belge açılır; Pennylane'e bugünkü kuyrukla yüklenir. | A |
| D | **E-fatura okuyucu** iki iş için; çift kayıt koruması (`kasa-muhasebe.md` 7. adım). | A |
| E | **Fişten otomatik okuma** (tutar, KDV, tedarikçi). | C |

## 4. Açık sorular

1. **Ortak WhatsApp numarası:** iki iş aynı numarayı kullanıyorsa sohbetten doğan taslak müşterinin varsayılan işi seçilemez.

## 5. Ölçülmüş etki (03–04.10, salt okuma analizi; kod değişmedi)

**Para (A fazı):**
- İş enum'u `0010_supply.sql`'de tanımlanır, çünkü tedarikçi tablosu para tablolarından önce açılır. Varsayılanlar boş
  bırakılabilir (`supplier`, `counterparty`, `account`): ortak hesapta ya da ortak tedarikçide boşluk seçimi zorlar.
- `money_document.business` zorunlu; sırayla açık seçim, tedarikçi, cari; kararı belge kapısı (`createMoneyDocument`) verir.
- `money_movement.business` zorunlu ve tetikleyici kurar: bağ (belge, mal kabul ya da tedarikçi, B fazında sipariş), sonra
  cari, sonra hesap. Böylece RPC'ler ve SQL yazımları da kapsanır; bağ değişince iş yeniden türer. İki işin belgesine giden
  bağ reddedilir (4. karar).
- Pennylane: kategori işten; harekete kategori yazan port yöntemi ve aynası eklenir; kuyruk tetikleyicisinin sütun listesine
  iş girer.
- Riskler: kapı tahsilatının hesabı tek ayardan geliyor ve A fazında siparişin işi yok, toptanın nakdi Lezzet'e yazılır (B
  fazında siparişin işi deposundan gelince düzelir); eşleşmeyi geri alma ve "zaten yazmıştım" birleşmesi işi taşımalı;
  `matched_elsewhere` iki iş bizdeyken anlamını yitirir; zorunlu alan yaklaşık 70 testi, üç tohum dosyasını ve dört SQL yazım
  noktasını etkiler.

**Satış ve stok (B fazı):**
- **Depo:** `warehouse.business`, etiketsiz Lezzet. Depo kullanılmaya başlayınca işi değişmez; sipariş ve parti işini depodan
  okur, kopya alan tutulmaz (`0031_warehouse.sql`).
- **Müşteri:** `user_profiles.business` (B2B alanları aynı satırda); QUALITE yalnız onaylı şirkette, değiştiren yalnız admin.
  Siparişi yazan iki yer var (`checkout-draft.ts`, `on-site-sale.ts`); müşterinin işi deponun işiyle tutar, anonim alıcı muaftır.
- **Bölge ve depo çözümü:** bölgede QUALITE deposu alanı; `warehouse-resolve.ts` müşterinin işine göre bölgenin deposunu seçer.
  Posta kodu anahtarı ve "ülke başına tek kargo deposu" kuralı değişmez. Web (`read-place.ts`) ve native (`delivery/place.ts`)
  aynı kurala dayanır.
- **Gel-al:** teklif bugün bütün gel-al depolarını listeliyor (`pickup-offer.ts`); müşterinin işine göre süzülür.
- **Vitrin:** adres bilinmezken "var/yok" bütün tesislerin toplamından okunuyor (`available_stock_total`); toplam işe göre olur,
  yoksa Lezzet ziyaretçisi yalnız QUALITE'de olan ürünü "var" görür. Okuyanlar: `product-context.ts`, `packages.ts`, MCP katalog
  aracı. QUALITE müşterisi giriş yapınca vitrin QUALITE deposunu okur; sepet ödeme adımında depoyla yeniden doğrulanır (bugünkü
  davranış).
- **Tedarik:** siparişte depo yok, aynı sipariş iki depoda kabul edilebiliyor ve siparişe bağlı fatura bütün kabulleri kapsıyor;
  öneri ekranı tedarikçinin bütün tesislerdeki eksiğini tek taslakta topluyor (`procurement/actions.ts`). Siparişe iş eklenir,
  kabul aynı işin deposuna yapılır, taslak işe göre bölünür; yoksa tek fatura iki işe yayılır (4. karar).
- **Kasa:** kapıda nakit alınan B2B parası Hiboutik çekmecesine kasa girişi olarak yazılıyor (`register/sync.ts`); QUALITE'nin
  nakdi de aynı çekmeceye girer. Muhasebede tek şirket olduğu için ayrı kasa gerekmez; hareketin işi siparişin bağından türer.
- **Kurye:** değişmez (§2).
- Satış dışa aktarımı, kâr raporu (bugün kanala göre kırılıyor) ve analitik görünüm iş alanını okumalı.
- **Tahmini boyut:** ~6 migration dosyasında ~8 yer, ~20 TS dosyası; risk orta.
- **Seçilmeyen modeller:** "parti işe aittir" (~13 SQL, ~40–50 TS; unutulan tek süzgeç fazla ya da eksik satış yaptırır) ve
  "ortak mal, iş satışta belirlenir" (alış ve fire için dağıtım kuralı ister). Mal fiziksel olarak ayrı durduğu için depo modeli
  seçildi.

**Mobil gider fişi (C fazı):**
- Mobil para API'si bugün yalnız okuma; gider için yeni bir yönlendirici gerekir. Kamera (`expo-camera`) var, galeriden seçim
  için `expo-image-picker` yok; izin metni yalnız kod okutmayı anlatıyor. Belge dosyası JPEG, PNG ya da PDF olmalı (HEIC
  reddediliyor).
- Pennylane karşı tarafı olmayan belgeyi yüklemez; fişte tedarikçi ya da cari seçilmeli. Belgeyi kimin girdiği bugün
  tutulmuyor.
