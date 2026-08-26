# Veri Modeli — İletişim, Geri Bildirim ve Analitik

Konuşma/mesaj, webhook, analitik olayı, yorum, puan, talep, işletme ayarı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Conversation (konuşma) — sosyal mesajlaşma (WhatsApp · Messenger · Instagram)

Konuşma durumu kendi DB'mizde yaşar (karar: kendi DB — bkz. `CHANNELS.md §7`). Alanlar Faz 1'de tanımlı, otomasyon Faz 2'de doldurur. Üç Meta kanalı tek tabloya düşer (ADR-006, 21.08); kanal `source` ekseninde ayrışır.

<!-- alanlar:conversation -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `customer_id` | uuid | • |  |
| `source` | conversation_source |  |  |
| `external_ref` | text |  |  |
| `provider_account_ref` | text | • |  |
| `profile_name` | text | • |  |
| `handled_by` | ticket_handler |  | `'human'` |
| `ai_draft_reply` | text | • |  |
| `ai_draft_generated_at` | timestamptz | • |  |
| `opt_in` | boolean |  | `false` |
| `opt_in_at` | timestamptz | • |  |
| `opt_in_asked_at` | timestamptz | • |  |
| `linked_by` | uuid | • |  |
| `linked_at` | timestamptz | • |  |
| `link_proof` | text | • |  |
| `window_expires_at` | timestamptz | • |  |
| `last_message_at` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`customer_id`** — WhatsApp'ta telefonla çözülür; Messenger/IG'de otomatik çözüm YOK (PSID/IGSID telefon taşımaz) — kimliksiz doğar, bağlama 15.16
- **`source`** — tekillik anahtarının uzayını söyler; `messenger`≠`instagram` (PSID ve IGSID ayrı uzaylar)
- **`external_ref`** — sağlayıcıdaki kişi anahtarı — WhatsApp: E.164 telefon · Messenger: PSID · Instagram: IGSID
- **`provider_account_ref`** — konuşmanın aktığı İŞLETME hesabı (phone_number_id / sayfa id / IG hesap id); zeminde boş, webhook doldurur — cevap yönlendirme buradan
- **`profile_name`** — sağlayıcı profil adı (push name / ad-soyad / kullanıcı adı) — GÖRÜNEN ad, kimlik değil; son görülen değer tutulur
- **`handled_by`** — sohbeti kim yürütüyor (16.08) — `ticket.handled_by` ile aynı enum ve sözleşme
- **`ai_draft_reply`** — hibrit modun bekleyen AI taslağı — satırda durur, mesaj DEĞİL (defter gönderilmişi yazar)
- **`ai_draft_generated_at`** — taslağın üretim anı — önbellek anahtarı; taslakla birlikte dolar/boşalır (kısıt)
- **`opt_in`** — ticari mesaj izni — **bugünkü hâl** (double opt-in, `DOMAIN.md §11`)
- **`opt_in_at`** — **iznin VERİLDİĞİ an**; bir kez yazılır, izin geri alınsa bile silinmez (ispat yükü bizde — GDPR md. 7/1)
- **`opt_in_asked_at`** — **SORULDUĞU an**, cevap ne olursa olsun. Üç hâli bu ayırıyor: boş → hiç sorulmadı · dolu + `opt_in=false` → soruldu, reddetti · `opt_in_at` dolu → izin verildi. Ayrı kolon, çünkü iki alan üç hâli taşıyamıyordu: ret `opt_in=false, opt_in_at=null` yazıyor ve **varsayılan da tam olarak buydu** — yani ret hiçbir iz bırakmıyordu (ölçüldü 25.08)
- **`linked_by`** — bağı KURAN personel (15.19) — FK `set null`, yani kim bağladığı kaybolabilir
- **`linked_at`** — bağın kurulduğu an; kanıtla BİRLİKTE dolar (kısıt)
- **`link_proof`** — kanıtın TÜRÜ (`order_ref`,`email`,`phone`) — değeri saklanmaz; üçü de boşsa bağı SİSTEM kurdu (WhatsApp, numaradan)
- **`window_expires_at`** — 24s servis penceresi bitişi — süre üç kanalda aynı; EKONOMİSİ değil (ücret/şablon yalnız WhatsApp)

**Bir kişi, bir konuşma — kanal başına** — tekillik `(source, external_ref)` üzerinde (0039). Üç kanalda da thread kavramı yoktur: aynı kişiden gelen her mesaj aynı sohbetin devamıdır. İndeks olmasaydı ikinci mesaj yeni bir satır açar, admin aynı müşteriyi gelen kutusunda iki kez görür, AI ajanı geçmişin yarısını okurdu. Açılış bu yüzden tek deyimlik upsert (`open_conversation`): oku-sonra-yaz yarışır ve canlı kanalda arka arkaya gelen iki mesajın ikincisi kaybolurdu. **Hesap boyutu tekillikte DEĞİL (bilinçli):** PSID sayfa-kapsamlıdır ve ikinci bir işletme hesabı (ikinci numara/sayfa) açıldığı gün tekillik `(source, provider_account_ref, external_ref)` üçlüsüne genişletilir — bugün genişletmek, elle işlenen (hesapsız) geçmişi webhook geçmişinden bölerdi; kolon yine de bugünden var, çünkü sonradan eklenen kolon o güne kadarki geçmişi belirsiz bırakır.

**Elle kurulan bağ KANITA dayanır (15.19).** Messenger/IG'de kimliğin tek yolu operatörün bağıdır ve o bağ kurulur kurulmaz **ajanın araçları da** o müşteriye açılır (`support-tools.ts` kimliğe kapatılmıştır) — yani yanlış bağ tek alanı değil, o müşterinin verisinin tamamını açar. Kapı (`@lezzet/application/messaging/link`) müşterinin söylediği bir değeri SUNUCUDA doğrular: sipariş referansı (müşteriye kapatılmış `findByReference`'tan), kayıtlı e-posta ya da telefon (normalize edilip karşılaştırılır). *"Kontrol ettim"* kutusu bilerek YOK — onay kutusu bir kayıttır, bir kapı değil. Kanıtın **değeri saklanmaz**, türü saklanır (`CLAUDE §1`); damga ile kanıt kısıtla birlikte doğar, `linked_by` ise çifte dahil değildir (FK `set null` olduğu gün üçlü kısıt kırılırdı).

**`customer_id` nullable ve öyle kalmalı:** canlı adımda webhook mesajı önce yazar, kimliği sonra çözer — kimlik çözülemediği için mesajın kaybolduğu bir yol olamaz. Messenger/IG'de kimliksizlik üstelik VARSAYILAN hâldir: PSID/IGSID'den telefon/e-posta alınamaz (Meta vermez), kimlik ancak müşteri kendini tanıtınca kurulur. Mevcut bağ da EZİLMEZ (`coalesce`): bağlanmış bir konuşmayı başka müşteriye kaydırmak bir **birleştirme** kararıdır ve insana aittir (`DOMAIN §10`). `profile_name` tersine YENİSİYLE güncellenir — görünen ad kimlik değildir, son görülen değer aylar önceki addan değerlidir.

