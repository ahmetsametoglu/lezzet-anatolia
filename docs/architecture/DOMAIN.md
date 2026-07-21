# Domain — Terimler, Roller, İş Kuralları

Bu dosya sistemin **kalbidir**. İş mantığına dokunan her görevde okunur. "Bu iş neden böyle" sorusunun cevabı buradadır.

---

## 1. Terimler

| Terim | Anlam |
| --- | --- |
| **Kanal** | Bir siparişin ait olduğu tip: `B2B` (şirket) veya `B2C` (son tüketici). Sistem otomatik belirler. |
| **Platform satışı** | Sistem üzerinden geçen sipariş. Ortaklık paylaşımına dahildir. |
| **Platform dışı satış** | Sistemsiz (eski usul) yapılan satış. Paylaşıma dahil değildir. |
| **DLC** | Son kullanma tarihi (date limite de consommation). Donuk gıdada kritik. |
| **Rota içi** | Müşteri adresinin mevcut dağıtım rotasının kapsadığı bölgede olması. |
| **Fiili stok** | Depoda fiziksel olarak var olan miktar. |
| **Ayrılmış stok** | Verilmiş ama henüz teslim edilmemiş siparişlere tahsis edilmiş miktar. |
| **Kullanılabilir stok** | Fiili stok − ayrılmış stok. Yeni siparişin görebileceği miktar. |
| **Hızlı satış** | Müşterinin depo kapısında anında verdiği, tek adımda tamamlanan ve ödenen sipariş. |

---

## 2. Roller ve izinler

Bir kullanıcının **birden fazla rolü** olabilir. Başlangıçta tüm roller tek kişide toplanabilir; işe eleman alındıkça ayrışır.

| Rol | Yetki |
| --- | --- |
| **Yönetici (admin)** | Tam yetki: ürün, fiyat, kullanıcı, ayarlar, tüm raporlar. |
| **Depo sorumlusu** | Stok girişi, DLC, sipariş hazırlama. Fiyat ve ayar göremez. |
| **Kurye** | Kendine atanan teslimatlar, gün kapanışı, kasa teslimi. |
| **Müşteri** | Kendi siparişleri, katalog, sepet, kendi profili. |

Yetki kapısı blueprint STACK §7'deki `requireAdmin` / `requireAuth` desenini izler. Yeni roller aynı desende eklenir (`requireWarehouse`, `requireCourier` gibi). Rol kontrolü tek yerden (`lib/guard.ts`) akar.

**İzin ilkesi:** her rol yalnızca işini görecek kadar veri görür. Depo sorumlusu fiyat/kâr görmez; kurye başka kuryenin teslimatını görmez; müşteri yalnızca kendi verisini görür.

---

## 3. Kanal ayrımı ve paylaşım

### Otomatik kanal belirleme

Sipariş oluştuğunda kanal, sipariş verenin **şirket olup olmadığına** göre otomatik atanır. Müşteri kaydında bir "şirket mi" göstergesi (vergi no / şirket bilgisi varlığı) bunu belirler. Kanal siparişe yazılır ve **değişmez** (audit için).

### Paylaşım kuralı

- Platform üzerinden geçen **her** satış, kanaldan bağımsız olarak ortaklık paylaşımına dahildir.
- Bu, sistemde "kanal ayrımının" mali paylaşımı **etkilememesi** demektir: B2B de B2C de aynı havuza girer.
- Kanal ayrımı yalnızca **operasyonel ve raporlama** amaçlıdır (fiyat, süreç, analiz), paylaşım amaçlı değil.
- Platform dışı satışların sisteme girmemesi doğaldır; ama mevcut müşterilerin makul sürede sisteme taşınması beklenir (bu bir iş kuralı, teknik zorlama değil).

> **Not (ajan için):** Bu, ortaklık dokümanındaki daha eski "B2B/B2C ayrı paylaşılır" mantığının **yerini alan** güncel karardır. Sistem tarafında tek havuz mantığı geçerlidir. Paylaşım oranının kendisi (yüzde) bir iş anlaşmasıdır; sistem sadece her satışı doğru, değişmez ve raporlanabilir biçimde kaydeder.

---

## 4. Stok kuralları

### Üç seviye

`Kullanılabilir = Fiili − Ayrılmış`. Müşteri her zaman **kullanılabilir** stoğu görür.

### Rezervasyon

- Uzaktan sipariş onaylandığında stok **ayrılır** (fiiliden düşülmez, ayrılmışa eklenir).
- Sipariş teslim edildiğinde ayrılmış → fiiliden düşülür (ayrılmış da azalır).
- Sipariş iptal edilirse ayrılmış geri bırakılır.
- **Hızlı satışta** (kapı önü) rezervasyon adımı atlanır: fiiliden anında düşülür.

