# Depo — Sipariş Hazırlama

## 1. Amaç ve kullanıcı

Depocunun onaylanmış siparişleri doğru partiden toplayıp "hazır" hale getirdiği ekran. Kullanıcı: depo sorumlusu (yalnız bu rol).

## 2. İçerik envanteri — ne var, neden

- **Hazırlanacak sipariş listesi** — o günün teslimatına yetişecek, onaylanmış siparişler; teslim gününe göre sıralı. Her satırda: sipariş referans numarası, müşteri adı (koli etiketleme/eşleştirme için), B2B/B2C işareti (hacim beklentisini kurar — B2B 10-50 koli olabilir), kalem sayısı ve durum (bekliyor / hazırlanıyor / hazır)
- **Sipariş kalem listesi** — ürün adı + varyant (ör. 500gr) + istenen adet; hazırlamanın çekirdeği. Ürün görseli tanımaya yardım eder (donuk pakette karışıklık olur)
- **Sistem parti önerisi (kalem başına)** — sistem her kalem için hangi partiden kaç adet alınacağını **önerir**; sıralama daima "önce tarihi yakın olan çıkar" kuralıyla yapılır (arayüzde bu kuralın adı geçmez — depocu sadece "şu tarihli partiden al" görür). Öneri şunları gösterir: partinin **son tarihi**, **depo konumu** (raf/dolap) ve o partiden alınacak **adet**. Bir kalem birden fazla partiden karşılanabilir (3 adet A partisi + 2 adet B partisi) — öneri bunu açıkça bölerek verir
- **Partiye bağlı teklif kalemi** — müşteri indirimli tekliften aldıysa o kalem **belirli bir partiye kilitlidir**; öneri değil zorunluluktur, depocu başka partiden veremez. Bu fark arayüzde anlaşılır olmalı ("bu kalem şu partiden çıkmalı")
- **Parti stok yeterliliği** — önerilen partide fiziksel eksik varsa (sayım tutmuyor) depocunun bunu görmesi ve işaretleyebilmesi gerekir
- **Eksik durumunda sistem önerisi** — bir kalem karşılanamıyorsa sistem eksiğin değerine/kritikliğine göre **akıllı bir öneri** sunar ("müşteriye sor" ya da "kalanı gönder") — ama bu yalnız öneridir, karar hazırlayanındır
- **Hazırlık ilerlemesi** — siparişin kaç kaleminin toplandığı; yarım kalan iş kaldığı yerden sürmeli

## 3. Aksiyonlar

- Sipariş seç → kalemleri sırayla topla → kalem başına **"hazırlandı"** onayı (sayfanın ana aksiyonu). Onayla birlikte çıkan parti(ler) sisteme **otomatik** kaydedilir — depocu ayrıca kayıt girmez, günlük ek yük sıfırdır
- **Öneriden sapma (istisna):** depocu fiilen başka partiden aldıysa yalnız o satırın partisini/adedini değiştirir; gerisi öneriyle akar
- **Eksik işaretleme:** kalemde karşılanamayan adedi işaretler (tamamı da eksik olabilir)
- **Eksik kararı (insan kararı):** (i) **müşteriye sor** — "kalanı göndereyim mi, iptal mi?" sorusu müşteriye iletilir — ya da (ii) **kalanı gönder** — fark otomatik çözülür (peşin ödendiyse iade, kapıda ödenecekse tahsilat düşer; bu hesap depocuya görünmez, sadece kararı verir)
- Siparişin tamamı toplandığında **"sipariş hazır"** — sipariş kurye/sevkiyat aşamasına geçer

## 4. Durumlar ve varyasyonlar

- **Boş durum** — hazırlanacak sipariş yok
- **Tek partili / çok partili karşılama** — aynı kalem birden çok partiye bölünebilir
- **Normal kalem / partiye kilitli teklif kalemi**
- **Tam karşılanan / kısmi eksik / tamamen eksik kalem**
- **B2C küçük sipariş / B2B hacimli sipariş** — kalem ve adet sayısı büyür, liste bu hacimde de okunur kalmalı
- **Yarım kalan hazırlık** — araya iş girer, depocu geri dönünce kaldığı yerden sürer

## 5. Akış bağlantıları

Gelinen: sipariş onaylanınca (ödeme onayı veya kapıda-ödeme onayı) bu listeye düşer; depocu genelde güne bu ekrandan başlar.
Gidilen: "sipariş hazır" sonrası sipariş kurye gün listesine (rota) veya kargoya geçer; depocu listedeki sıradaki siparişe döner. Eksikte "müşteriye sor" seçilirse sipariş cevap bekleyen durumda görünür.

## 6. Yapmaması gerekenler

- **Fiyat, tutar, kâr, maliyet — asla görünmez.** Ne kalem fiyatı, ne sipariş toplamı, ne alış maliyeti. Depocu adet ve ürün hazırlar, para görmez. Eksik kararındaki "fark iadesi" bile tutar olarak gösterilmez
- **Müşteri iletişim bilgisi ve adres görünmez** — teslimat kuryenin işidir; depocuya yalnız ad (koli eşleştirme) yeter
- "FEFO", "rezervasyon", "batch-pinned", "fulfilled_qty" gibi iç terimler arayüz dilinde kullanılmaz — "önce şu tarihli partiden", "ayrılmış", "karşılanan adet" gibi sade karşılıklar yazılır
- Başka günlerin/haftaların sipariş arşivi bu ekrana yığılmaz — bugünün işi net kalır

## 7. Web / mobil notları (yalnız işlevsel)

- **Telefon önceliklidir.** Depocu soğuk depoda, ayakta, çoğu zaman **tek elle ve eldivenle** kullanır — onay aksiyonları bu koşulda güvenle basılabilir olmalı, yanlışlıkla "hazırlandı" basmak kolay olmamalı
- Parti son tarihi ve konum bilgisi toplama anında bir bakışta okunmalı (raf karşısında telefonla durulan an)
- Web (masaüstü) hali günün tamamını görüp planlamak için kullanılabilir; işin kendisi telefonda biter
