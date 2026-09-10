# Veri Modeli — MCP Asistanı

Asistanın onay kuyruğu, bağlantı anahtarları ve çağrı izi.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

> **BİÇİM (02.18 · 26.08):** her varlık iki parçadır — **alan listesi TÜRETİLİR**
> (`<!-- alanlar:… -->` bloğu; `pnpm docs:sync` migration'lardan üretir, arasına elle yazılan her
> şey silinir) ve **kararlar İNSANIN** (yalnız söyleyecek şeyi olan alan). Kolon adını, tipini,
> varsayılanını aramak için listeye bak; *neden öyle* sorusunun cevabı kararlardadır.

> **ÜÇ TABLO, İKİ AYRI SORU.** `assistant_proposal` *"asistan ne yapmak istiyor"* sorusunun evi;
> öteki ikisi *"kim bağlanabiliyor ve ne yaptı"* sorusunun. Aynı dosyada durmalarının sebebi
> zincirin uçları olmaları: anahtar kapıyı açar, araçlar kuyruğa yazar, operatör uygular.
> Mimari gerekçeler `../AI_ADMIN_ASSISTANT.md`'de; burada yalnız verinin kararları var.

---

## AssistantProposal (onay kuyruğu satırı)

**Tasarımın kalbi ve tek yazma kapısı.** Asistanın hiçbir aracı doğrudan yazmaz; ürettiği şey bu
tabloda bir satırdır. Operatör onaylayınca uygulama **varlığın kendi servis kapısından** geçer —
kuyruk ikinci bir yazma yolu AÇMAZ. Açsaydı iş kuralları (motor doğrulamaları, depo değişmezi,
fiyat kanalları) atlanabilen bir kapı doğardı.

<!-- alanlar:assistant_proposal -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `kind` | public |  |  |
| `source_session` | text | • |  |
| `payload` | jsonb |  |  |
| `summary` | text |  |  |
| `reason` | text | • |  |
| `status` | public |  | `'pending'` |
| `expires_at` | timestamptz |  |  |
| `created_at` | timestamptz |  | `now()` |
| `decided_by` | uuid | • |  |
| `decided_at` | timestamptz | • |  |
| `decided_note` | text | • |  |
| `applied_at` | timestamptz | • |  |
| `result` | jsonb | • |  |
| `error` | text | • |  |
<!-- /alanlar -->

**Kararlar**

- **`kind`** — DB enum'u (`assistant_proposal_kind`), serbest metin değil: uygulayıcısı olmayan bir
  tip kuyruğa hiç yazılamamalı. Şema ↔ uygulayıcı eşliği testle de kilitli
  (`PROPOSAL_PAYLOAD_SCHEMAS` ↔ `APPLIERS`) — "kuyruğa düşen ama uygulanamayan öneri" en sinsi
  çürüme yoludur: reddedilmeyi bekleyen kalemler onay refleksini köreltir.
- **`payload`** — `jsonb`, tipe göre ayrı Zod şeması. Tek bir geniş tablo yerine serbest gövde
  bilinçli: on bir tipin alanları ortak değil ve her yeni tip için kolon eklemek tabloyu kararsız
  yapardı. Şekil doğrulaması yazma anında (araç) ve okuma anında (gövde) iki kez yapılıyor —
  bozuk bir dilekçeye form çizmek, doldurulup kaydedilemeyecek bir ekran demekti.
- **`summary` / `reason`** — özet operasyonun kelimesiyle *ne yapılacağını*, gerekçe *neden*
  önerildiğini söyler. İkisi ayrı çünkü kart özeti taşır, karar diyaloğu gerekçeyi de gösterir:
  gerekçesiz bir öneri, onaylanacak değil güvenilecek bir şeydir.
- **`status`** — `pending` → `applied`/`rejected`/`failed`, ya da süre dolunca `expired`.
  **`expired` bir KARAR DEĞİLDİR** ve kısıt bunu zorluyor (`assistant_proposal_decided_status`:
  `decided_at`/`decided_by` yalnız gerçekten karar verilmiş hâllerde dolu). Ayrım geçmişte
  okunacak: "reddettim" ile "bakamadım" aynı şey değil.
- **`expires_at`** — zorunlu ve `> created_at` (kısıt). Süresiz bekleyen öneri, bir gün bayat
  veriyle uygulanır: eşik altı sayılan stok dolmuş, teklif verilen parti tükenmiş olabilir.
  Süpürme cron'u saatte bir tarar (`expire_proposals`) ve satırı `expired` yazar — **silmez**,
  çünkü "asistan bunu önermişti ama bakılmadı" ölçülebilir bir gerçektir.
