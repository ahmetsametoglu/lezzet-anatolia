# Müşteri — Yer Ekseni (posta kodu deseni, çok depo)

> **Sayfalar-üstü sözleşme (01.08).** `operasyon-depo-ekseni.md`'nin müşteri evrenindeki eşi.
> Temel fark baştan: **müşteri depo kavramını HİÇ görmez** — ne adını, ne kodunu, ne sayısını.
> Müşterinin ekseni "teslimat yeri"dir (ülke + posta kodu); depo, sistemin iç çözümüdür.
> Kural seti `DOMAIN §17`; mevcut yer tasarımı (K30-K33) geçerli kalır, bu doküman onu çok depoya
> genişletir. Görsel karar Claude Design'ındır — burada stil yok, davranış ve içerik var.

## 1. Amaç ve kapsam

Çok depo, müşteri tarafında yalnız üç yerde hissedilir; üçü de "yer" dilinden konuşur:

1. **Stok işaretleri** — "stokta var / tükendi / kargoyla gönderilir / bölgenizde şu an yok"
   cevapları artık yere bağlıdır.
2. **Kargo dolgusu** — yerin deposunda olmayan kargolanabilir ürün, ayrı ödemeli ayrı bir kargo
   siparişi olarak alınabilir.
3. **Koşullu ülke seçici** — sistem birden çok ülkeye hizmet vermeye başladığında posta kodunun
   yanında belirir.

Değişmeyenler değişenler kadar önemli: yer hâlâ **bir sözdür, filtre değildir**; katalog
kendiliğinden küçülmez; sepetten hiçbir şey silinmez (sonraya kaydedilir); liste fiyatı yere göre
değişmez.

## 2. Model

- **Yer = müşterinin tek cevabı:** ülke + posta kodu. Bir kez söylenir, her yüzey ona göre konuşur
  (mevcut K30 şeridi/hapı). Depo bu cevaptan içeride çözülür ve arayüze sızmaz.
- **Yer bilinmiyorsa hiçbir şey kilitlenmez** (mevcut sözleşme): yere bağlı vaat verilmez,
  uyarılar "muhtemel" tonunda kalır. "Tükendi" yalnız ürün **hiçbir depoda** yokken söylenir —
  birleştirilmiş stok kimsenin stoğu değildir, tek meşru kullanımı bu olumsuz cevaptır.
- **Yer sorusu zorunlu değildir; ısrarlı ve nazik davetle istenir.** Davet yerleri: anasayfa,
  katalog girişi, soğuk zincir ürün detayı. Ton: "ne itecek ne gözden kaçacak" — duvar değil,
  kaybolan bir ipucu da değil. Atlama kapsamlıdır (mevcut `home`/`cart` ayrımı korunur).

## 3. Kalemin dört hâli (bağlayıcı)

Yer bilinen bir müşteri için her ürün şu dört hâlden birindedir; **hâli stok belirler, müşteri
seçmez**:

| Hâl | Koşul | Ekran dili (amaç; ifade CD'nin) |
| --- | --- | --- |
| **Alınabilir — kapıya** | Yerin deposunda var (kargolanabilirliği önemsiz) | Normal ürün; rota siparişiyle araçtan gelir |
| **Alınabilir — kargoyla** | Yerin deposunda yok + kargolanabilir + kargo deposunda var | "Kargoyla gönderilir" işareti; sepette kargo grubuna düşer |
| **Bölgenizde şu an yok** | Yerin deposunda yok + kargolanamaz (soğuk zincir) | Kısıt bloğu (mevcut K32 deseni); sonraya kaydet + "gelince haber ver" |
| **Tükendi** | Hiçbir depoda yok | Gerçek tükendi — tek dürüst engel |

- Yerelde mevcut ürün kargoya **yönlendirilemez** — ücretsiz kapı teslimi varken paralı kargo
  seçtirmek yalnız karar yükü ekler. ("Bunu kargoyla istiyorum" diye bir seçenek yoktur.)
- "Bölgenizde şu an yok" ile "tükendi" ayrı mesajlardır: ilki yere bağlı ve değişebilir (haber ver
  bağlanır), ikincisi evrenseldir.

## 4. Sepet ve iki-checkout (bağlayıcı)

- Sepet tek yerdir ama **iki grup** taşıyabilir: kapıya gidenler (rota) + kargoyla gidenler.
  Gruplama kalemin hâlinden kendiliğinden doğar; müşteri kalem taşımaz.
- **İki checkout = iki sipariş = iki ödeme.** Rota grubu normal checkout'tan gider; kargo grubu
  **"kargolu ürünleri ayrıca sipariş ver"** ile ayrı bir checkout açar. Müşteri ikincisini yapmak
  zorunda değildir — yapmadıysa kalemler sepette bekler, rota siparişi etkilenmez.
- İki siparişin karakteri farklıdır ve tasarım bunu sezdirir: rota = ücretsiz, bölgenin gününde,
  kapıda ödeme mümkün; kargo = kendi kargo ücreti/eşiği (kendi tutarından), yalnız online peşin.
- Üçüncü bölme mevcut: **sonraya kaydedilenler** (K35) — "bölgenizde yok" kalemlerin evi.
  Silme yoktur; taşıma vardır.

## 5. Yer değişince (bağlayıcı)

- Sepet **yeniden değerlendirilir**: her kalem §3'teki hâline yeniden oturur. Kapıya gidenler
  kargo grubuna düşebilir, düşenler geri çıkabilir; karşılanamayanlar sonraya kaydedilir.
  Hiçbir kalem silinmez; değişiklik **görünür biçimde bildirilir** (sessiz daralma yok).
- **Teklifli (indirimli) kalem özel:** near-expiry teklifi bir partiye bağlıdır ve parti bir
  depodadır. Yer değişince o teklif yeni yerde geçerli olmayabilir — kalem normal fiyata döner ve
  bu, mevcut "fiyat değişti" akışından geçer (arttıysa açıkça sorulur; `DOMAIN §5`). Liste fiyatı
  ise yere göre asla değişmez.
- **Checkout'ta adres kazanır:** adresin posta kodu şeritteki koddan farklıysa sipariş adresin
  yerine göre çözülür ve sepet o an yeniden değerlendirilir — "sepette gördüm, ödemede kayboldu"
  sürprizi checkout içinde, açık mesajla yaşanır; sonrasında değil.

## 6. Ülke seçici (koşullu)

- Posta kodu ülkeler arası benzersiz değildir (`67000` FR+DE). Yer artık **ülke + kod** ikilisidir.
- Seçici **yalnız** sistem birden çok ülkeye hizmet verirken görünür (aktif bölge/depoların ülke
  kümesinden türer — bugün görünmez, Almanya açıldığı gün kendiliğinden belirir). Tek ülke varken
  soru sorulmaz: tek seçenek varsayılan değildir, tek cevaptır.
- Sitenin dili (`de` sürümü) ön-seçim **ipucu** olabilir; karar daima müşterinindir. Dış coğrafi
  servis kullanılmaz — kodun hangi ülkeyi kastettiğini yalnız müşteri bilir.

## 7. Sayfa sayfa uygulama

| Sayfa | Değişiklik |
| --- | --- |
| **Anasayfa** (`musteri-anasayfa`) | Davet deseni (§2); vitrin kartlarında yere bağlı işaretler §3 diliyle |
| **Katalog** (`musteri-katalog`) | Kart işaretleri (§3); "adresime gönderilebilir" çipi korunur (varsayılan kapalı) ve depo stoğunu da kapsayacak biçimde genişler; sıralama/sayfalama yere göre tutarlı |
| **Ürün detayı** (`musteri-urun-detay`) | Kısıt bloğu üç hâl konuşur: kargoyla gönderilir / bölgenizde şu an yok (+haber ver) / tükendi; soğuk zincir ürün detayında davет (§2) |
| **Sepet** (`musteri-sepet`) | İki grup + sonraya kaydedilenler + kargo grubu için ayrı checkout girişi (§4); yer değişim bildirimi (§5) |
| **Checkout** (`musteri-checkout`) | Adres-yer doğrulaması (§5); "bölgenizde karşılanamayan kalemler" ret hâli (mevcut soğuk-zincir bloğunun ikizi); kargo checkout'u aynı akışın kargo karakteriyle |
| **Sipariş listesi** (`musteri-siparisler`) | İki checkout'tan doğan siparişler **iki ayrı sipariş** olarak görünür — yapay bir "birleşik sipariş" kabuğu kurulmaz; her biri kendi durumunu, teslimatını ve belgesini taşır |

## 8. Yapmaması gerekenler

- **Depo adı/kodu/sayısı hiçbir yüzeyde görünmez** — "Strasbourg deposundan gönderilir" gibi bir
  cümle kurulmaz; sistemin coğrafyası müşterinin sorunu değildir.
- **Katalog kendiliğinden süzülmez** — yer bir işaret kaynağıdır, gizleme kaynağı değil
  (süzme yalnız müşterinin açtığı çiple).
- **Sepetten silme yoktur** — karşılanamayan kalem sonraya kaydedilir; alışveriş öldürülmez.
- **Kalem kargoya elle taşınamaz** — yol seçimi arayüze konmaz (§3).
- **"Varsayılan yer" üretilmez** — yer bilinmiyorsa bilinmiyordur; en büyük deponun stoğu
  "muhtemelen sizde de böyle" diye gösterilmez.
- İki-checkout akışı **tek ödemeye birleştirilmez** — "her ödeme bir siparişe" modeli tasarım
  tarafında da korunur; birleşik ödeme vaadi verilmez.

## 9. Claude Design'dan beklenen

1. **Davet deseni** — üç yerleşim (anasayfa, katalog girişi, soğuk zincir ürün detayı), atlama
   davranışıyla; "ne itecek ne gözden kaçacak" dengesinin görsel kararı.
2. **§3'ün dört hâlinin işaret dili** — kart + ürün detayı + sepet satırı düzeylerinde.
3. **Kargo grubu ve ayrı checkout girişi** — sepette iki grubun anlatımı, "ayrıca sipariş ver"
   akışı, kargo karakter farkının (ücret/eşik/yalnız online) sezdirilmesi.
4. **Ülke seçici** — koşullu görünme hâliyle; posta kodu girişinin (K30/K31) güncellenmesi.
5. **Yer değişim bildirimi** — sepetin yeniden değerlendirme sonucunun anlatımı (§5).
6. Etkilenen sayfa `.dc` güncellemeleri: anasayfa, katalog, ürün detayı, sepet, checkout,
   siparişlerim (§7 — her sayfanın kendi dokümanındaki içerik envanteri geçerli kalır).

Kural setleri (§3-§6) davranıştır ve bağlayıcıdır; görünüm, yerleşim ve ifade tamamen serbesttir.
