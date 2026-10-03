# Runbook — muhasebe düzeni

> **Ne zaman okunur:** Hiboutik ya da Pennylane'de elle bir işlem yapmadan önce. Kasa ve muhasebeye kayıt bizden gider;
> iki taraftan biri elle değişirse mutabakat bozulur. Yeni kural çıktıkça buraya tek satır eklenir.

## Hiboutik

- **Hiboutik ekranından satış yapma.** Kasada olup bizde olmayan satış gün sonunda fark çıkarır, gün kapanmaz.
- **Fişi Hiboutik'te düzeltme ya da iptal etme.** İade ve düzeltme bizdeki siparişten yeni fiş olarak gider.
- **Elle kasa girişi ya da çıkışı yapma.** Çekmece hareketi bizden yazılır; elle girilen kayıt gün sonunda fark çıkarır.
- **Günü Hiboutik'te elle kapatma.** Kapanış geri alınmaz ve önceki günleri de kapatır; gün tutunca sistem kapatır.
- **Ürün silme.** Bizdeki ürün eşlemesi silinen ürünü anar ve o ürünlü her yazım düşer.
- **WEB ve VIR ödeme türlerini kapatma.** O yöntemle yazılan ödeme reddedilir.
- **Yeni tesisi kurulum kartında mağazaya eşle.** Eşlemesiz tesisin satışı kasaya yazılmaz, kuyrukta bekler.
- **"Kapanmadı" uyarısını aynı gün çöz.** Kapanmayan kasa günü yasal açıktır, sonraki günler de bekler.

## Pennylane

- **Hiboutik dışında satış bağlantısı açma** (ödeme sağlayıcısı vb.). B2C satış yalnız Hiboutik'ten girer; ikinci bağlantı
  aynı satışı iki kez gelir sayar.
- **Banka hareketini silme ya da arşivleme.** Bizde izah edilmemiş satır da silinir; izahlı satır kalır, muhasebeye uyarı gider.
- **"Hareket gelmiyor" bildiriminde bankanın bağlantısını yenile.** Bankalar bağlantıyı en çok 180 gün açık tutar; kopunca
  hiçbir hareket gelmez.
- **Kurulum kartında kırmızı "Pennylane'de görünmüyor" yazan hesabı güncel hesaba eşle.** O hesabın hareketi okunmuyor.
- **E-faturayı reddetmeden önce itiraz et.** Ret geri alınmaz; anlaşmazlık itirazla (`disputed`) çözülür.
- **Bizden yüklenen faturayı Pennylane'de düzeltme.** Düzeltme bizdeki belgede yapılır ve Pennylane'e kendiliğinden gider;
  Pennylane'deki elle düzeltme bize dönmez.
- **Yüklenmiş belgenin dosyasını değiştirme.** Alanlar ve KDV kırılımı Pennylane'de güncellenir, ek güncellenmez.