**Şablon (template) yalnız WhatsApp'ındır** — `record_message` RPC'si başka kaynağın konuşmasına `kind='template'` yazımını reddeder: `message` tablosunun kendi kısıtları kaynağı göremez (source `conversation`'da durur), kural bu yüzden RPC'de. Messenger/IG ücretsiz kanallardır; pencere-dışı kuralları şablon değil ETİKETTİR (insan-temsilci 7 gün).

**24 saatlik pencerenin hesabı burada DEĞİL, motorda** (`serviceWindowExpiry` — domain-core). Tablo yalnız saklar; süreyi RPC'ye de yazmak aynı kuralın iki dilde iki kopyası olurdu. **Pencereyi yalnız GELEN mesaj açar:** giden mesajın uzatması ücretsiz mesajlaşma süresini kendi kendimize uzatmak olurdu — Meta tarafında pencere kapanmıştır ve gönderim şablon ücretiyle geçer.

**Pencere GERİ GİTMEZ** (`greatest`, `coalesce` değil): sağlayıcı webhook'ları ne sıralı gelir ne tek kez denenir. Geç düşen ya da yeniden denenen eski bir mesaj, kendi anına göre hesaplanmış daha erken bir bitişi yazsaydı pencereyi kısaltır ve hâlâ ücretsiz olan bir aralıkta şablon ücreti ödetirdi — üstelik hiçbir yerde hata vermeden. Aynı sebeple `recordInboundMessage`'ın `receivedAt` alanı ZORUNLUDUR: "şimdi"ye düşen bir varsayılan, elle işlenen mesajda pencereyi Meta'nınkinden geç bitirir ve ters yönde aynı faturayı yazar.

**GDPR:** konuşma ve mesajlar `anonymize_customer`'ın **silinir** kovasındadır (0037) — müşterinin kendi cümleleri ve `external_ref`'te duran telefon numarası. `customer_id` FK'si `cascade`, yani hesabın hard-delete edildiği yolda da giderler.

## Message (mesaj)

<!-- alanlar:message -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `conversation_id` | uuid |  |  |
| `direction` | message_direction |  |  |
| `author` | ticket_sender |  |  |
| `kind` | message_kind |  | `'text'` |
| `body` | jsonb |  |  |
| `template_name` | text | • |  |
| `template_category` | template_category | • |  |
| `provider_message_id` | text | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`direction`** — müşteri→biz / biz→müşteri
- **`author`** — kim yazdı (16.08) — yönle çelişemez (kısıt): gelen daima `customer`
- **`template_name`** — outbound template ise (Meta-onaylı)
- **`template_category`** — şablonun **ücret sınıfı** — adla birlikte gelir, ondan ayrı düşemez
- **`provider_message_id`** — Meta mesaj id'si (wamid/mid) — dolu olduğunda TEKİL (kısmi unique, 15.7): webhook tekrarında aynı mesaj deftere iki kez yazılamaz; birincil koruma `webhook_event` claim'i

**Defterdir — yazılır, güncellenmez.** `TicketMessage` ile aynı gerekçe: gönderilmiş mesaj değişmez. Servisin güncelleme tipi bu yüzden `never`; bir gün biri "mesajı düzelt" demek istese derlemede durur.

**`direction` ile `author` iki AYRI eksendir** ve ayrım kalıcı: `author` "kim yazdı" (müşteri/personel/AI), `direction` "hangi tarafa aktı" sorusudur. WhatsApp'ta bizim adımıza AI da personel de yazar; ikisi de aynı numaradan çıkar ve müşteri farkı görmez — farkı defter yazar (16.08), operasyon ekranı AI balonunu ayrı tonda gösterir. Kısıt yanlış eşleşmeyi keser: gelen mesajın yazarı daima `customer`.

**`kind = template` bir SÜS değil ÜCRET sınıfıdır:** servis penceresi dışında yalnız Meta-onaylı şablon gidebilir — ADR-005'in "önce müşteri yazsın" ilkesi bu satırdan doğuyor.

**Fiyatı `kind` değil `template_category` belirler** ve ayrım üç yerde birden önemli:
- **Muhasebe:** düz `kind='template'` sayımı üç farklı fiyatı tek toplama atar; "bu ay WhatsApp bize ne yazdı" sessizce yanlış çıkar.
- **İsraf ölçütü:** *"pencere açıkken şablon = israf"* kestirmesi YANLIŞ. `marketing` israftır (aynı içerik serbest metinle ücretsiz giderdi); `utility` (sipariş onayı, kargo) pencere içinde zaten ücretsiz ve **ADR-005 onu orada öneriyor** — israf saymak doğru davranışı uyarıyla cezalandırmak olurdu. `authentication` bilerek israf sayılmıyor: şablonla gitmesi maliyet hatası değil teslim edilebilirlik kararıdır. Kural motorda tek yerde (`isAvoidableTemplate`).
- **İzin:** `opt_in` şartı yalnız `marketing` içindir. `utility`nin dayanağı izin değil **siparişin kendisidir** (sözleşmenin ifası) — üçünü tek kovaya atmak, sipariş onayını izin arkasına saklamak olurdu.

**Kolon defterle BİRLİKTE doğdu, sonradan eklenmedi:** yazılırken atlanan bir boyut geriye dönük doldurulamaz. Kategorisiz geçen mesajlar için "geçen ay ne ödedik" hiçbir zaman cevaplanamazdı (`ticket.handled_by` ile aynı gerekçe). Şablon adına bakıp türetmek de çözüm değil: kategori Meta tarafında sonradan değişebilir ve o gün geçmiş faturamız bugünün sınıflandırmasıyla yeniden yazılırdı. Defter olanı yazar. Üç kural veride durur (0039): metin mesajı metinsiz olamaz, şablon adı ile tür ayrışamaz (adsız template / adlı serbest metin reddedilir), **gelen mesaj template olamaz** (template işletme-başlatandır; tersi mümkün olsaydı gelen bir mesaj pencere hesabında "biz gönderdik" gibi okunurdu).

**`body` jsonb ve adım 1'de `payload` AÇIK** — kart/interaktif/medya yapısının şekli sağlayıcıya bağlı ve 15.9'da netleşecek. Bugün kapalı bir sözlük yazmak, henüz görmediğimiz bir yapıyı uydurmak olurdu; uydurulan sözlük gerçeği gördüğümüz gün sessizce yanlış olurdu. `text` her türde okunur (kartın başlığı da bir metindir) — gelen kutusu önizlemesi ve AI bağlamı onu okur.

## WebhookEvent (dış olay kaydı)

Stripe/360dialog webhook'ları için tekrar-işleme kilidi (idempotency): aynı olay ikinci kez gelirse no-op (bkz. `STACK.md §13`).

<!-- alanlar:webhook_event -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `provider` | text |  |  |
| `event_id` | text |  |  |
| `type` | text |  |  |
| `payload` | jsonb | • |  |
| `processed_at` | timestamptz | • |  |
| `error` | text | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`provider`** — stripe / 360dialog
- **`event_id`** — **unique** (provider ile birlikte). *(Doküman 26.08'e kadar bu kolonu `provider_event_id` diye anlatıyordu; migration'daki ad `event_id`.)*
- **`payload`** — ham gövde (hata ayıklama)

## Notification (bildirim kaydı)

"Şu kişiye şu oldu" satırı (14.12, migration 0049) — uygulama içi zilin, okundu hâlinin ve teslim defterinin öznesi. **Metin taşımaz:** dil müşterinin tercihine bağlıdır ve değişebilir; satır olayı (`kind`) ve dil-bağımsız küçük veriyi (`payload`) taşır, cümleyi okuyan yüzey kurar. **Bildirim ≠ kuyruk:** kuyruk maddesi (toplama bekleyen sipariş) buraya yazılmaz — bildirim bir AN'dır, iş listesi değil. Yazan tek yer bildirimin tek kapısıdır (`@lezzet/application/notification/dispatch`); beş yayım noktası (sipariş · talep · davet · bölge · B2B) oradan geçer.

<!-- alanlar:notification -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `profile_id` | uuid |  |  |
| `kind` | text |  |  |
| `target_type` | text | • |  |
| `target_id` | uuid | • |  |
| `warehouse_id` | uuid | • |  |
| `payload` | jsonb |  | `'{}'::jsonb` |
| `dedupe_key` | text | • |  |
| `created_at` | timestamptz |  | `now()` |
| `read_at` | timestamptz | • |  |
| `dismissed_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **`profile_id`** — alıcı — müşteri de personel de (kimlik tek tabloda, rol ayırır); **cascade**: purge ve GDPR silmesi ek hedef istemez
- **`kind`** — olay türü — kaynağı `AppNotificationKindEnum` (Zod); DB'de TEXT, enum değil (küme her modülle büyür; emekliye ayrılan tür eski satırları kırmasın)
- **`target_type`** — "tıkla, git" hedefinin türü (order · ticket · feedback_request · zone_notice · customer) — adres, içerik değil
- **`warehouse_id`** — DEPO BOYUTU: depo-bağlamlı personel olayı rol × depo kesişimiyle dağıtılır (CLAUDE değişmezi); müşteri ve depo-üstü olaylarda null
- **`payload`** — dil-bağımsız, KİMLİKSİZ küçük veri (referenceNo, postalCode) — hedefe N+1 gitmeden ve hedef silinse bile cümle kurulsun; serbest metin ve kişisel içerik girmez
- **`dedupe_key`** — formülü OLAY tanımlar (`order:<id>:<durum>`); istisna olaylarında NULL — her düzeltme ayrı haberdir. Tekillik `(profile_id, dedupe_key)` kısmi unique
- **`dismissed_at`** — gizlendi — okundudan AYRI; rozet = `read_at is null AND dismissed_at is null` (tanım tek yerde)

**Personel dağıtımı yazarken (fan-out):** role giden olay, uyan her personele birer satır — rozet sayacı sıcak yoldur, okuma-anı join'ine bağlanmaz. Rolü sonradan verilen personel geçmişi görmez (kabul: bildirim an'dır, arşiv değil; işin kendisi kuyruklarda durur). `document_undeliverable`: e-postasız müşterinin BELGESİ (sipariş onayı — dayanıklı ortam yükümlülüğü) hiçbir kanala ulaşamadığında yöneticiye düşen satır.

**Saklama (14.15):** GÖRÜLMÜŞ personel satırı `NOTIFICATION_RETENTION_DAYS` (varsayılan 90 gün) sonra günlük cron'la silinir (`notification-retention` — tür süzgeci `STAFF_NOTIFICATION_KINDS`). Görülmemiş satır süreden bağımsız durur (bekleyen işin işareti); müşteri satırı hiç süpürülmez — akış müşterinin geçmişidir ve hesabıyla yaşar (0037).

## NotificationDelivery (teslim defteri)

Bildirim OLGUsu ile kanala TESLİMİ ayrı kayıtlardır: BELGE sınıfı "e-posta her zaman + push da" der — tek satır birden çok teslim doğurur; notifier zaten `NotifyResult[]` (dizi) döndürüyordu, tek kolon o diziyi ezerdi. "none" da iki şeyi birden söylerdi: "kanal yoktu" (skipped) ve "vardı, düştü" (error).

<!-- alanlar:notification_delivery -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `notification_id` | uuid |  |  |
| `channel` | text |  |  |
| `status` | text |  |  |
| `reason` | text | • |  |
| `ref` | text | • |  |
| `receipt_status` | text | • |  |
| `receipt_checked_at` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`notification_id`** — **cascade**
- **`channel`** — küme `NotifyChannel`dan türer (+ ileride `push`); `whatsapp_api` 15.11 kapanana dek yazılamaz — sürücü `supports=false`
- **`status`** — sent · skipped · error (NotifyResult üçlüsü)
- **`reason`** — skipped/error sebebi; sent'te null
- **`ref`** — sağlayıcı referansı — "gerçekten ne gitti"nin izi. Push'ta JSON eşleme `[{token, ticket}]`: makbuz turu hangi biletin hangi CİHAZA ait olduğunu bilmek zorunda (çürük jetonu silecek olan o)
- **`receipt_status`** — MAKBUZ (14.16): Expo teslimi asenkron söyler — gönderimde dönen BİLETTİR, tutanak sonradan sorulur. `ok` · hata adı (`DeviceNotRegistered`…) · `expired` (24s pencere kaçtı) · `unparseable`. `null` = henüz sorulmadı
- **`receipt_checked_at`** — teslim satırının değişebilen TEK yüzü — gönderim gerçeği donuk kalır (update şeması yalnız makbuzu açar)

## PushDevice (cihaz jetonu)

Push'un tek DB ayağı (14.14, migration 0050): "bu kişiye hangi cihazlardan ulaşılır". Sürücü ve makbuz cron'u 14.16'da; izin akışı/yönlendirme mobil şeritte. **Jeton bir ADRES değil YETKİDİR** (o cihaza bildirim gösterme) — hiçbir uçtan geri okutulmaz, URL'e yazılmaz (uçlar POST, jeton gövdede).

<!-- alanlar:push_device -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `profile_id` | uuid |  |  |
| `token` | text |  |  |
| `platform` | text |  |  |
| `disabled_at` | timestamptz | • |  |
| `last_seen_at` | timestamptz |  | `now()` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`profile_id`** — sahip — müşteri de personel de (operasyon kabuğu da push alacak; ad bu yüzden `customer_id` değil); **cascade**
- **`token`** — **unique, TABLO GENELİ** — cihaz başına tek sahip. Kayıt RPC'si (`register_push_device`) çakışmada SAHİBİ DEVREDER: son giren kazanır, cihaz fiziksel olarak onun elindedir. Devir olmasaydı aile telefonunda önceki hesabın bildirimi sonrakine düşerdi
- **`platform`** — `ios` · `android` — `web` BİLEREK yok (KARARLAR 26.08: müşteri yüzeyinde web push yapılmıyor); kısıt veride
- **`disabled_at`** — OS bildirim İZNİ kapalı (uygulamanın açılış raporu) — dolu ise sürücü cihazı yeteneksiz sayar ve sıra maile düşer. İzin karası: kapalı cihaza "gönderdim" demek sessiz kara deliktir
- **`last_seen_at`** — bakım damgası ("kayıt bayat mı") — karşılaştırılan bir ölçüt değil

**Çıkış (logout) ZORUNLU adım:** jeton silinmezse önceki hesabın bildirimi sonraki oturum sahibine düşer. Silme sahiplik süzgeçli (`token + profile_id`): devrolmuş cihazın gecikmiş çıkışı yeni sahbin kaydını sökemez. 0037 silme akışına dahil.

## AnalyticsEvent (analitik olayı)

Cookie'siz, sunucu-tarafı, toplu ölçüm. **Kuralların tamamı `ANALYTICS.md`'de** (sınır · kimlik · olay şekli · kapı · saklama); burada yalnız ALANLAR durur.

**`customer_id` kolonu YOKTUR — nullable bile değil** (kullanıcı kararı 04.08). Eskiden *"yalnız giriş yaptıysa (opsiyonel)"* diye duruyordu ve üç yerle çelişiyordu: tasarım kişi bazlı gezinme ekranını yasaklıyor, yasal gerekçemiz toplu ölçüme dayanıyor, silme talebinde ne yapılacağı tanımsız kalıyordu. Kimlikli davranış defteri ayrı bir tablonun ve ayrı bir hukuki dayanağın işidir → `ANALYTICS.md §2`.

**Vekil anahtar (`id`) de YOKTUR** (0035): satır asla kimliğiyle okunmuyor — defter yalnız yazılıyor ve
toplanıyor. En çok yazılan tabloya, hiçbir okumanın kullanmadığı bir indeks eklenmez (ayrıca
bölümlenmiş tabloda birincil anahtar bölüm anahtarını içermek zorundadır). Tablo **aya göre
bölümlenmiştir**; saklama satır silerek değil bölüm düşürerek işler.

**`source` ve `utm` bu tabloda DEĞİL, `AnalyticsSession`'da** (aşağıda): kampanya künyesi oturum
başına bir kez düşer. Her olaya kopyalansaydı aynı bilgi ziyaret sayısı kadar tekrarlanır ve
oturumun künyesi olayların arasında ayrışabilirdi.

<!-- alanlar:analytics_event -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `created_at` | timestamptz |  | `now()` |
| `type` | analytics_event_type |  |  |
| `session_key` | text |  |  |
| `path` | text | • |  |
| `subject_type` | analytics_subject_type | • |  |
| `subject_id` | uuid | • |  |
| `product_id` | uuid | • |  |
| `channel` | channel | • |  |
| `warehouse_id` | uuid | • |  |
| `availability` | analytics_availability | • |  |
| `blocked_reason` | analytics_blocked_reason | • |  |
| `device` | analytics_device | • |  |
| `surface` | analytics_surface |  |  |
| `country` | country_code | • |  |
| `language` | preferred_language | • |  |
| `meta` | jsonb | • |  |
<!-- /alanlar -->

**Kararlar**

- **`created_at`** — **bölüm anahtarı**
- **`session_key`** — sunucu-tarafı günlük oturum (kişisel değil; tuz her gün döner)
- **`path`** — **ROTA KALIBI** (`/product/[slug]`), somut değer asla
- **`subject_type`** — ölçülen nesne; FK YOK
- **`product_id`** — ürün kırılımı için denormalize anlık görüntü
- **`warehouse_id`** — **DEPO granülü**, posta kodu değil (k-anonimlik). `null` = yer seçilmemiş, bir KOVA
- **`availability`** — görüntüleme anındaki hâl (snapshot)
- **`blocked_reason`** — yalnız `cart_blocked`/`checkout_blocked`
- **`device`** — uygulamanın `Device` tipiyle aynı küme
- **`country`** — IP'den türetilir; IP saklanmaz
- **`meta`** — tipe özel, **kapalı sözlük** (Zod ayrık birliği). `search`: `{query, resultCount, zeroResultKind}`

## AnalyticsSession (oturumun kampanya künyesi)

UTM oturum başına **bir kez** düşer; ikinci yazım sessizce yutulur (ilk kaynak kazanır — `acquisition_source` kuralıyla aynı). Satır yalnız künyeli gelişte doğar: doğrudan gelen ziyaretçi için satır açmak, tabloyu defterin ikinci kopyasına çevirirdi.

<!-- alanlar:analytics_session -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `session_key` | text |  |  |
| `utm` | jsonb | • |  |
| `source` | text | • |  |
| `first_seen_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`session_key`** — **birincil anahtar**
- **`utm`** — **kapalı sözlük**: `{source, medium, campaign, content, term}` — kapı indirger (`normalizeUtm`)
- **`source`** — yönlendiren ALAN ADI (ham URL değil)

**Sözlüğün kapalı olması bir gizlilik kararıdır:** açık bırakılsaydı reklam aracının linke eklediği her parametre — `gclid`/`fbclid` gibi **tıklama kimlikleri** dâhil — anonim deftere girerdi. O kimlikler reklam ağının tarafında tek kullanıcıya çözülür.

**Saklama:** ham defterle aynı 25 ay (`purge_analytics_before`). Bölüm düşürmek burada işe yaramaz — tablo bölümlenmemiş; künyesi kalan bir oturum "defteri sildik" cümlesini yarım bırakırdı.

## AnalyticsDaily (+ üç sinyal özeti) — **ekranların okuduğu yer**

Ekranlar ham deftere BAĞLANMAZ (`ANALYTICS §5`); ham yalnız detay içindir.

| Tablo | Anahtar | Ne cevaplar |
| --- | --- | --- |
| `analytics_daily` | gün × tip × rota × depo × kanal × satılabilirlik × **terk sebebi** | huni · seri · ısı haritası |
| `analytics_daily_product` | gün × ürün | çok bakılıp az alınan (13.4) + vitrin seçkisi (08.9) |
| `analytics_daily_search` | gün × terim × sıfır-sonuç kovası | aranıp bulunamayan (13.4) |
| `analytics_daily_source` | gün × kaynak × kampanya × ortam | trafik kaynağı + kaynak dönüşümü (13.2) |

- `analytics_daily` satırı **24 öğeli saat kırılımı dizisi** taşır — ayrı saatlik tablo YOK; hafta/ay/yıl da türetilir.
- **`session_count` YAKLAŞIKTIR** (aynı oturum birden çok boyut satırına düşer). Toplanabilir tek sayı `event_count`.
- Tekil anahtarlar **`nulls not distinct`**: boyutların çoğu nullable ve SQL'de `null <> null` — standart `unique` aynı kovayı defalarca yazdırır, özet sessizce çoğalırdı.
- **Ürün/kaynak özeti SÜRESİZ** (sayı, kişisel veri değil); **arama özeti 25 ay** — sistemdeki tek kalıcı serbest metin, ham metnin ömrünü özet kılığında uzatmamalı.
- Ürün ve arama kırılımı `analytics_daily`'ye BOYUT olarak eklenmedi: satır sayısını katalog büyüklüğüyle çarpar, huni/ısı okumaları da o şişmiş tabloyu taramak zorunda kalırdı.

**Burada YALNIZ İZ vardır, beyan yoktur.** Analitik, müşteriyi tanımadan topladığımız gezinme izidir; "toplu ölçüm" ve "çerez banner'ı gerekmez" iddiası (bkz. `FEATURES.md` Analitik) buna dayanır. Müşterinin bize **vermeyi seçtiği** her şey — yorum, beğeni, talep, bölge haberi — kendi kalıcı tablosunda yaşar.

Bu yüzden `product_swipe` bu listede DEĞİLDİR (29.07 düzeltmesi): beğen/geç bir iz değil bir beyandır, puan kazandırır, kişiye ve ürüne bağlıdır ve "aynı ürüne bir kez" tekilliği ister — hiçbiri akıp giden bir olay defterinde duramaz → `ProductFeedback`.

## ProductFeedback (ürün geri bildirimi — yorum + beğeni)

Müşterinin bir ürün hakkında **bize vermeyi seçtiği** değerlendirme. Üç biçim tek varlıkta: yıldız, yazılı yorum, beğen/geç (bkz. `DOMAIN.md §14`).

<!-- alanlar:product_feedback -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `product_id` | uuid |  |  |
| `customer_id` | uuid | • |  |
| `order_id` | uuid | • |  |
| `feedback_request_id` | uuid | • |  |
| `context` | feedback_context |  |  |
| `rating` | int | • |  |
| `vote` | feedback_vote | • |  |
| `comment` | text | • |  |
| `language` | text | • |  |
| `translations` | jsonb | • |  |
| `translated_at` | timestamptz | • |  |
| `dwell_ms` | int | • |  |
| `status` | review_status |  | `'pending'` |
| `moderated_at` | timestamptz | • |  |
| `moderated_by` | uuid | • |  |
| `notified_at` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`product_id`** — değerlendirme ürün düzeyinde (varyant değil)
- **`customer_id`** — **null = giriş yapmamış ziyaretçinin keşif kaydırması**; puan yalnız kimliklide
- **`order_id`** — doğrulanmış alışveriş (`purchase` bağlamında dolu)
- **`context`** — aldığı ürün / keşifteki aday ürün — **kapıları farklı**
- **`rating`** — 1–5 yıldız
- **`language`** — metnin GERÇEK dili (ISO 639; enum DEĞİL — Boşnakça yorum da gelir). `null` = tespit koşmadı; metinsiz kayıtta boş
- **`translations`** — makine çevirileri `{tr?,fr?,de?}` — **kaynak dil torbada YOKTUR**
- **`translated_at`** — çeviri işi baktı mı; **başarısızlıkta da dolar**
- **`dwell_ms`** — kartta geçirilen süre — **sinyal kalitesi** için (yalnız kaydırmada)
- **`feedback_request_id`** — alım-sonrası davetten geldiyse (`FeedbackRequest`)
- **`status`** — **moderasyon yalnız METİN içindir**; metinsiz kayıt doğrudan `approved` doğar
- **`moderated_at`** / **`moderated_by`** — kim ne zaman karar verdi (iz)
- **`notified_at`** — **"bu ürün geldi" haberi bu kişiye verildi mi** (17.8 zemini). Aday kaydırması bir TALEP BEYANIDIR; ürün kataloğa girince beyanı yapana haber vermek, keşif turunun karşılığını ödediği andır. **Ayrı "ilgi" tablosu AÇILMADI:** kim hangi ürünü istiyor bilgisi zaten bu satırda (`customer_id` + `product_id` + `vote='like'` + `context='candidate'`) ve `product_feedback_customer_key` onu kişi başına teke indiriyor — ikinci tablo aynı gerçeği iki yerde tutar ve ayrışır. Eksik olan ilgi değil **teslimat muhasebesiydi**. Damga gönderimden SONRA atılır: tersi, gönderim düşerse müşteriyi kalıcı sessizliğe mahkûm ederdi

**Neden tek tablo:** ayrımları biçimden ibarettir — müşteri, ürün, tarih, puan kazanımı, "aynı ürüne bir kez" tekilliği, ürün skoruna katkı ve GDPR silme yolu üçünde de aynıdır. `Discount`'ın kuponu ve otomatik kampanyayı tek varlıkta tutmasıyla aynı gerekçe: iki tablo, aynı yedi alanı iki kez tanımlamak ve skoru iki yerden toplamak olurdu.

**En az bir beyan şart:** `rating`, `vote` ve `comment`'tan biri dolu olmalı. Üçü de boşsa ortada bir değerlendirme yoktur.

**Yorum ÇEVRİLİR ama DEĞİŞMEZ (20.2 · kullanıcı kararı 03.08 — eski "çevrilmez" kararı geri alındı).** Eski gerekçe *"yorum müşterinin kendi cümlesidir, makine çevirisi onu söylemediği bir hâle sokar"* idi; endişe doğruydu, sonucu yanlıştı — çevirmemek, Fransız okuyucuya Türkçe yorumu okuyamayacağı hâlde göstermektir, yani hiç göstermemektir. Doğru çözüm **orijinali korumak ve çeviriyi yanına koymak**: `comment` hiç değişmez, `translations` yanında durur, `resolveUserText` site dilinde okutur ve ekran "otomatik çevrildi" der. **Kaynak dil torbaya girmez** — böylece torbadan okunan her metin gerçekten çeviridir ve karışamaz. **Metin değişirse çeviri VERİ TARAFINDAN düşürülür** (`reset_translation_on_text_change` tetikleyicisi, `0011`): kapıya bırakılsaydı bir yazma yolu unutulur ve okuyucu, müşterinin artık yazmadığı bir cümlenin Fransızcasını görürdü.

**Moderasyon metnin işidir.** Yıldızı ya da beğeniyi "reddetmek" anlamsızdır — okunacak bir şey yoktur. Metinsiz kayıt kuyruğa hiç düşmez, doğrudan yayına girer; kuyruk yalnız insanın okuyacağı bir cümle olduğunda anlamlıdır.

**İki bağlam, iki kapı:** `purchase` satın alma doğrulaması ister (doğrulanmamış yorum sosyal kanıt değil reklamdır); `candidate` istemez ve isteyemez — aday ürün henüz satılmıyor, kimse alamamıştır.

**`status` neden boolean değil:** kuyruğun üç hâli var — bekliyor, onaylandı, reddedildi. `is_approved=false` bu üçünden ikisini aynı kovaya atardı: reddedilmiş yorum her açılışta yeniden karar bekliyormuş gibi kuyruğa düşer, moderatör aynı metni ikinci kez okurdu.

**Dil saklanır, çevrilmez:** yorum müşterinin kendi cümlesidir; makine çevirisi onu müşterinin söylemediği bir hâle sokar. Alan, moderatörün "bu hangi dilde" sorusunu ve ürün sayfasının dil süzgecini karşılar.

**Tekillik:** `(customer_id, product_id, context)` — aynı ürüne bir müşteriden tek kayıt; ikinci kez alan müşteri görüşünü GÜNCELLER. Ziyaretçi kaydırmasında (`customer_id` null) tekillik yoktur ve olamaz: tekilleştirmek kimlik tutmayı gerektirirdi. Aday talep panosundaki sayı bu yüzden mutlak bir "kişi" değil, ilgi yoğunluğudur (`postal_code_demand` ile aynı kabul).

## FeedbackRequest (geri bildirim daveti)

Teslim sonrası (~10 gün) swipe/yorum daveti; tamamlayınca ödül kuponu (bkz. `DOMAIN.md §14`).

<!-- alanlar:feedback_request -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_id` | uuid |  |  |
| `customer_id` | uuid |  |  |
| `token` | text |  |  |
| `expires_at` | timestamptz |  | `(now()` |
| `channel` | feedback_channel |  |  |
| `sent_at` | timestamptz | • |  |
| `completed_at` | timestamptz | • |  |
| `points_awarded` | int | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`token`** — **unique** — davet bağlantısının anahtarı; tahmin edilemez (rastgele), oturum yerine geçer
- **`channel`** — davetin gittiği kanal
- **`points_awarded`** — tamamlayınca verilen puan (`PointsEntry`); puanlar sonra kişisel kupona çevrilir

**İlerlemenin bağı:** davetten doğan her değerlendirme `ProductFeedback.feedback_request_id` ile buraya bağlanır; "2/5" o bağdan türetilir (`feedback_request_progress`).

**Token neden var:** davet e-posta/WhatsApp'tan gelir ve telefonda tek elle açılır — araya giriş ekranı koymak akışı kırar. Bağlantının kendisi kimlik taşır. Bu yüzden `reference_no` ile aynı kural geçerlidir: **rastgele**, sıralı değil — sıralı olsaydı bir davet linkinden komşusunun siparişine geçilebilirdi.

**Yarıda bırakma ayrı alan istemez:** "2/5" ilerlemesi tamamlanmış değerlendirmelerden türetilir (siparişin kalemleri ↔ o kalemler için düşmüş beğeni/yorum). `completed_at` yalnız akışın sonuna basılır ve puanın **tek kez** verilmesini o sağlar.

## NeighborInvite (komşu daveti)

Rota-içi siparişi olan müşterinin komşusunu **aynı sefere** çağırdığı bağlantı (17.10, migration 0044). Getiren davetinden (`user_profiles.referred_by`) AYRI bir kavram: o **hesapsız birini müşteri yapmayı** ödüllendirir ve kimlik eksenlidir; bu **var olan bir sefere ikinci sipariş eklemeyi** ödüllendirir ve sefer eksenlidir. Davet edilen kişi zaten müşterimiz olabilir (kullanıcı kararı 11.08).

<!-- alanlar:neighbor_invite -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `token` | text |  |  |
| `inviter_id` | uuid |  |  |
| `order_id` | uuid |  |  |
| `delivery_zone_id` | uuid |  |  |
| `delivery_date` | date |  |  |
| `max_uses` | int |  | `3` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`token`** — **unique** — bağlantının anahtarı; sipariş referansıyla aynı okunabilir alfabe, CSPRNG
- **`inviter_id`** — daveti açan müşteri (`restrict` — kazanılmış ödülün kaynağı)
- **`order_id`** — **unique** — davetin doğduğu sipariş; "hangi sefer" sorusunun kaynağı
- **`delivery_zone_id`** — seferin bölgesi
- **`delivery_date`** — sefer günü
- **`max_uses`** — kaç komşu kullanabilir (varsayılan 3, 1–20)

**Sefer ayrı bir varlık DEĞİL:** rota günü zaten `(delivery_zone_id, delivery_date)` ikilisiyle tanımlı (`order` + `delivery_zone`) ve kurye ekranı da siparişleri bu ikiliyle topluyor. Ayrı bir `trip` tablosu, bugün türetilen bir gerçeği saklamak ve iki kaynağın bir gün ayrışmasını göze almak olurdu.

**İkili KOPYALANIYOR ve bu bilinçli bir snapshot istisnası:** siparişin bölgesi ya da günü operasyonda değişebilir, oysa komşuya SÖZ VERİLEN gün davetin doğduğu gündür. Canlı bağ olsaydı, komşunun tıkladığı bağlantı ertesi gün başka bir günü gösterirdi — ve kimse fark etmezdi.

**Kullanım sayılmaz, türetilir:** azalan bir sayaç yok; kullanım o daveti künyesinde taşıyan siparişlerdir (`order.neighbor_invite_id`, iptaller elenir). Sayaç tutulsaydı iptal edilen siparişte elle geri alınması gerekirdi ve biri mutlaka unuturdu — defterin ve para hareketlerinin aynı kuralı.

**Güncelleme yolu yok:** davet doğduğu andaki seferin fotoğrafıdır. Günü ya da sınırı sonradan değiştirilebilseydi, paylaşılmış bir bağlantının sözü sahibinin haberi olmadan değişirdi. Yanlış açılmış davet düzeltilmez — süresi geçer ya da yenisi açılır.

**Geçerlilik saklanmaz, hesaplanır:** davet, seferin gününe ve **kesim saatine** bakılarak açık/kapalı sayılır (`deliveryRunWindow`, `order_cutoff_time` ayarı). `expires_at` kolonu bilerek yok — kesim saati ayarlanabilir bir değer ve saklanan bir son kullanma anı, ayar değiştiği gün yalan söylerdi.

## NeighborInviteClaim (kabul edilmiş komşu daveti)

Davetin **kişiye yapıştığı** yer (kullanıcı sorusu 12.08: *"web'de hesap açsın, gezsin, sonra uygulamayı yüklesin — sepete geldiğinde daveti görebilmeli"*). Çerez yalnız kimliği olmayan ziyaretçinin köprüsüdür; kimlik doğduğu an kabul buraya geçer.

<!-- alanlar:neighbor_invite_claim -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `invite_id` | uuid |  |  |
| `customer_id` | uuid |  |  |
| `created_at` | timestamptz |  | `now()` |
| `chosen_at` | timestamptz |  | `now()` |
| `declined_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **`invite_id`** — hangi davet (`NeighborInvite`)
- **`customer_id`** — kabul eden müşteri

**Tekillik `(invite_id, customer_id)`:** aynı kişi aynı daveti bir kez kabul eder; ikinci tıklama yeni satır açmaz.

**Neden profilde bir kolon değil:** getiren daveti (`referred_by`) ömürde bir kezdir; komşu daveti bir SEFERE bağlıdır, tekrarlanır ve **aynı kişiyi iki komşusu iki ayrı sefere çağırabilir**. Tek kolon o hâlde veri kaybettirir.

**Durum kolonu YOK — "bekliyor" türetilir:** o daveti künyesinde taşıyan (iptal olmayan) sipariş yoksa ve seferin penceresi hâlâ açıksa. İkisi de zaten başka yerde ölçülüyor; üçüncü bir damga, iptal edilen siparişte elle geri alınacak bir durum daha demekti.

**Satır silinmez:** kabul olmuş bir olaydır ve "kaç davet kabul edildi, kaçı siparişe döndü" sorusunun tek kaynağıdır. Hesap silinirse `cascade` ile düşer (kişisel veri, 0037).

## PointsEntry (puan hareketi)

Oyunlaştırma/sadakat: müşteri aksiyonları puan kazandırır, biriken puan kişisel kupona çevrilir. Ledger; bakiye **türetilir** (Σ points).

<!-- alanlar:points_entry -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `customer_id` | uuid |  |  |
| `points` | int |  |  |
| `reason` | points_reason |  |  |
| `ref_id` | uuid | • |  |
| `note` | text | • |  |
| `created_by` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`points`** — +kazanım / −harcama (delta)
- **`reason`** — bağlam adları `ProductFeedback.context` ile **hizalı** — aynı olayı iki sözlükle adlandırmamak için
- **`ref_id`** — ilgili kayıt (review/order/discount…)
- **`note`** — serbest sebep — **yalnız `manual`'da**: "gecikme telafisi — jest"
- **`created_by`** — elle girişte personel; sistemin verdiği puanda boş

Puan bakiyesi = Σ `points` (saklanmaz, türetilir). Kupona çevirme: `redemption` (negatif) + kişisel `Discount` (`customer_id`).

**Elle düzeltme iz bırakır:** operasyon ekranı "± puan + sebep" ister; sebep yazılmadan kayıt olmaz. `reason` neden verildiğinin **sınıfıdır**, `note` o tek olayın hikâyesidir — ikisi ayrı sorular, biri diğerinin yerini tutmaz.

**İstismar tavanı defterin kendisinde:** "aynı ürüne bir kez" kuralı `(customer_id, reason, ref_id)` üzerinde kısmi unique indeksle durur — uygulama katmanı unutsa bile ikinci puan yazılamaz. Günlük tavan sayımla bakılır (aynı gün, aynı sebep).

**İki davet, iki sebep ve ikisi AYNI turda doğabilir** (17.10): hesapsız bir komşu, komşu bağlantısından gelip kaydolur ve sipariş verirse davet eden hem `referral` (bir müşteri kazandırdı) hem `neighbor` (bir sefere sipariş ekletti) kazanır. Çift ödeme değildir — iki farklı şey oldu. Kaynakları da ayrı: `referral`ın `ref_id`si yeni MÜŞTERİ, `neighbor`ınki komşunun SİPARİŞİ.

## Ticket (müşteri talebi / şikâyet)

Basit yaşam döngüsü; siparişe ve ürünlere isteğe bağlı bağlanır (bkz. `DOMAIN.md §15`).

<!-- alanlar:ticket -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `customer_id` | uuid |  |  |
| `order_id` | uuid | • |  |
| `order_item_ids` | uuid[] |  | `'{}'` |
| `conversation_id` | uuid | • |  |
| `source` | ticket_source |  |  |
| `type` | ticket_type |  |  |
| `status` | ticket_status |  | `'open'` |
| `handled_by` | ticket_handler |  | `'human'` |
| `ai_draft_reply` | text | • |  |
| `ai_draft_generated_at` | timestamptz | • |  |
| `subject` | text | • |  |
| `return_triggered_at` | timestamptz | • |  |
| `reply_pending_since` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
| `resolved_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **`order_item_ids`** — ilgili sipariş kalemleri (boş olabilir)
- **`conversation_id`** — WhatsApp'tan açıldıysa
- **`source`** — **geliş yolu**: sipariş detayından / genel formdan / WhatsApp'tan / personelin elle açtığı
- **`status`** — yeniden açılabilir → `open`
- **`handled_by`** — talebi kim yürütüyor (16.08); devralmada `human`'a döner ve AI o talepte susar
- **`ai_draft_reply`** — hibrit modun bekleyen AI taslağı (16.5 deposu, UI 16.08) — mesaj DEĞİL, onaylanmadan gitmez
- **`ai_draft_generated_at`** — taslağın üretim anı — önbellek anahtarı; taslakla birlikte dolar/boşalır (kısıt)
- **`return_triggered_at`** — admin bu talepten iade akışını başlattı
- **`reply_pending_since`** — müşterinin OKUMADIĞI bir karşı taraf cevabı ne zamandan beri bekliyor (17.08); cevap maili buradan gecikmeli gider

**`reply_pending_since` — cevap maili ANINDA değil, OKUNMAMIŞSA gider (kullanıcı isteği 16.08, karar 17.08).** Eski kural "her cevap bir mail"di; operatör üç dakikada beş satır yazınca beş mail gidiyordu ve canlı zil (16.8) o mailleri büsbütün gereksiz kıldı — ekranı açık müşteri cevabı zaten anında görüyor. Şimdi cevap yazılınca bu damga **yalnız boşsa** dolar (gecikme İLK okunmamış cevaptan sayılsın; her satırda tazelenseydi hızlı yazan operatör maili sonsuza dek ertelerdi), müşteri yazışmayı okuyunca boşalır, dakikalık süpürge gecikme dolduğunda hâlâ doluysa maili gönderip boşaltır. **Ayrı bir "okundu" damgası AÇILMADI:** bu kolon zaten "okunmamış cevap var mı" sorusunun cevabıdır. Mail susturulmuyor ERTELENİYOR — müşteri yazıp uygulamayı kapatmış olabilir ve cevabı hiç öğrenmemesi en kötü sonuçtur.

**Geliş yolu `conversation_id`'den türetilemez:** konuşma bağı yalnız WhatsApp'ı ayırır; "sipariş detayından geldi" ile "genel formdan gelip sipariş seçti" ikisi de `order_id` dolu bırakır, ama admin için farklı şeylerdir — birincisinde müşteri neyden şikâyet ettiğini biliyordu, ikincisinde aradı buldu.

**`handled_by` Faz 1'de de var, AI olmadan.** Alanı sonra eklemek, o güne kadar yazılmış her talebin geçmişini belirsiz bırakırdı. **Üç mod 16.08'de netleşti (kullanıcı kararı):** `human` = bugünkü hâl; `hybrid` = AI cevap yazmaz TASLAK yazar (`ai_draft_reply`), operatör "cevaba çevir / düzenleyerek gönder" ile tüketir ve giden mesajın göndereni `admin`dir (`ai` yalnız AI'ın KENDİ gönderdiği — 20-yapay-zeka §75); `ai` = özerk, operatör izler/devralır. Mod ekrandan seçilir; ~~motorun kendisi 16.5'in işidir — motor geldiğinde hangi talebi nasıl yürüteceğini bu alandan okuyacak~~ **motor da aynı gün yazıldı (16.08):** `support_ai` turu bu alanı okuyup `hybrid` olana taslak üretiyor, `ai` olana özerk cevap yazıyor; şüphede alanı `human`'a düşürüp susuyor. Moddan düşerken bekleyen taslak temizlenir (bayat cevap "hazır" diye sunulmasın).

**İade sonucu SAKLANMAZ, türetilir:** tutar ve durum siparişin iade hareketlerinden okunur (`MoneyMovement.order_refund`, `OrderItem.fulfilled_qty`). Talepte duran tek şey **tetiğin çekildiği an**dır — o da türetilemez, çünkü bir siparişe birden çok talep açılabilir ve iadeyi hangisinin doğurduğu ancak yazılırsa bilinir. İade **siparişte yaşar**, talep ona bağlanır (DOMAIN §8, §15).

**Kuyruk sırası (`son mesaj: bugün`) saklanmaz:** `max(ticket_message.created_at)` tam ve tek-anlamlıdır → okuma görünümünde türetilir (`ticket_queue`), tabloya kopyalanmaz. Aynı desen: `available_stock`, `order_sale`, `product_listing`.

## TicketMessage (talep yazışması)

<!-- alanlar:ticket_message -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `ticket_id` | uuid |  |  |
| `sender` | ticket_sender |  |  |
| `author_id` | uuid | • |  |
| `body` | text |  |  |
| `language` | text | • |  |
| `translations` | jsonb | • |  |
| `translated_at` | timestamptz | • |  |
| `attachments` | text[] |  | `'{}'` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`sender`** — **`ai` ayrı bir göndericidir** — insanınkinden ayırt edilmeden gösterilemez
- **`author_id`** — yazan personel (`admin`); müşteri ve AI mesajında boş
- **`language`** — metnin GERÇEK dili (ISO 639; enum değil — müşteri Boşnakça yazabilir). `null` = tespit koşmadı
- **`translations`** — makine çevirileri `{tr?,fr?,de?}` — **kaynak dil torbada YOKTUR**
- **`translated_at`** — çeviri işi baktı mı; **başarısızlıkta da dolar** (sonsuz retry yok)
- **`attachments`** — storage yolu (fotoğraf vb.)

**Yazışma İKİ YÖNLÜ çevrilir (20.2):** müşteri kendi dilinde yazar personel Türkçe okur, personel Türkçe yazar müşteri kendi dilinde okur. Tek yön çevirmek yazışmanın yarısını anlaşılmaz bırakırdı. Orijinal `body`'de kalır, çeviri yanına yazılır — makine çevirisi hiçbir zaman yazanın cümlesi sanılamaz. Gösterim `resolveUserText` (domain-core): site dili → yoksa orijinal.

**Mesajda "metin değişti, çeviriyi düşür" tetikleyicisi YOK ve gerekmiyor:** gönderilmiş mesaj değişmez — güncelleyen bir yol yok, yazışma bir defterdir. `TicketMessageService`'in güncelleme şeması bu yüzden DAR (`TicketMessageTranslationUpdate`: yalnız çeviri alanları); `body` orada olmadığı için "mesajı düzelt" demek isteyen bir kod derlemede durur.

**Neden `ai` üçüncü bir gönderici:** "AI yazdı" bilgisini `admin` içine gömmek, sonradan "bunu kim söyledi" sorusunu cevapsız bırakırdı. Müşteriye giden metin aynıdır; ayrım **iç izlenebilirlik** içindir ve admin ekranında görünür (tasarım: "AI'nın yanıtları admin'e kendi yazmış gibi gösterilmez").

**İç not yok — bilerek.** Yazılan her şey müşteriye aynen görünür; ekran bunu söyler ("aynen müşteriye görünür"). İç notu aynı diziye koymak, bir gün yanlış kutuya yazılmış bir marj cümlesinin müşteriye gitmesi demektir. İç değerlendirme gerekiyorsa ayrı bir mekanizma ister, bu dizi değil.

## Setting (işletme ayarı)

**Tablo adı `settings`** (çoğul — orada bir ayar değil, ayarlar durur; satır tipi tekil: `Setting`).

Parametrik değerler **env'e veya koda gömülmez** (blueprint STACK §10): kesim saati, eşikler ve tavanlar işin sahibinin kararıdır ve dağıtım beklemeden değişebilmelidir.

<!-- alanlar:settings -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `key` | text |  |  |
| `scope_type` | setting_scope |  | `'global'` |
| `scope_id` | text | • |  |
| `value` | jsonb |  |  |
| `description` | text | • |  |
| `updated_at` | timestamptz |  | `now()` |
| `updated_by` | uuid | • |  |
<!-- /alanlar -->

**Kararlar**

- **`key`** — ör. `order_cutoff_time`
- **`scope_type`** — Üç kaynak 03.08'de HİZALANDI (migration haklı sayıldı). Çözüm sırası **en özgülden en genele: `warehouse` > `zone` > `channel` > `country` > `global`** — depo bölgeden dardır (bir bölge tek depoya bağlıdır, bir depo çok bölgeye hizmet eder); sıra ters olsaydı bölge satırı depo satırını sessizce ezerdi. Gerekçe ölçüm doğruluğu: rota/paketleme birim maliyeti ve kesim saati depo başına farklılaşır, global kalırsa kâr sessizce yanlışlaşır (`0016` künyesi). Ayarlar ekranı (09.16) ekseni henüz SUNMUYOR — kablolama operasyon şeridinde, gerekçe `settings-catalog.ts` künyesinde
- **`scope_id`** — kanal `b2b`, ülke `FR`, bölge uuid; global'de null. Üç farklı tipi taşıdığı için metin
- **`value`** — ayar sayı, metin, saat, bayrak ya da nesne olabilir
- **`description`** — admin ekranında ne işe yaradığı
- **`updated_by`** — Değişikliğin AKTÖRÜ (09.16). **`null` = "sistem kurdu", "bilinmiyor" DEĞİL** — tohum satırlarını kimse değiştirmedi; ekran boş aktörü "sistem varsayılanı" diye okur, uydurma isim yazmaz. `set(…, { actorId })` opsiyonel, çünkü ayar yazan her şey insan değil (tohum, göç, iş süreçleri) ve onlara sahte aktör atamak, izi *güvenilir sanılan* bir yalana çevirirdi. `on delete set null`: ayrılan personel izi götürür, ayarı değil |

**Kapsamlı (scoped) çözüm:** aynı anahtar depoya/bölgeye/kanala/ülkeye göre farklılaşabilir; çözücü **en özgül** kapsamı seçer (depo > bölge > kanal > ülke > global), yoksa global'e düşer. Hiç satır yoksa **çağıranın verdiği varsayılana** düşülür — varsayılan koda gömülü kalmaz, çağrı yerinde görünür. Aynı anahtar + aynı kapsam iki kez tanımlanamaz (kısmi unique indeks). Önbellekli çözücü; yazmada önbellek düşer.

**İSTİSNA — KOŞUL ayarlarında en KATISI kazanır** (kullanıcı kararı 09.08, `SettingsService.STRICTEST_WINS`; bugün tek üye `min_basket_cents`). Sebebi bir ölçümle görüldü: bu anahtarın iki satırı **rakip değil, birlikte karşılanması gereken iki koşul**tur — `channel: b2b` 120 € bir **ticari şarttır** (toptan fiyat vermenin karşılığı; mesafeyle ilgisi yok), bölge satırı ise bir **lojistik tabandır** (aracın o tura çıkması anlamlı olsun). "En dar kazanır" bunları rakip sayıp bölgeyi kanalın önüne geçiriyordu ve o bölgedeki işletme müşterisi 120 € yerine 45 € ile toptan fiyat alabiliyordu. Kural bugüne dek görünmüyordu, çünkü `zoneId` hiçbir çağırandan geçmiyordu (07.15); bağlandığı gün ortaya çıktı.

Ödünleşme açıkça yazılı: bu anahtarlarda bir eşiği dar kapsamda **yükseltebilir ama düşüremezsiniz**. **Fiyat ayarları listede DEĞİL** (`shipping_fee_cents`): orada kapsam "hangi tarife" sorusunun cevabıdır — Alman müşteri Almanya tarifesini öder, "en pahalısını" değil.

**İKİNCİ İSTİSNA — kargo siparişinde okuma KANALLA sınırlıdır** (kullanıcı kararı 10.08, `ScopeLimit.only`). Yukarıdaki iki koşuldan biri teslimat yoluna bağlı: **lojistik taban kargoda yoktur** (araç çıkmaz, taşıyıcı gider ve ücretini müşteri öder), **ticari şart ise her yolda geçerlidir**. Kapsam düşürerek çözülemiyordu — `zoneId`yi boş geçmek bölge satırını eler ama **küresel satır her zaman eşleşir**, yani operatör küresel bir eşik yazdığı gün kargo siparişleri sessizce ona takılırdı. Kural artık kodda: kargo yolunda okunan tek satır kanalın kendisidir (`application/cart/min-basket.ts`, dört birim testi). Bu güvence sayesinde taban küresel satıra yazılabildi — bölge bölge tekrarlanması gerekmiyor.

**Yüklü varsayılanlar** (migration'ın kendisinde — test verisi değil, sistemin zemini; `db:reset` sonrası seed çalışmasa da yerinde olmalı). Para değerleri **cent**, yüzdeler tam sayı:

| Anahtar | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `reservation_ttl_minutes` | 30 | Checkout rezervasyon + ödeme + fiyat penceresi (Stripe oturum asgarisi; altına inilemez) |
| `order_cutoff_time` | `"16:00"` | Sonrasında gelen sipariş bir SONRAKİ rota gününe yazılır |
| `min_basket_cents` | 4000 | Asgari sepet — **yalnız kapıya teslim** için lojistik taban; kargoda uygulanmaz (0 = alt sınır yok) |
| `free_shipping_threshold_cents` | 6000 | Ücretsiz kargo eşiği |
| `shipping_fee_cents` | 790 | Eşik altı kargo ücreti (KDV'ye tabi) |
| `cod_max_cents` | 30000 | Kapıda ödeme genel tavanı (kötüye kullanım freni) |
| `cash_legal_limit_cents` | 100000 | Nakit yasal sınırı — aşımda UYARI, engel değil |
| `payment_term_days` | 30 | Vade süresi varsayılanı |
| `near_expiry_percent` | 25 | Yaklaşan son tarih eşiği (kalan raf ömrü %) |
| `near_expiry_discount_percent` | 30 | Önerilen near-expiry indirimi — karar insanın |
| `mlor_percent` | 75 | Mal kabulde asgari kalan raf ömrü %; altında uyarır, engellemez |
| `delivery_proof_required` | `{"b2b":true,"b2c":false}` | Teslim onayı kapsamı |
| `delivery_summary_email` | true | Teslimde özet e-postası otomatik gitsin mi |
| `route_delivery_unit_cost_cents` | 250 | Rota teslimat birim maliyeti (kâr hesabı) |
| `packaging_unit_cost_cents` | 120 | Paketleme birim maliyeti (kâr hesabı) |
| `door_packaging_unit_cost_cents` | 0 | Kapı önü satışta paketleme birim maliyeti — mal elden gidiyor, soğuk zincir paketi yok |

Oyunlaştırma (puan değerleri, puan→kupon eşiği) ve ödeme komisyon oranları ilgili modülleriyle eklenir.

> **Bu varsayılanları DEĞİŞTİRENE not (03.08).** Sayılar artık üç yerde yaşıyor: migration (`0016` ·
> `0037` · `0038`), yukarıdaki tablo ve Ayarlar ekranının sözlüğü (`settings-catalog.ts` —
> ekran "varsayılan 20,00 €" yazıp "Varsayılana dön" sunduğu için fabrika değerini bilmek zorunda;
> satır düzenlenince o değer veride kalmıyor). Üçüncüsü **nöbete bağlı**: `settings-catalog.test.ts`
> migration dosyalarını okuyup her anahtarı karşılaştırıyor, ayrışırsa test düşer ve hangi anahtar
> olduğunu söyler. Yani migration'daki bir sayıyı değiştirmek serbest — testin söylediği yeri de
> güncelleyin, yoksa ekran yalan bir "varsayılan" gösterir. Bu tablo nöbetin dışında; elle tutulur.