- **`decided_by`** — kararı veren personel; `set null` (personel silinse geçmiş karar bozulmaz).
  `null` + `applied` = "sistem uyguladı" değil, "kim olduğu bilinmiyor" — ikisi farklı cümledir.
- **`result`** — uygulamanın doğurduğu kaydın kimliği ve özeti (açılan sipariş, yazılan hareket).
  Kuyruk satırı ile sonucu arasındaki köprü: onaysız hiçbir şey yazılmadığının kanıtı da bu.
  `jsonb` çünkü her tipin sonucu farklı şekilde — tek bir `applied_ref uuid` kolonu, iki kayıt
  doğuran tiplerde (transfer: iki hesap ayağı) yalan söylerdi.
- **`error`** — uygulama DENENDİ ve düştü. `status='failed'` ile birlikte yaşar ve `rejected`tan
  ayrıdır: biri operatörün kararı, öteki motorun reddi. Ekran ikisini ayrı çiziyor çünkü
  "beğenmedim" ile "sistem yapamadı" farklı sonraki adımlar gerektirir.
- **`source_session`** — öneriyi hangi asistan oturumunun ürettiği. Bugün serbest metin ve
  denetlenmiyor: MCP oturum anahtarı (§4'ün ikinci katmanı) yazılmadığı için doğrulanabilir bir
  oturum kimliği yok. Alan şimdilik teşhis içindir, yetki için DEĞİL.
- **`decided_note`** — reddederken yazılan sebep. Boş bırakılabilir ve bu bilinçli: her reddin
  gerekçesini zorunlu kılmak, kuyruğu temizlemeyi yavaşlatır ve uydurma notlar doğururdu.

## McpConnectionKey (bağlantı anahtarı)

Asistanın kapısındaki kimlik (22.4). Deneme dilimi kapıyı tek bir `.env` anahtarıyla açıyordu ve o
anahtarın üç kusuru vardı: **iptal edilemez** (sızarsa tek çare süreci durdurmak — yani herkesin
bağlantısını birlikte kesmek), **süresiz**, **kapsamsız** (anahtarı bilen 25 aracın hepsini çağırır).

<!-- alanlar:mcp_connection_key -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `label` | text |  |  |
| `token_hash` | text |  |  |
| `scope` | mcp_scope |  | `'read'` |
| `created_by` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
| `expires_at` | timestamptz |  |  |
| `revoked_at` | timestamptz | • |  |
| `last_used_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **`token_hash`** — düz metin HİÇBİR yerde saklanmaz; üretim anında bir kez gösterilir, sonra
  yalnız SHA-256'sı yaşar. Sızan bir yedek dosyası çalışan anahtar vermemeli. Karşılaştırma da
  hash üzerinden ve sabit zamanlı (`timingSafeEqual` eşit uzunluk ister; ham dizgiler uzunluk
  sızdırır).
- **`scope`** — `mcp_scope` enum'u, KADEMELİ: `propose` `read`i kapsar (öneri veren okuyabilmeli,
  öneri kör kurulamaz). İki değer yeter çünkü araç takımının ayrımı adlandırmada zaten yazılı —
  `propose_*` ile başlayan araçlar kuyruğa yazar, kalanı okur. **25 araçlık bir eşleme sözlüğü
  yazılmadı** ve bu bilinçli: yeni araç sözlüğe eklenmediğinde sözlük sessizce yanlış cevap verir
  (bilinmeyen araç hangi ailede sayılır?), adlandırma kuralı ise yeni araçta kendiliğinden işler.
- **`expires_at`** — zorunlu, `> created_at`. "Sonsuza kadar geçerli" seçeneği YOKTUR; env
  anahtarının kusuru buydu. Varsayılan 90 gün uygulama katmanında, üretirken kısaltılabilir.
- **`revoked_at`** — dolu = iptal. **Satır SİLİNMEZ:** iptal edilmiş anahtarın çağrı geçmişi
  (`mcp_call_log`) sahipsiz kalmamalı, *"bu çağrıları iptal ettiğim anahtar yapmıştı"* sorusu
  cevaplanabilir olmalı.
- **`last_used_at`** — telemetri, best-effort (cevabı bekletmez, hatası kapıyı düşürmez).
  **`null` = HİÇ kullanılmadı**, sıfır değil — panel "hiç kullanılmadı" yazar, "0 gün önce" değil
  (`CLAUDE §1`: ölçülemeyen değer sıfır değildir).
- **`created_by`** — anahtarı üreten personel, `set null`. Silinirse "kim ürettiği bilinmiyor"
  olur, "sistem üretti" değil.

## McpCallLog (çağrı izi)

Her araç çağrısı bir satır (`AI_ADMIN_ASSISTANT §8`): *"zincirleme kötüye kullanım tek tek
görünsün."* Yazım fire-and-forget — çağrının cevabını bekletmez ve bu satırın düşmesi aracı
düşürmez (`capture_error`ın kendi gerekçesinin aynısı: iz tutma yolunda fırlayan hata, izi tutulan
asıl işi maskeler).

<!-- alanlar:mcp_call_log -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `connection_key_id` | uuid | • |  |
| `tool` | text |  |  |
| `ok` | boolean |  |  |
| `duration_ms` | int |  |  |
| `error` | text | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **ARGÜMAN YAZILMAZ** — tabloda böyle bir kolon yok ve olmayacak. Araç argümanı müşteri adı,
  adres, tutar taşıyabilir; teşhis için hangi aracın hangi hatayla düştüğü yeter (`OBSERVABILITY
  §5`: log'a kimlik yazılır, içerik yazılmaz).
- **`error`** — `scrubMessage`den geçmiş. En tehlikeli sızıntı bizim yazdığımız bağlam değil,
  **veritabanının kısıt ihlaline gömdüğü değerdir**; ham mesaj o değeri olduğu gibi taşırdı.
- **`connection_key_id`** — `set null`. `null` iki şey demek olabilir: env artçısıyla yapılmış
  çağrı, ya da anahtarı sonradan silinmiş çağrı. İkincisi pratikte doğmaz çünkü anahtar
  silinmiyor (yukarıdaki karar) — yani `null` bugün "env anahtarı" diye okunur.
- **Saklama 90 gün** (`purge_observability`) — iz bir TEŞHİS verisidir, iş kaydı değil
  (`OBSERVABILITY §1`). Sorduğu soru "bu anahtar ne yaptı"; üç ay geriye bakmak kötüye kullanımı
  görmeye fazlasıyla yeter, daha uzunu süresiz tutulan bir davranış geçmişi olurdu.

---

## AiUsage (AI kullanım defteri)

Modele giden HER koşu bir satır (15.27 · kullanıcı kararı 10.09): hangi görev, hangi model, kaç jeton
ve yazıldığı andaki tarifeyle yaklaşık kaç **dolar**. Asistanın değil bütün AI koşularının defteri —
bu dosyada, çünkü okuyanı asistanın `ai_costs` aracı ve AI'ya dair veri kararları tek yerde dursun.

<!-- alanlar:ai_usage -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `task` | text |  |  |
| `model_id` | text |  |  |
| `ok` | boolean |  |  |
| `failure_reason` | text | • |  |
| `input_tokens` | integer | • |  |
| `output_tokens` | integer | • |  |
| `cached_input_tokens` | integer | • |  |
| `total_tokens` | integer | • |  |
| `cost_usd` | numeric(12,6) | • |  |
| `conversation_id` | uuid | • |  |
| `ticket_id` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **YAZAN TEK KAPI koşucunun kancası** — `@lezzet/ai` `setAiUsageRecorder`; kaydedici
  `@lezzet/application/ai/usage-recorder`, süreç başında web (`instrumentation-node.ts`) ve backend
  (`index.ts`) takar. Çağıranlar (ajan, taslak, çeviri, ses, banka, B2B özeti, analitik) kayıt
  YAZMAZ: on kopya, on birinci çağıranın unutacağı bir kural olurdu — unutulan koşu bedava görünürdü.
- **`cost_usd` YAZIM ANINDA donar** — o anki tarifeyle (`settings.ai_model_prices_usd`) hesaplanır.
  Okuma anında hesaplansaydı tarife değiştiği gün geçen ayın harcaması bugünün fiyatıyla yeniden
  yazılırdı. Tarifesi olmayan model ya da ölçümsüz koşu `null` — bilinmiyor, sıfır değil.
- **Para birimi DOLAR** (kullanıcı kararı 10.09) — sağlayıcının faturası dolar; euroya çevirmek
  ikinci bir tahmin katmanı (kur) eklerdi.
- **Başarısız koşu da yazılır** — şema ihlalinde model çalıştı ve jeton yaktı (hata ölçümü taşıyor).
  `not_configured` yazılmaz: modele hiç gidilmedi. `ok` ile `failure_reason` ayrışamaz (kısıt).
- **`conversation_id` / `ticket_id`** — `set null`: sohbet ya da talep silinse de harcama kaydı kalır.
- **Özet `ai_usage_daily`** — Paris günü × görev × model; okuyan satır saymaz. `unpriced_calls`
  maliyeti bilinmeyen koşuları sayar ve `cost_usd` toplamı onları İÇERMEZ.
- **Saklama süresi YOK** — iş kaydıdır, teşhis değil (`OBSERVABILITY §1`); `purge_observability`
  ona dokunmaz.
