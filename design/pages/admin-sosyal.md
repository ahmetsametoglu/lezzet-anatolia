# Admin — Sosyal Mesajlar (WhatsApp · Messenger · Instagram)

> **Bu dosya 23.08'de GÜNCELLENDİ ve adı değişti** (`admin-whatsapp.md` → `admin-sosyal.md`).
> Ekran 21.08'de tek kanaldan üç kanala genişledi (`/operations/whatsapp` → `/operations/social`)
> ama tasarım girdisi eski kalmıştı: Messenger ve Instagram bu dosyada hiç geçmiyordu. Aşağıdaki
> **kanal ekseni**, **kimliksiz sohbet** ve **defter kutusu** bölümleri yeni — üçü de ekranın
> bugünkü gerçeği ve üçü de çizimi doğrudan etkiliyor.

## 1. Amaç ve kullanıcı

Yöneticinin **üç Meta kanalındaki** yazışmaları **tek kuyrukta** izlediği, AI ajanının yürüttüğü
sohbetlere gerektiğinde el koyduğu ve sohbetten siparişe köprü kurduğu yer. Sosyal mesajlaşma
satışın kapandığı ana yüzeylerden biridir — bu ekran onun kontrol odasıdır. Kullanıcı: yönetici (admin).

**Üç kanal tek kuyruktadır ve bu bilinçlidir:** operatörün sorusu "hangi kanaldan yazdı" değil,
**"kim cevap bekliyor"**. Kanal bir süzgeç ve bir işaret; ayrı sekme değil.

## 2. İçerik envanteri — ne var, neden

- **Konuşma listesi** — her konuşma: müşteri (veya henüz eşleşmemiş kişi), **hangi kanaldan geldiği**, son mesaj özeti, son mesaj zamanı, cevap bekliyor durumu. Sohbeti kimin yürüttüğü (AI / insan) listeden anlaşılır — "hangi sohbet benden bir şey bekliyor" ilk bakışta
- **KANAL — yeni eksen (23.08).** Her satır hangi kanaldan geldiğini söyler ve kuyruk kanala göre daraltılabilir. İki eksen bağımsızdır: *"cevap bekleyen Messenger sohbetleri"* meşru bir sorudur. Kanal ayrımı süs değil — aşağıdaki pencere ve kimlik kuralları **kanala göre değişiyor**
- **24 saatlik pencere durumu — ÜÇ KANALDA DA VAR AMA ANLAMI FARKLI (23.08).** Müşteri yazınca açılan cevap penceresi: açık mı, ne kadar kaldı, kapandı mı. Farkı tasarımın taşıması gerekiyor çünkü operatöre önerilen eylem değişiyor:
  - **WhatsApp'ta bir ÜCRET kararıdır** — pencere kapalıysa serbest mesaj gidemez, yalnız onaylı kalıp mesaj gider ve **ücretlidir**
  - **Messenger/Instagram'da bir KURAL sınırıdır** — kapalı pencerede cevap 7 güne kadar yalnız "insan temsilci" kuralıyla gidebilir ve **ücretsizdir**
  - Kısıt doğal dille hissettirilir ("cevap süresi doldu"), gönderim hatası sonradan patlamaz
- **Konuşma görünümü** — mesaj dizisi (müşteri ↔ biz; bizim taraf AI veya insan olarak ayırt edilir); müşterinin gönderdiği medya; ajanın gönderdiği kart/liste/ödeme linki mesajları anlaşılır biçimde
- **Müşteri bağlamı** — konuşmanın bağlı olduğu müşteri: ad, B2B/B2C, son siparişleri, açık talebi varsa
- **KİMLİKSİZ SOHBET — Messenger/Instagram'da İSTİSNA DEĞİL, VARSAYILAN HÂL (23.08).** Bu, çizimi en çok etkileyen yeni gerçek. WhatsApp'ta kimlik telefondan çözülür; **Messenger ve Instagram kişi kimliği (PSID/IGSID) telefon taşımaz** ve operatörce okunamayan opak bir sayıdır. Yani o iki kanalda sohbet **daima kimliksiz doğar** ve sağ panel bir müşteri kartı değil, bir **eylem** göstermek zorundadır: *"bu sohbeti müşteriye bağla"*. Başlık da o zaman ham kimlik olur — sağlayıcı profil adı varsa o okunur, yoksa sayı. Tasarım bu hâli bir hata gibi değil, **normal bir yaşam evresi** gibi taşımalı
- **AI ajanı izleme ve devralma** — ajan sohbeti yürütürken admin canlı okuyabilir; **"devral"** ile sohbet insana geçer (ajan susar), iş bitince ajana geri bırakılabilir. Güven bu iki yönlü geçişle kurulur: ajan asla tek başına bırakılmış hissettirmez
- **Elle sipariş köprüsü** — sohbetten "sipariş oluştur"a geçiş: müşteri seçili/eşleşmiş halde elle sipariş girişi açılır, kaynak WhatsApp olarak işlenir. Zemin dönemde (ajan yokken) bu köprü ana akıştır; ajan canlıyken istisna aracıdır
- **Ticari mesaj izni (opt-in) — artık KAYDEDİLİYOR (23.08).** Eskiden yalnız gösteriliyordu; bugün operatör sohbette verilen izni **kaydedebiliyor**. Cümle önemli ve çizimde de öyle durmalı: operatör izni VERMEZ, müşterinin dediğini **yazar** (izni veren müşteridir). İzin iki yere birden düşer ama **müşteri kartına yalnız WhatsApp'ta** — Messenger/IG izni bugün yalnız sohbet düzeyinde kalır ve ekran bunu operatöre söylemek zorundadır, yoksa kampanya listesine girdiğini sanır

