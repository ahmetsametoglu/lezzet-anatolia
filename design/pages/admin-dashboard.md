# Admin — Genel Bakış (Dashboard)

## 1. Amaç ve kullanıcı

Yöneticinin güne başlarken "bugün ne var, ne bekliyor, nerede sorun var" sorularını tek bakışta cevapladığı giriş ekranı. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

- **Bugünün siparişleri** — bugüne (`delivery_date`) yazılmış siparişler, durumlarıyla (onaylandı / hazırlanıyor / hazır / yolda / teslim edildi); günün operasyonu buradan izlenir. Kargo siparişleri ayrı ele alınabilir (teslim günü yok)
- **Bekleyen işler** — admin kararı bekleyen her şey tek yerde toplanır; her biri sayısıyla birlikte ilgili ekrana götürür:
  - **B2B başvuruları** — onay bekleyen self-servis kayıtlar (karar insanın)
  - **Limit aşan vadeli siparişler** — limit içindeki vadeli sipariş otomatik onaylanır; limiti aşan admin'e düşer, burada görünür
  - **Açık talepler** — cevap bekleyen müşteri talepleri/şikâyetleri
  - **Yaklaşan tarihli partiler** — kalan raf ömrü eşiğin altına inen partiler; indirimli teklif açma kararı bekliyor
- **Kritik göstergeler** — günün nabzı: bugünkü sipariş sayısı ve ciro, bekleyen tahsilat (kapıda ödenecekler + vadesi gelen açık bakiye), marj-altı satılan ürün varsa işareti. Amaç karar tetiklemek, rapor sunmak değil — derin analiz raporlar/analitik sayfasındadır
- **Gecikmiş vadeli siparişler** — vade süresini aşmış ödenmemiş sipariş varsa görünür; tahsilat takibi buradan başlar
- **Uyuşmayan kurye kapanışı** — dünkü kapanışta beklenen ile teslim edilen arasında fark varsa görünür (fark aynı gün görünmeli kuralı)

## 3. Aksiyonlar

- Her bekleyen iş kaleminden ilgili ekrana geçme (başvuru → B2B onay, talep → talepler, parti → stok, limit aşan sipariş → sipariş detay)
- Bugünün siparişlerinden sipariş detaya geçme
- Bu sayfada iş **bitirilmez** — karar ekranlarına dağıtır; kendi başına form/karar aksiyonu taşımaz

## 4. Durumlar ve varyasyonlar

- **Sakin gün** — bekleyen iş yoksa bunun açıkça "temiz" olduğu anlaşılmalı; boş kuyruk iyi haberdir, boşluk gibi durmamalı
- **Yoğun gün** — birden çok kuyrukta birikme; hangi işin acil olduğu (gecikmiş vade, DLC'si yaklaşan parti) ayrışabilmeli
- **Teslimat günü olmayan gün** — bugüne rota siparişi yoksa yalnız kargo/bekleyen işler kalır
- Göstergeler gün içinde değişir; ekran güncel veriyle çalışır

## 5. Akış bağlantıları

Gelinen: admin girişi — açılış ekranıdır; her yerden geri dönülen merkezdir.
Gidilen: siparişler, B2B onay, talepler, stok, müşteriler (gecikmiş vade üzerinden), para/kurye kapanışı.

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; depo ve kurye kendi ekranlarını kullanır — ciro, marj, vade bilgisi onların yüzeyine taşınmaz
- Detaylı rapor/analitik burada tekrarlanmaz — dashboard karar tetikler, analiz etmez; aynı bilgiyi iki yerde yaşatmak tutarsızlık üretir
- Rezervasyon satırları, TTL/cron mekaniği, "ayrılmış stok" gibi iç işleyiş burada görünmez — bekleyen işler sonuç diliyle konuşur
- Müşteri-yüzü metinlerle iç terimler karışmaz: burada "parti", "vade", "marj" gibi iç terimler serbesttir ama müşteriye giden hiçbir metin bu ekrandan üretilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: patron güne çoğunlukla telefondan bakar — sabah kahvesinde tek elle taranabilmeli, bekleyen işlerin sayıları ilk ekranda kavranmalı
- Gün içinde sık sık kısa kısa açılır (araçta, depoda); her açılışta güncel durum hızla yüklenmeli