### Eşzamanlılık (concurrency)

İki müşteri aynı anda son birimleri sipariş edebilir. Bu yüzden stok düşürme/ayırma işlemi **atomik** olmalıdır — uygulama katmanında "önce oku, sonra yaz" değil, veritabanı seviyesinde koşullu güncelleme (ör. `update ... where available >= qty` veya bir RPC içinde kilitli işlem). Kullanılabilir stok yetmezse işlem reddedilir ve müşteriye o an bildirilir.

> Bu, blueprint'in "aynı değeri iki yerde tutma / tek kaynaktan türet" ilkesiyle uyumludur: kullanılabilir stok saklanmaz, fiili ve ayrılmıştan türetilir.

### DLC / FEFO

- Her stok partisinin DLC'si tutulur.
- Hazırlıkta **FEFO** (önce süresi dolan çıkar) uygulanır.
- DLC yaklaşınca sistem uyarır (parametrik eşik). Aksiyon: kampanya, öne çıkarma, indirimli satış. Karar insanın.

---

## 5. Fiyat kuralları

- **Fiyat sabitleme:** Müşteri ürünü sepete eklediği andaki fiyat geçerlidir. Sipariş boyunca o fiyat korunur; sonradan fiyat değişse bile verilmiş sipariş etkilenmez.
- **B2B fiyatı** ayrı liste; ayrıca **müşteriye özel fiyat** olabilir.
- **B2C fiyatı** ayrı.
- Fiyatlar arası ilişki (perakende fiyatının toptan müşteriyi rahatsız etmemesi) bir iş kararıdır; sistem farklı fiyat seviyelerini destekler, politikayı admin belirler.
- KDV oranı ürün bazında (donuk gıda %5,5; bazı ürünler %20). Sınır ötesi B2B için gerekli KDV düzeni (autoliquidation) desteklenir.

---

## 6. Teslimat ve minimum sepet

- **Rota içi:** müşteri beklemeyi kabul eder, teslimat ücretsiz, kapıda ödeme mümkün.
- **Rota dışı:** kargo.
- **Minimum sepet:** bir alt sınır olabilir, ama **parametrik** — kod sabiti değil, admin ayarı. Kanala/bölgeye göre farklı olabilmeli. (Blueprint STACK §10: işletme ayarı env'e/koda değil, ayar tablosuna girer.)
- **Ücretsiz kargo eşiği:** parametrik.
- Faz 1'de rota kapasitesi ve zaman penceresi **yok**; sadece içerideyim/dışarıdayım ayrımı.

---

## 7. Ödeme ve kasa mutabakatı

Üç para havuzu ayrı izlenir:

1. **Online** (kart) — ödeme sağlayıcı üzerinden.
2. **Kapıda** — nakit / kart / çek. Kurye toplar.
3. **Banka** — hesap hareketleri Excel ile içe alınır.

### Kurye gün kapanışı

Kurye gün sonunda sistemde kapanış yapar: teslim ettiği siparişler, tahsil ettiği tutar (yöntem bazında), iadeler. Kasaya teslim eder. Sistem beklenen ile teslim edileni karşılaştırır; fark aynı gün görünür.

### Sipariş ödeme durumu

Her siparişin ödeme durumu ayrı izlenir (bekliyor / ödendi / kısmi / iade). Ödeme yöntemi ve anı siparişe yazılır.

---

## 8. İade ve hasar

Kurallar birlikte netleşecek (iş kararı), ama sistem şunları desteklemeli:

- Müşteri "bozuk/eksik geldi" bildirimi
- Para iadesi **veya** sonraki siparişe alacak seçeneği
- Ürünün stoğa geri girmesi **veya** imha olarak işaretlenmesi
- İade/hasarın kâr ve kasa mutabakatına yansıması

Bu alan Faz 1'de temel haliyle bulunur; detay kuralları parametrik ve genişletilebilir tasarlanır.

---

## 9. Ön muhasebe sınırı

- Sistem **resmî muhasebe değildir**, e-fatura kesmez.
- Yaptığı: dış muhasebe yazılımına gidecek veriyi temiz üretmek (export) ve o veriden iş rakamları çıkarmak.
- Resmî fatura numarası dış yazılımda üretilir; sistem bir **referans numarası** verir, sonradan gerçek fatura numarasıyla eşleştirilir.
- Banka hareketleri Excel ile alınır, sipariş/alımlarla eşleştirilir (öneri + elle onay; tam otomatik değil).