## 3. Aksiyonlar

- Konuşma açma, okuma
- **Mesaj kutusu bugün bir GÖNDERME kutusu DEĞİL, DEFTER kutusudur (23.08) — ekranın en kritik kararı.** Sistemin bir gönderim kanalı yok: yazışma operatörün telefonundan yürüyor, buraya **kaydı düşülüyor**. Gönderdiğini sanan operatör, cevapsız kalan müşteriyi asla fark etmez. Bu yüzden kutunun düğmesi "gönder" değil **"deftere işle"** ve altında tek satırlık uyarı var. Gönderim kanalı açıldığı gün bu karar geri alınacak — ama **o güne kadar çizim de "gönder" dememeli**
- Kimliksiz sohbeti **müşteriye bağlama** (Messenger/IG'de kimliğin tek yolu)
- Sohbette verilen **kampanya iznini kaydetme**
- Sohbeti ajandan **devralma** / ajana geri bırakma
- Sohbetten elle sipariş oluşturma; sohbetten talep (şikâyet kaydı) açma
- Konuşmayı doğru müşteriye bağlama/birleştirmeye gitme (taslak numara durumunda)
- Sipariş/müşteri detayına geçme (bağlamdan)

## 4. Durumlar ve varyasyonlar

- **Zemin dönemi / canlı dönem** — başlangıçta ajan yoktur, tüm sohbetler insandadır; ajan devreye girince aynı ekran izleme+devralma kazanır. Tasarım iki dönemi de taşır
- **Pencere açık / kapanmak üzere / kapalı** — üç hal; kapanmak üzere olan cevap bekleyen sohbet önceliklidir
- **Eşleşmiş müşteri / taslak numara**
- **Ajan yürütüyor / insan yürütüyor / cevap bekliyor.** Bugün sohbette seçilebilen **iki** mod var (insan · hibrit); üçüncüsü (özerk AI) arkasında motoru olmadığı için seçilemiyor — çizim üç modu varsayarsa olmayan bir yeteneği vaat eder
- **Kimliği çözülmüş / kimliksiz** — Messenger/IG'de ikincisi varsayılan (yukarıda)
- **Boş durum:** hiç konuşma yok · **süzgeçli boş durum**: kanal ya da "cevap bekleyen" süzgeci hiçbir şey döndürmedi (ikisi farklı cümledir)
- Mesajlar üç dilde gelebilir; ajan müşterinin dilinde cevap verir — admin karışık dilli akış okur

## 5. Akış bağlantıları

Gelinen: admin ana menü/dashboard (cevap bekleyen sohbet uyarısından).
Gidilen: elle sipariş girişi (sipariş sayfası), müşteri detayı, talep detayı. Sipariş/talep tarafından da ilgili konuşmaya dönülebilir.

## 6. Yapmaması gerekenler

- Stok/fiyat bilgisi sohbet ekranında elle uydurulup yazılmaya teşvik edilmez — ticari gerçek sipariş akışından gelir; köprünün varlık sebebi budur
- "Servis penceresi", "template", "opt-in", "BSP", "session" gibi terimler ham kullanılmaz — "cevap süresi", "kalıp mesaj", "kampanya izni" gibi insan dili
- Toplu mesaj/kampanya gönderimi bu ekranda yoktur — tekil sohbet yüzeyidir; broadcast ayrı kural ve faz işidir
- Ajanın iç mantığı (niyet analizi, karar günlüğü) admin akışına dökülmez — admin sohbeti okur, gerekirse devralır; ajan hata ayıklama ekranı değildir
- Pencere kapalıyken serbest mesaj yazılabiliyormuş gibi davranılmaz — kısıt baştan görünür
- **Bu ekranda ARAMA KUTUSU yoktur (23.08).** Aranacak şey (müşteri, numara, sipariş) kendi ekranında aranır ve oradan buraya bağlantı verilir; burada ikinci bir arama, aynı sorunun iki yerde farklı cevap vermesi demektir
- **Kanal ayrı SEKME yapılmaz** — kuyruk tek, kanal bir süzgeç. Sekme, "kim cevap bekliyor" sorusunu üçe böler

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: mesajlaşma doğası gereği anlık ve mobil bir iştir — bildirimle gelinir, hızlı okunur, kısa cevap yazılır veya devralınır
- Devralma anı zaman hassasiyeti taşır (müşteri beklerken) — telefonda tek hamleyle yapılabilmeli
- Sohbet + müşteri bağlamı + sipariş köprüsü aynı akışta gerekir; telefonun dar ekranında bağlam kaybolmamalı (nasıl çözüleceği tasarımcının kararı)
