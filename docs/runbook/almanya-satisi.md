# Runbook — Almanya'ya satış (Strasbourg'dan, uzaktan satış)

> **Ne zaman okunur:** Almanya'daki müşteriye satışı açmadan önce ve uzaktan satış eşiği uyarısı geldiğinde. Kararlar ve
> model `docs/feature/ulke-pazari.md`'de, kural `DOMAIN.md` §5'tedir; burada yalnız yapılacak işler durur.

## Açmadan önce (bir kez)

- **Depolar › Strasbourg (Lezzet) › künye:** Almanya'yı kargo ülkesi olarak aç ve teslim noktasını gir (paketin Almanya'da
  taşıyıcıya verildiği adres). Bir ülkeye yalnız bir aktif depo kargo yapabilir; QUALITE deposu kargo yapmaz.
- **Ürünler:** Beslemeyle kurulan ürünün Almanya KDV oranı kurulumda yazılır (`scripts/seed-real/kdv.ts`); sonradan açılan
  ürüne oranı ürün formundan gir ("Almanya KDV"). Oran Almanya'nın sınıflamasıdır, Fransa'dakinden türetilmez: şekerleme %7,
  şişe su ve alkolsüz içecek %19 gibi. "Almanya oranı eksik" süzgeci oransız ürünleri listeler; oransız ürün Almanya'daki
  tüketiciye satılmaz, işletmeye satılır.
- **Fiyatlar:** Almanya'ya özel fiyat yalnız genel fiyattan farklı olacaksa girilir (kırılımda ya da fiyat penceresinde
  "B2C (DE)" / "B2B (DE)"); girilmezse genel fiyat geçer. Otomatik fiyatlı üründe Almanya fiyatı kendiliğinden hesaplanır.
- **Ayarlar › Para › AB uzaktan satış eşiği:** eşik 10.000 € (KDV hariç), uyarılar %80 ve %95. Bu sistemden önce ya da dışında
  AB'deki tüketiciye yapılmış satış varsa açılış tutarlarına (bu yıl, önceki yıl) ve açılış yılına yaz.
- **Hiboutik:** %7 ve %19 KDV oranlarını aç, hesap kodlarını muhasebeci verir. Kalem oranı tanımsız oranı da kabul ediyor, ama
  kargo ürünü oranın kimliğini istiyor; tanımsız oranda Almanya siparişinin kasa yazımı durur. Oran API'den açılıyor
  (`POST /taxes`) ama silinemiyor (`DELETE` 403); bu yüzden doğru adla ve bir kez aç.
- **Pennylane:** Hiboutik bağlantısında %7 ve %19'un gideceği OSS KDV hesaplarını muhasebeciyle eşle.

## İlk Almanya gönderisi

- Kargo teklifi Kehl çıkışlı geliyor (yurt içi Almanya tarifesi); Sendcloud gönderen adresini istekte alır, panelde ayrı tanım
  gerekmez. Almanya çıkışlı etiket henüz ölçülmedi: ilk gönderide etiketin göndereninin teslim noktası olduğuna bak.

## Eşik

- %80'de ve %95'te yönetime ve muhasebeye bildirim gider (yılda bir kez); durum Pano'da ve Raporlar › Muhasebe export'ta.
- Eşik aşılınca sistem kendiliğinden varış ülkesinin KDV'sine geçer; eşiği aşan sipariş de dahildir. Tüketici fiyatı KDV dahil
  olduğu için etiket değişmez, otomatik fiyatlar yeniden hizalanır. O yıl geri dönüş yoktur.
- OSS beyanı muhasebecinindir: Raporlar › Muhasebe export'taki OSS özeti çeyrek, ülke ve oran başına KDV hariç tutarı ve KDV'yi verir.
