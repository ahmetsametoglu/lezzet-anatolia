# İki iş tek sistem — QUALITE ve Lezzet

> **Statü: KARAR ALINDI (03–04.10.2026); uygulama A fazında.** Özelliğin tek kaydı bu dosya: kararlar, sonuçları, yol haritası ve
> açık sorular burada tutulur; iş `docs/KALAN.md`'ye satır olarak açılmaz. Muhasebe tarafının kararları
> [`kasa-muhasebe.md`](kasa-muhasebe.md)'dedir; bu dosya onların iki işe genişlemesidir.

**QUALITE** şirketin adıdır ve restoran ile marketlere toptan satış yapan iştir; **Lezzet** markamızdır ve çevrim içi
satış yapan iştir. İkisi aynı tüzel kişilik (QUALITE SAS) altındadır: muhasebede tek şirkettir, iki işin ayrımı iç takip içindir.

## 1. Kararlar (kullanıcı, 03–04.10)

| # | Karar | Sonucu |
|---|---|---|
| 1 | **İki işin bütün kayıtları bizim sistemde** — müşteri, sipariş, alış, gider, banka, stok | Kayıt doğduğu yerde işini taşır; Pennylane iki işi kategoriyle ayırır ve muhasebeciye giden dosya oradan çıkar (`kasa-muhasebe.md` 2. karar). Toptan ekibi alışı ve gideri Pennylane'e doğrudan girmez, çünkü her kaydın tek giriş yeri olur. |
| 2 | **Gider fişi bizim mobil uygulamadan girilir**, fotoğrafla | Fişten otomatik okuma ayrı bir iştir (§3, E fazı). |
| 3 | **Ayrımın tek alanı "iş"** (`qualite` · `lezzet`), serbest etiket değil | Etiket unutulunca kayıt sessizce yanlış işe yazılırdı; alan zorunludur ve varsayılanı karşı taraftan gelir. |
| 4 | **İki işe birden alınan mal ayrı fatura ve ayrı ödemeyle alınır** | Belge bölünmez. |
| 5 | **Bölünemeyen ortak gider (kira, personel, enerji, ortak araç) tek işe yazılır** | İş alanı tek değerdir, oran tutmaz. |
| 6 | **Stok depo üzerinden ayrılır:** her depo bir işe aittir, etiketsiz depo Lezzet'tir | Mal kabul, parti, rezervasyon, sipariş, sayım ve fire işini deposundan alır; depo bu kayıtların hepsinde zorunlu olduğu için yeni alan gerekmez. Dayanak: iki işin malı fiziksel olarak ayrı duruyor, aynı rafta değil. |
| 7 | **QUALITE yalnız profesyonel müşteriye satar;** müşteriyi QUALITE müşterisi operasyondan admin yapar, müşteri kendisi seçemez | Bireysel ve etiketsiz müşteri Lezzet'tir. Siparişin işi deposundan gelir; müşterinin işi yalnız hangi depoların seçilebileceğini belirler. |
| 8 | **İki iş arasında mal geçişi yoktur;** olursa depo transferiyle yapılır ve sonraki siparişte mahsuplaşılır | Muhasebede tek şirket olduğu için iç fatura ya da iç devir kaydı açılmaz. |
| 9 | **Her işin kendi teslimat bölgesi ve seferi vardır;** geçici olarak tek kurye tek araçla iki hesap ve iki telefonla iki işin seferini birlikte sürer, ileride araçlar ayrılır | Sistemde iki ayrı kurye olduğu için iki sefer aynı anda yoldadır. Tek hesap iki seferi birlikte süremez: kurye aynı anda tek sefer sürer ve başlamamış seferin durağı gün ekranında görünmez. Sahada sürtünme görülürse birleşik sürüş kurulur (§5). |
| 10 | **QUALITE etiketi yalnız B2B onaylı müşteriye verilir; QUALITE deposundan anonim kapı satışı yapılmaz; QUALITE kargo göndermez** | Toptan fiyat onaysız açılmaz (`effectiveChannelOf`). QUALITE bölgelerinin dışındaki QUALITE müşterisi "teslimat noktası belirlenemedi" mesajını alır, Lezzet deposuna düşmez. |
| 11 | **Banka hesapları işe göre ayrılmaz** (04.10): Crédit Mutuel ile Revolut şirketin hesaplarıdır | Ödemenin işi bağından gelir (belge, siparişin ya da mal kabulün deposu, tedarikçi, cari); hiçbiri iş söylemiyorsa Lezzet'tir. İki banka da Pennylane'den okunur (`kasa-muhasebe.md` 15. karar). |

