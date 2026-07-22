# Admin — Fiyatlar

## 1. Amaç ve kullanıcı

Satış fiyatlarının ve indirimlerin yönetildiği ekran: kanal fiyatları, müşteriye özel fiyatlar, marj takibi, kupon/kampanya ve near-expiry teklif kararları. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

- **Varyant bazında kanal fiyatları** — her satılabilir varyant için B2C ve B2B liste fiyatı. Fiyatı olmayan varyant o kanalda satışa kapalı görünür — eksik fiyat admin'in gözünden kaçmamalı
- **Güncel maliyet ve marj** — varyantın güncel maliyeti (en son partinin alış fiyatı) ve mevcut fiyata göre gerçekleşen marj; fiyat kararı maliyet görülmeden verilemez
- **Hedef marj + marj-altı uyarı listesi** — ürüne yazılmış hedef marjın altında satılan varyantlar bir arada; maliyet artınca fiyatı güncellenmemiş ürünler burada yakalanır. Uyarıdır, engel değildir — karar admin'in
- **auto_price davranışı** — ürün başına tek düğme, iki davranış: kapalıysa (varsayılan) sistem marj-altına düşünce **uyarır**; açıksa fiyatı hedef marjı sağlayacak şekilde **otomatik günceller**. Hangi ürünün otomatik olduğu listede ayırt edilebilmeli; otomatik güncellenen fiyat da görünür olmalı (sürpriz fiyat olmaz)
- **Müşteriye özel fiyatlar** — belirli müşteri + varyant için elle girilmiş fiyat; kimin hangi özel fiyatı aldığı listelenir. Fiyat çözüm sırasının tepesindedir (özel fiyat → müşteri indirim % → kanal fiyatı) — admin bu sıralamayı ekrandan sezmeli
- **Müşteri indirim oranları** — kanal fiyatına uygulanan genel % indirim taşıyan müşterilerin görünümü; oranın kendisi müşteri kaydında yaşar, burada kimlerde olduğu izlenir
- **İndirim / kupon yönetimi** — tek varlık, iki tetik: **kupon** (kod girilir, daima sepet kapsamı) ve **otomatik kampanya** (kapsam: sepet / kategori / koleksiyon). Yüzde veya sabit tutar; koşullar: asgari sepet, yalnız ilk sipariş, geçerlilik tarihleri, toplam ve müşteri başına kullanım sınırı; aktiflik. **Tek-en-büyük kuralı** admin'e açık olmalı: indirimler üst üste binmez, müşteriye en büyüğü uygulanır — kampanya kurarken bu bilinmeli. Paketlere ve near-expiry teklife hiçbir genel indirim binmez
- **Kişisel kuponlar** — belirli müşteriye bağlı kuponlar (çoğu puan redemption'ından doğar); burada görünür, elle de açılabilir
- **Near-expiry teklif önerileri** — kalan raf ömrü eşiğin altına inen partiler için sistemin indirim önerisi (varsayılan %30, parametrik): parti, kalan miktar, kalan ömür %, maliyet, önerilen fiyat. **Son fiyat ve karar admin'in** — teklif açma/fiyat değiştirme/kapatma buradan da yapılabilir (stok ekranıyla aynı karara çıkar); teklifin ürünün normal fiyatını değiştirmediği, o partiye bağlı olduğu anlaşılmalı

## 3. Aksiyonlar

- Kanal fiyatı girme/güncelleme (varyant bazında)
- Müşteriye özel fiyat ekleme/güncelleme/kaldırma
- auto_price açma/kapama; marj-altı uyarısından fiyat düzeltme
- İndirim/kupon oluşturma, düzenleme, aktif/pasif yapma; kişisel kupon açma
- Near-expiry teklifi açma (önerilen fiyatı kabul veya değiştirerek), teklif fiyatını güncelleme, teklifi kapatma

## 4. Durumlar ve varyasyonlar

- **Fiyatı eksik varyant** (kanalda satışa kapalı) — görünür olmalı
- **Marj-altı listesi boş / dolu** — boş hali "her şey yolunda" demektir
- **auto_price açık ürünlerde** elle fiyat girişi çelişki doğurur; davranış net olmalı (otomatik üründe hedef marj değiştirilir, fiyat elle değil)
- **Süresi dolmuş / kullanım sınırına ulaşmış kupon** — pasif ama geçmişi görünür
- **Teklif açık parti** — parti tükenince teklifin kendiliğinden kalktığı bilinmeli
- B2B ve B2C fiyatı arasındaki ilişki (toptanın perakendeyi rahatsız etmemesi) iş kararıdır; sistem ikisini yan yana gösterir, politika dayatmaz

## 5. Akış bağlantıları

Gelinen: admin ana gezinme; dashboard (marj-altı işareti), stok (yaklaşan tarihli parti → teklif kararı), ürünler (bu ürünün fiyatları), müşteri detay (özel fiyat/indirim oranı).
Gidilen: ürün detayı, müşteri detayı, stok (parti bağlamı).

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır — depo ve kurye fiyat/maliyet/marj asla görmez; bu ekranın hiçbir parçası başka role sızmaz
- Pazarlıklı (tek seferlik) fiyat burada girilmez — o sipariş anının işidir (admin-siparisler); kalıcı özel fiyatla karışmamalı. Sürekli aynı pazarlık yapılan müşteri için doğru araç buradaki müşteriye özel fiyattır
- Fiyat çözüm mekaniği (hangi kural kazandı) müşteri-yüzü dile taşınmaz; müşteri yalnız sonucu görür — bu ekran iç mutfaktır
- Sipariş üzerindeki sabitlenmiş fiyatlar buradan değişmez — fiyat değişikliği verilmiş siparişi etkilemez; ekran bu beklentiyi yaratmamalı

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: en sık senaryolar tek fiyat düzeltme, marj-altı uyarısına bakıp fiyat güncelleme ve near-expiry teklif kararı — üçü de telefonda birkaç dokunuşla bitmeli
- Toplu fiyat gözden geçirme (sezon açılışı gibi) masaüstünde de rahat olmalı
