# Runbook — muhasebe düzeni

> **Ne zaman okunur:** Hiboutik ya da Pennylane'de elle bir işlem yapmadan önce. Kasa ve muhasebeye kayıt bizden gider;
> iki taraftan biri elle değişirse mutabakat bozulur. Yeni kural çıktıkça buraya tek satır eklenir.

## Hiboutik

- **Hiboutik ekranından satış yapma.** Kasada olup bizde olmayan satış gün sonunda fark çıkarır, gün kapanmaz.
- **Fişi Hiboutik'te düzeltme ya da iptal etme.** İade ve düzeltme bizdeki siparişten yeni fiş olarak gider.
- **Elle kasa girişi ya da çıkışı yapma.** Çekmece hareketi bizden yazılır; elle girilen kayıt gün sonunda fark çıkarır.
- **Günü Hiboutik'te elle kapatma.** Kapanış geri alınmaz ve önceki günleri de kapatır; gün tutunca sistem kapatır.
- **Ürün silme.** Bizdeki ürün eşlemesi silinen ürünü anar ve o ürünlü her yazım düşer.
- **"Livraison" kategorisini silme, kargo ürününün kategorisini değiştirme.** Silinen kategori ürünlerden düşer; kargo geliri
  Pennylane'de ürün satışına (707) karışır.
- **WEB ve VIR ödeme türlerini kapatma.** O yöntemle yazılan ödeme reddedilir.
- **Yeni tesisi kurulum kartında mağazaya eşle.** Eşlemesiz tesisin satışı kasaya yazılmaz, kuyrukta bekler.
- **"Kapanmadı" uyarısını aynı gün çöz.** Kapanmayan kasa günü yasal açıktır, sonraki günler de bekler.

## Pennylane

- **Hiboutik dışında satış bağlantısı açma** (ödeme sağlayıcısı vb.). B2C satış yalnız Hiboutik'ten girer; ikinci bağlantı
  aynı satışı iki kez gelir sayar.
- **Hiboutik bağlantısını `hiboutik-pennylane-baglantisi.md`'deki eşlemeden ayırma.** Satış kategoriyle ayrılır (KDV oranıyla
  ayrılırsa kargo ürün satışına karışır); ödeme türü banka hesabına bağlanmaz (banka akışıyla aynı para iki kez girer).
- **Banka hareketini silme ya da arşivleme.** Bizde izah edilmemiş satır da silinir; izahlı satır kalır, muhasebeye uyarı gider.
- **"Hareket gelmiyor" bildiriminde bankanın bağlantısını yenile.** Bankalar bağlantıyı en çok 180 gün açık tutar; kopunca
  hiçbir hareket gelmez.
- **Kurulum kartında kırmızı "Pennylane'de görünmüyor" yazan hesabı güncel hesaba eşle.** O hesabın hareketi okunmuyor.
- **E-faturayı reddetmeden önce itiraz et.** Ret geri alınmaz; anlaşmazlık itirazla (`disputed`) çözülür.
- **Bizden yüklenen faturayı Pennylane'de düzeltme.** Düzeltme bizdeki belgede yapılır ve Pennylane'e kendiliğinden gider;
  Pennylane'deki elle düzeltme bize dönmez.
- **Yüklenmiş belgenin dosyasını değiştirme.** Alanlar ve KDV kırılımı Pennylane'de güncellenir, ek güncellenmez.
- **"Lezzet" ve "QUALITE" kategorilerinin adını Pennylane'de değiştirme.** Kategori adla bulunur; adı değişirse eski adla yeni
  kategori açılır. Ad değişecekse önce Ayarlar › Para › Pennylane'deki o işin "Pennylane kategorisi" değiştirilir.
- **Bizden yüklenen faturanın banka eşleşmesini Pennylane'de çözme.** Bağ bizdeki satırdan kaldırılır ve Pennylane'e kendiliğinden
  gider; Pennylane'de çözülen bağ bizde kalır, muhasebeye bildirim gider ve karar yine bizim ekrandan verilir.
- **Pennylane'e fatura girme** (elle yükleme, e-posta yönlendirme). İki işin belgesi bizde girilir ve Pennylane'e bizden gider;
  Pennylane'e girilen faturaya eşli banka satırı bizde "Belgeyi bizde girin" der. Belge bizde girilince Pennylane'deki kopyası
  silinir; aynı tedarikçide aynı numaralı kopya durdukça belge yüklenmez.
- **Var olan tedarikçiyi Pennylane'de ikinci kez açma.** Aynı firmanın iki kaydı borcu iki hesaba böler ve o firmaya yüklenecek
  belgeyi bekletir.

## Banka

- **Kurulum kartında Revolut'u da Crédit Mutuel'i de eşle.** Eşlenmeyen hesabın hareketi gelmez. Ödemenin işi bankadan değil,
  bağlandığı belgeden ya da siparişten gelir; iki işin ödemesi iki bankadan da yapılabilir.
- **Nakdi yatırdığın gün bizde "Kasa → Crédit Mutuel" transferini yaz.** Yazılmazsa kasa sayımı Hiboutik'te tutmaz; Crédit
  Mutuel'e gelen satır bu transferin öteki yakası olarak eşleşir.