**Dayanak (ölçüm ve araştırma, 03.10):** Pennylane'in yerleşik stok modülü yok (yardım merkezi: *"Pennylane ne dispose pas
de module natif dédié à la gestion des stocks"*); stok için önerdiği Stockpit ayrı abonelikli ikinci bir sistemdir.
Bizim sistemde depo, parti ve maliyeti, son kullanma, tedarik siparişi, mal kabul, transfer, sayım ve fire zaten var.
Pennylane'de faturaya ve banka hareketine analitik kategori yazılıyor (test şirketinde ölçüldü).

## 2. Sonuçları

- **İki banka da eşlenir** (11. karar): iki işin ödemesi hangi bankadan çıkarsa çıksın bağlandığı belgeyle izah edilir ve işini
  ondan alır. Nakit Crédit Mutuel'e yatırılır.
- **Pennylane kategorisi işten yazılır** ("Lezzet", "QUALITE"; "Activité" grubunda); `kasa-muhasebe.md` 16. karar
  genişler. Banka hareketine de bağının işinden kategori yazılır.
- **E-fatura okuyucusu** (`kasa-muhasebe.md` 7. adım) iki işi de kapsar; işi tedarikçinin varsayılan işinden okur.
- **Muhasebe düzeni** değişir: toptan ekibinin "Pennylane'e doğrudan girme" kuralı alış ve gideri de kapsar.
- **İş ekseni sipariş eksenlerinden bağımsızdır:** kanal (`b2b`/`b2c`) müşterinin şirket olup olmadığını söyler, hangi
  işin müşterisi olduğunu söylemez; QUALITE'nin restoranı da Lezzet'in B2B müşterisi de `b2b`dir.
- **Bölge işe göre ayrılır** (9. karar). Bir posta kodu her işte en çok bir bölgede olur; bölgenin işi deposundan gelir ve
  müşterinin siparişi kendi işinin bölgesine düşer. Her işin kuryesi ayrı bir hesaptır ve yalnız kendi deposuna bağlıdır; iki
  sefer ayrı kuryelerin olduğu için aynı anda yoldadır (`another_running` kurye başınadır). Aynı araç kaydı iki kuryenin açık
  seferinde olamaz (`vehicle_taken`): araç QUALITE için farklı plaka koduyla ikinci kez kaydedilir (plaka tekildir) ya da QUALITE
  hesabı "araçsız devam" der. Soğuk zincir izi araç kaydına bağlı olduğu için aynı aracın izi iki kayda bölünür. Ortak bölge
  seçilmedi, çünkü araçlar ayrılınca bozulurdu: bölge ve gün başına tek sefer var, seferde tek kurye ve tek araç.
- **Kapı ve araç satışının işi deposundan gelir;** anonim alıcı işe göre bölünmez.
- **WhatsApp'tan yazan yeni kişi Lezzet'te taslak müşteri olarak açılır** (7. ve 10. karar): taslak B2B onaylı olamaz;
  profesyonelse admin onaydan sonra QUALITE yapar. Bu yüzden iki işin aynı numarayı kullanması sorun değildir. QUALITE ayrı bir
  numara açarsa konuşmanın tekilliği bizim hesabı da içerecek şekilde genişler (`0039_conversation.sql`,
  `conversation_external_ref_key`).
- **İşler arası transfer bugünkü hâliyle çalışır** (8. karar): alış fiyatı yeni partiye taşınır, müşteriye söz verilmiş mal
  sevk edilemez, tedarikçinin lot numarası kopyalandığı için geri çağırma iki depoyu da bulur, para kaydı doğmaz. Kaynak deponun
  eşiği delinirse tedarik önerisi açığı sonraki siparişe yazar; mahsup buradan yürür. O malın alış faturası Pennylane'de kaynak
  işin kategorisinde kalır.

## 3. Yol haritası

| Faz | İş | Ön şart |
|---|---|---|
| A | **Para tarafında iş.** Belgede ve belgesiz harekette zorunlu iş alanı; tedarikçide ve caride varsayılan iş; depoda iş (mal kabule bağlı belge ve sipariş parası işini deposundan alır); formlarda seçim; Pennylane kategorisi belgenin işinden; banka satırının işi bağından; para ekranında iş süzgeci ve iki işin özeti; Crédit Mutuel eşlemesi. | — |
| B | **Satış ve stokta iş (depo modeli).** Müşteride iş; deponun işi formda seçilir ve kullanılmaya başlayınca kilitlenir; bölge işe göre; depo çözümü, gel-al teklifi ve vitrinin "hiç var mı" toplamı müşterinin işine göre; tedarik siparişinde iş; satış raporları iki iş için (§5). | A |
| C | **Gider fişi mobilde.** Fotoğraf, iş, tür, tutar ve KDV ile belge açılır; Pennylane'e bugünkü kuyrukla yüklenir. | A |
| D | **E-fatura okuyucu** iki iş için; çift kayıt koruması (`kasa-muhasebe.md` 7. adım). | A |
| E | **Fişten otomatik okuma** (tutar, KDV, tedarikçi). | C |

## 4. Açık sorular

Açık soru yok.

## 5. Ölçülmüş etki (03–04.10, salt okuma analizi; kod değişmedi)

**Para (A fazı):**
- İş enum'u `0010_supply.sql`'de tanımlanır, çünkü tedarikçi tablosu para tablolarından önce açılır. Tedarikçinin ve carinin
  varsayılan işi boş bırakılabilir (ortak tedarikçide boşluk seçimi zorlar); deponun işi zorunlu, etiketsiz Lezzet; banka hesabının
  işi yoktur (11. karar).
- `money_document.business` zorunlu; mal kabule bağlıysa deponun işi (çelişen seçim reddedilir), değilse sırayla açık seçim,
  tedarikçi, cari; kararı belge kapısı (`createMoneyDocument`) verir.
- `money_movement.business` zorunlu ve tetikleyici kurar: bağ (belge, siparişin ya da mal kabulün deposu, tedarikçi), sonra
  cari; hiçbiri iş söylemiyorsa Lezzet. Böylece RPC'ler ve SQL yazımları da kapsanır; bağ değişince iş yeniden türer. İki işin belgesine giden
  bağ reddedilir (4. karar).
- Pennylane: faturanın kategorisi belgenin işinden yazılır, belgenin işi değişince belge kuyruğa düşer. Banka işleminin kategorisi
  hareketin işinden ayrı bir turda yazılır (aynada `category_business`), eşleşme kuyruğundan bağımsız; ölçüme göre işlem kategorisi
  uç noktası faturanınkiyle aynı biçimdedir.
- Eşleşmeyi geri alma ve "zaten yazmıştım" birleşmesi bağı taşır; bağ tetikleyicisi iki hareketin işini de yeniden kurar.
- Kalan risk: `matched_elsewhere` iki iş bizdeyken anlamını yitirir (Crédit Mutuel eşlemesi adımı).

**Satış ve stok (B fazı):**
- **Depo:** `warehouse.business`, etiketsiz Lezzet. Depo kullanılmaya başlayınca işi değişmez; sipariş ve parti işini depodan
  okur, kopya alan tutulmaz (`0031_warehouse.sql`).
- **Müşteri:** `user_profiles.business` (B2B alanları aynı satırda); QUALITE yalnız onaylı şirkette, değiştiren yalnız admin.
  Siparişi yazan iki yer var (`checkout-draft.ts`, `on-site-sale.ts`); müşterinin işi deponun işiyle tutar, anonim alıcı muaftır.
- **Bölge ve depo çözümü:** bugün bir posta kodu yalnız tek bölgede olabiliyor (`0014_delivery_zone.sql` anahtarı ve operasyon
  formunun kontrolü, `routes-actions.ts`); kural "iş başına tek bölge" olur. `warehouse-resolve.ts` yalnız müşterinin işindeki
  bölgelere bakar; "ülke başına tek kargo deposu" kuralı değişmez. Web (`read-place.ts`) ve native (`delivery/place.ts`) aynı
  kurala dayanır.
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
- **Kurye:** akış değişmez. Her hesap tek depoya bağlı ve her sefer tek depolu olduğu için yükleme listesinde ve iade ekranında
  depo ayrımı gerekmez. Geçici düzenin sahadaki bedeli: her sefer kendi durak sırasını tek başına hesaplar (`stop-order.ts`);
  kutu doğru telefonla taranır, öteki telefon "başka rotanın kutusu" der (`load.ts`); her durak kendi telefonunda kapanır; gün
  sonunda iki kapanış ve iki kasa sayımı yapılır, tek kart cihazının raporu iki seferin toplamıdır; iade iki teslimle yapılır ve
  teslim kayıtları iki hesaba bölünür. Müşteriye kurye konumu ya da varış süresi gösterilmediği için müşteri tarafı etkilenmez.
- **Birleşik sürüş** (sürtünme görülürse): aynı araçtaki seferler tek hesapta birlikte yola çıkar, durakları tek sırada dizilir,
  kapanış sayımı seferlere böler. Dokunulacak yerler: başlatma kapısı (`depart_delivery_run` → `another_running`), araçtaki
  seferler ekranı, gün ekranının sayaçları, durak sıralaması ve kapanış ekranı. Bölge düzeni değişmez.
- **Depocu:** iki tarafta çalışan depocu cihazdaki "çalışılan depo" seçimini menüden değiştirir (`warehouse-choice.ts`);
  hazırlık, mal kabul, sayım ve iade ekranları seçili depoyu gösterir. Tek tesisli personele soru sorulmaz.
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
