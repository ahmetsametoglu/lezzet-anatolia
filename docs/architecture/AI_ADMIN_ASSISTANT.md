# AI Yönetici Asistanı (MCP) — kurgu ve teknik sınırlar

> **STATÜ: KURGU BELİRLENDİ (09.08.2026) — DENEME DİLİMİ YAZILDI, ÜRETİM FAZ 2.** 30.07 niyet notu
> bu dokümana evrildi: kullanıcının kararlarıyla (finans sınırı · istemci · oturum modeli · yazma
> envanteri) kurgu ve sınırlar bağlandı. **Deneme dilimi (22.1) 09.08'de kullanıcı onayıyla erken
> yazıldı** — yerel, salt-okuma üç araç, Claude Code'dan bağlanılır; "Faz 1 bitmeden yazılmaz"
> kuralı ÜRETİM implementasyonu (ikili anahtar paneli, onay kuyruğu, OAuth, yazma araçları) için
> aynen yürürlükte. Bugünkü işlerin görevi §9'daki ilkeleri korumaktır.
>
> İlerleme: `docs/build/22-mcp-asistan.md` (22.1 deneme dilimi ✓ · 22.2 üretim turu Faz 1 sonrası).

---

## 1. Hedef (30.07 — değişmedi)

Bir yapay zekanın **MCP sunucusu** üzerinden yöneticinin işlerinin büyük kısmını yapabildiği, ama
bunu **sınırlı ve denetlenebilir** bir çerçevede yaptığı bir asistan katmanı.

İki cümleyle sınır: asistan **öneri üretir ve hazırlık yapar**; **uygulamayı yönetici onaylar.**
Yetki devri değil, **iş yükü devri**.

Kullanıcının saydığı işler (30.07):

- Sistem hatalarını inceleyip **rapor** sunmak (→ `OBSERVABILITY.md`, `error_log`)
- **Dönemsel paketler** hazırlamak (bayram sofrası, mevsim seçkisi → `Bundle`)
- Sosyal medya paylaşımı için **görsellere erişip** içerik hazırlamak
- **Pazarlama stratejisini** nispeten yönetmek (kampanya/indirim önerileri, koleksiyon kurgusu)
- **Finansal analiz** raporları (→ modül 12, `order_sale`, kârlılık)
- Genel asistanlık: "şu ürünün beyanı eksik", "şu tedarikçiye sipariş zamanı"
- **Belgeden veri girişi** (09.08 eki): satın alma faturasının görselini/dökümünü modele verip
  alım girişi (mal kabul) taslağı kurdurmak — görseli MODEL okur (istemci yeteneği), araç kuyruk
  satırı üretir, onay ve uygulama normal yoldan.

**Ne DEĞİL (09.08 netleştirmesi, kullanıcı kararı):** bu asistan bir **müşteri hizmetleri ajanı
değildir ve mesajlaşmayı YÖNETMEZ.** Müşteriyle ilgilenen, sisteme entegre AYRI ajandır
(`AI_CUSTOMER_AGENT.md` — sınıf 4, 15.8/16.5); cevap yazmak, göndermek, konuşmayı devralmak,
ajanı durdurmak MCP'nin araçları arasında YOKTUR — müdahale yüzeyi operasyon ekranıdır (15.5/15.13).
MCP asistanının bu alandaki tek yetkisi **GÖZLEMDİR**: yazışma yüzeyinin durumunu patrona raporlar
("bugün 14 konuşma, 2'si eskalasyonda, memnuniyet sinyali düşen konu: teslimat günü") — kimliksiz
ve içeriksiz (§6): konuşma KİMLİĞİ üzerinden aşama/konu-etiketi/duygu özeti okunur, ham mesaj
metni ve müşteri kimliği okunmaz. İki sistem birbirinin yerine geçmez, yan yana çalışır.

---

## 2. Kurgu — bir bakışta

```
Claude (claude.ai / Desktop / Code)
        │  streamable HTTP + OAuth (Bearer = bağlantı anahtarı)
        ▼
apps/backend  →  /mcp (Hono rotası)
        │  guard: bağlantı anahtarı → oran sınırı → oturum anahtarı (kapsam)
        ▼
   ARAÇ KATALOĞU (yetkinin kendisi — katalogda olmayan şey yoktur)
        │
        ├─ OKUMA araçları ──→ toplanmış görünümler/RPC'ler (maskeli) ──→ cevap modele
        │
        └─ YAZMA araçları ──→ assistant_proposal KUYRUĞU (hiçbir yazma doğrudan değil)
                                       │
                     operasyon paneli: yönetici tek tek onaylar (personel oturumu)
                                       │  onay MCP yüzeyinden VERİLEMEZ
                                       ▼
                     normal servis/motor yolu (domain-core kuralları) → uygulama + iz
```

Tasarımın kalbi (30.07 kararı, değişmedi): **asistanın gücü ne yazabildiğinde değil, neyi
uygulatabildiğinde.** Kuyruk varken kaçak bir asistanın yapabileceği en kötü şey, yöneticinin
reddedeceği bir öneri listesi üretmektir.

---

## 3. Mimari yerleşim

- **Ev: `apps/backend`** (Hono + node-server). Gerekçe: uzun ömürlü tek süreç (oran sınırı ve
  oturum süpürme cron'u için doğru yer), cron altyapısı zaten orada, müşteri web yüzeyinden fiziksel
  olarak ayrık (asistan arızası vitrini etkileyemez). Rotalar petit dizilimiyle:
  `src/mcp/{guard, rate-limit, server-factory, well-known, ...}`.
- **SDK ve protokol:** `@modelcontextprotocol/sdk`, **istek-başına stateless `Server`** (petit
  `server-factory.ts` deseni — durum DB'de, süreç yeniden başlasa oturum düşmez). MCP'nin
  **2026-07-28 spec'i** protokol çekirdeğini zaten stateless yaptı (oturum handshake'i ve
  `Mcp-Session-Id` kalktı; `tools/list` bağlantıdan bağımsız ve önbelleklenebilir) — desen artık
  spec'in kendisi. Sonuç bir teknik sınır doğurur: **araç listesi statiktir**, oturuma/kapsama göre
  değişmez; kapsam dışı çağrı listede gizlenerek değil çağrıda reddedilerek yönetilir.
- **Low-level `Server` API** (üst-seviye `McpServer` değil): araç şemaları düz JSON Schema olarak
  tanımlanır ve `tools/list`'e aynen geçer; `sessionKey` her şemaya tek yerden enjekte edilir
  (petit gerekçesi birebir geçerli).
- **`packages/ai` ile AYRIM — iki ayrı AI yüzeyi, karıştırılmaz:** `packages/ai` BİZİM arka planda
  çağırdığımız görevlerdir (çeviri, analitik özet; model bizim API anahtarımızla koşar, maliyeti
  20.3 ölçer). MCP ise DIŞ modelin bize bağlanmasıdır: **MCP sunucusu model çağırmaz**, model
  kullanıcının istemcisinde koşar ve token maliyeti bize yazmaz. MCP tarafında ölçülen şey çağrı
  sayısı ve oran sınırıdır (§8).
- **Araçlar mevcut kapıları çağırır:** yeni bir veri yolu açılmaz — okuma araçları özet
  görünüm/RPC'lerden okur, kuyruk uygulaması mevcut servis/motor kapılarından geçer (STACK §4).
  Asistan için yazılan tek yeni şey araç tanımları + kuyruk + maskeleme katmanıdır.

## 4. Kimlik ve anahtarlar — İKİLİ ANAHTAR (karar 09.08)

Petit `guard.ts` modeli birebir alınır; tablolar bize açılır (`mcp_connection_key`,
`mcp_assistant_session`, adlar implementasyonda netleşir):

1. **Bağlantı anahtarı** — Bearer, uzun ömürlü (90 gün), operasyon panelindeki ayarlardan üretilir
   ve iptal edilir. **Tek başına hiçbir veriye dokunamaz:** yalnız kapıyı açar (`tools/list` +
   çağrı yapabilme). Düz metin saklanmaz — SHA-256 hash + `revoked_at`/`expires_at`/`last_used_at`.
   Başarısız doğrulama jenerik cevap döner (bilgi sızdırmaz); anahtarsız `tools/list` bile dönmez.
2. **Oturum anahtarı** — **1 saat, parametrik** (`mcp_session_ttl_minutes`, ayar; kullanıcı kararı
   09.08 — 30.07'deki 10 dakika önerisi tartışıldı ve bırakıldı: asıl sınır süre değil KAPSAM +
   ONAY KUYRUĞU; kısa sürenin tek kazanımı çalınan anahtarın ömrünü kısaltmaktı ve uzun işleri
   ortada bırakıyordu). Panelden üretilir, sohbete yapıştırılır, **her araç çağrısında taşınır** ve
   **kapsamını kendi içinde taşır**: üretilirken araç ailesi seçilir (örn. yalnız rapor · rapor +
   öneri · + medya). Kapsam her çağrıda anahtardan çözülür; süresi dolan anahtar sohbet-içi hata
   metniyle yenisini istetir (panelden üretilir — model kendi anahtarını uzatamaz).
3. **Oran sınırı** — anahtar başına kayan pencere (petit: 60 çağrı/dk, bizde parametrik). Bellekte
   tutulur; **tek backend süreci varsayımı künyeye yazılır** — süreç çoğalırsa sınır DB'ye taşınır.
4. **Bağlanma yolu — claude.ai / Desktop connector (kullanıcı kararı 09.08):** OAuth akışı ilk
   günden kurulur (petit `well-known.ts` deseni: OAuth, aynı `mcp_connection_key` satırını jeton
   olarak üretir). CLI/Code yolu aynı doğrulamadan geçtiği için bedavaya gelir; ayrı iş değildir.
   Spec'in 2026-07-28 yetkilendirme sıkılaştırması implementasyonda güncel hâliyle doğrulanır (§10).

**Yetkinin gerçek kaynağı DB rolü değil ARAÇ KATALOĞUDUR:** sunucu içeride `serviceDb()` ile
çalışır ama asistanın dokunabildiği her şey bir araçtan geçer — katalogda olmayan tablo, kolon,
işlem asistan için yoktur. Kataloğa araç eklemek kullanıcı onayı gerektiren bir karardır (§9).

## 5. Onay kuyruğu — `assistant_proposal` (tasarımın kalbi)

- **Hiçbir yazma aracı doğrudan yazmaz.** Aracın ürettiği şey bir kuyruk satırıdır:
  `{tool, args(jsonb), summary, status}` — **niyet + parametre; asla ham SQL** (30.07 sorusu 3,
  karara bağlandı). `summary` insanın okuyacağı tek cümledir: "6 ürünlü 'Kış Sofrası' paketi,
  89 € — kalem payları içeride".
- **Onayın İKİ biçimi vardır (09.08 — yazma envanteri):** kuralın özü "asistanın yazdığı hiçbir
  şey onaysız MÜŞTERİYE GÖRÜNMEZ"dir ve iki yoldan sağlanır. ① **Atomik işlem** (vitrin işareti,
  fiyat/teklif, PO açma, bölge-gün değişikliği…) → kuyruk satırı; uygulama onaydan sonra. ②
  **Uzun üretim** (ürün detayının tamamlanması, sofra tarifi, paket kurulumu…) → **taslak-varlık
  deseni**: asistan doğrudan TASLAĞA yazar — ürün `passive`, tarif `is_active=false`, paket
  `is_active=false` doğar, üçü de sistemin ZATEN kurduğu taslak hâlleridir — ve **yayınlama
  (aktifleştirme) aracı YOKTUR**, o kapı insanındır (petit emsali: ajan staged taslağa yazar,
  admin Save eder). Taslak-yazma da kuyruğa kısa bir kayıt düşer ("tarif taslağı hazır: Sofra X")
  ki panelde onay bekleyen her şey TEK listede dursun.
- **Onay yüzeyi operasyon panelidir ve YALNIZ orasıdır** (personel oturumu + `requireStaff`).
  **Onay MCP yüzeyinden verilemez, onay aracı yazılmaz** — asistan kendi önerisini onaylayamaz;
  aynı gerekçeyle öneri kuyruğunu DEĞİŞTİREN araç da (iptal hariç) yoktur. 2026-07-28'in MCP Apps
  eklentisi sohbet içinde öneri ÖNİZLEMESİ göstermek için değerlendirilebilir (§10) — onay için asla.
- **Uygulama normal yoldan geçer:** onaylanan satır, ekrandaki server action'ların çağırdığı AYNI
  servis/motor kapılarından uygulanır (paket önerisi `bundleBalance` doğrulamasından, indirim
  DOMAIN §5 kurallarından). Kuyruk ikinci bir yazma yolu AÇMAZ — açsaydı iş kuralları atlanabilen
  bir kapı doğardı.
- **Tazelik:** öneri `expires_at` taşır (`assistant_proposal_ttl_hours`, parametrik, varsayılan 24)
  — dünkü stok durumuyla kurulmuş paket bugün onaylanınca kör uygulanmaz: süresi geçen satır
  `expired` olur, uygulama kapısı zaten bugünkü veriyle yeniden doğrular (motor).
- **İz:** her durum geçişi kimlikli ve zamanlı (`decided_by`, `decided_at`, `applied_at`); uygulanan
  öneri yarattığı kayıtların kimliklerini satırında taşır — "bu paketi kim kurdu" sorusunun cevabı
  "asistan önerdi, X onayladı"dır ve kaybolmaz.
- **Dışa dönük eylemler ayrı sınıftır:** müşteriye giden her şey (toplu e-posta 14.8, WhatsApp)
  kuyruğa bile girmez — Faz C'de ayrıca konuşulur (30.07 sorusu 7 açık tutuldu).

## 6. Veri sınırları — asistanın GÖREMEDİKLERİ

- **Son kullanıcı kimliği YOK** (30.07, değişmedi): araçlar kimlikli müşteri satırı döndürmez —
  ad, e-posta, telefon, adres, sipariş sahibi asla. Asistan "23 sipariş" görür, "Élodie Martin'in
  siparişi" görmez. Sipariş-düzeyi bakış gerektiren araç (örn. hata teşhisi) kimliği ID olarak
  taşır, kişisel alanları hiç seçmez (OBSERVABILITY §5'in "log'a kimlik yazılır, içerik yazılmaz"
  ilkesinin araç karşılığı).
- **Finans sınırı (kullanıcı kararı 09.08): TOPLANMIŞ MARJ.** Kategori/dönem düzeyinde marj ve
  kârlılık toplamları açık; **ürün-tekil alış fiyatı VE ürün-tekil marj kapalı** — marj yüzdesi
  satış fiyatıyla birleşince alış fiyatını türetir, o yüzden ikisi aynı sınıfın içindedir.
  Kârlılık raporu `order_sale` ve özet görünümlerden çalışır; tek tek alış satırına inen araç yoktur.
- **MALİYET AÇILDI, TEDARİKÇİ İLİŞKİSİ KAPALI (kullanıcı kararı 09.08 · 22.5).** Yukarıdaki
  "ürün-tekil alış fiyatı kapalı" kuralı inceldi: `catalog_lookup` son alış maliyetini,
  `stock_watch` parti maliyetini döner — asistan paket ve fırsat fiyatı önerirken kârlılık hesabı
  yapabilsin diye (aksi hâlde zararına bir fiyat önerir ve kimse fark etmez). Kapalı kalan şey
  **tedarikçi bağlamıdır**: brifingin tedarik önerisinde maliyet ile tedarikçi kodu yan yana durur
  ve o ikili *"hangi tedarikçiden kaça alıyoruz"* sorusunu cevaplar — bir partinin maliyetini
  bilmekten başka bir şey. Maskeleme testi bu ayrımı kilitliyor (`mcp.test.ts` künyesi).
- **Hassas ticari veri KAPALI:** tedarikçi alış fiyatları ve sözleşme koşulları, personel bilgileri,
  banka/kasa hareketlerinin ham dökümü, vergi kimlikleri. (Liste kodlama gününde gözden geçirilir;
  varsayılan kapalıdır — açmak karar ister, kapamak istemez.)
- **Kapalı veri OKUMA yönlüdür; GİRİŞ yönü kuyruktan açıktır** (09.08 netleştirmesi — fatura
  senaryosu): kullanıcının kendisinin modele verdiği bir belgeden (satın alma faturası) alış fiyatı
  içeren bir alım girişi taslağı kuyruğa YAZILABİLİR — bilgi zaten kullanıcının elindeydi, sızma
  yönü tersine dönmüyor. Yazan araç **write-only'dir**: yazdığını geri okuyamaz; DB'deki alış
  fiyatlarına açılan bir okuma kapısı bu yoldan doğmaz.
- **Toplanmış görünüm ilkesi:** okuma araçları öncelikle var olan özet görünüm/RPC'lerden okur
  (`order_sale`, `analytics_daily*`, `bundle_list_rows`, sağlık özetleri). Ham tablo taraması araç
  kataloğuna girmez; bir sorunun özeti yoksa **önce görünüm açılır, sonra araç** (§9'un ikinci
  ilkesinin sebebi).
- **Loglar:** `error_log` okuma aracı `scrubMessage`'dan geçmiş metni döner; OTP kodu hiçbir hâlde
  görünmez (OBSERVABILITY kuralları zaten böyle üretiyor — araç yeni bir süzgeç icat etmez).

## 7. Araç kataloğu — üç faz (güvenlik artan sırayla)

| Faz | Nitelik | Aday araçlar |
| --- | --- | --- |
| **A — salt okuma** ✅ *(22.1 · **dokuz araç** yazıldı, yerelde çalışıyor)* | kuyruk yok, maskeli özetler | `morning_briefing` (gün + `attention` listesi) · `sales_summary` · `system_errors` · `catalog_health` (eksik beyan/görsel + vitrin işaretleri) · `catalog_lookup` (**kimlik köprüsü** — addan `variantId`'ye + liste fiyatı + son alış maliyeti; 22.5) · `stock_watch` (ömrü dolan partiler, depo koduyla + `batchId`/`variantId` + fiyat/maliyet + motorun teklif kararı) · `sold_out_watch` · `demand_signals` (kapsanmayan posta kodu · sonuçsuz arama · ürün ilgisi) · `customer_pulse` (**yazışma-gözlem özeti** — kimliksiz ve içeriksiz sayım, §1 "Ne DEĞİL"; yönetim değil gözlem) |
| **B1 — atomik öneriler** | kuyruk satırı (§5 biçim ①) | vitrin işareti önerisi · kampanya/indirim tanımı · tedarik siparişi (PO) açma — eşik-altı sinyalinden · **rota/bölge önerisi** (talep panosu `postal_code_demand` + sipariş yoğunluğundan "şu kodları bölgeye ekle / şu günü aç") · stok eşiği istisnası · **banka satırı eşleştirme önerisi** (12.4'ün AI portu zaten bunun için boş bekliyor) · **alım girişi / mal kabul taslağı** (kullanıcının verdiği faturadan — §6 write-only nüansı; depo/parti/son-tarih eksikse asistan sorar, uydurmaz) |
| **B2 — taslak üretimler** | taslak-varlık deseni (§5 biçim ②) | **ürün detayının tamamlanması** (eksik-alan taraması → üç dilli açıklama + çeviri önerisi + görsel eşleme; **alerjen/saklama beyanı YALNIZ kaynaklı yazılır** — tedarikçi belgesi yoksa boş bırakır ve eksik raporuna yazar, gıdada uydurma tek yasak cevaptır) · **sofra tarifi taslağı** (üç dilli metin + varyant bağları; "üç dil dolmadan yayınlanamaz" kuralı VERİDE zaten duruyor) · dönemsel paket kurulumu (kalem + pay — `bundleBalance` motor doğrulamasından geçer) · koleksiyon kurgusu |
| **C — medya + dışa dönük** | ayrı karar turu | ürün görseli OKUMA (R2 URL — yazma ayrı yetki, `packages/storage` iki kovalı model) · sosyal içerik taslağı · müşteriye giden her şey (ayrı sınıf, belki hiç) |

Araç tasarım kuralları (petit dersleri): her araç tek iş yapar ve **özet döner** (tam JSON yalnız
açıkça istenince — bant genişliği modelin bağlam bütçesidir); hata metinleri modele yol gösterir
("anahtar süresi doldu → panelden yenisini iste"); çok adımlı yazma tek atomik araçta toplanır.

**Proaktif gündem — asistan yalnız sorulunca değil (kullanıcı beklentisi 09.08):** üç örnek
kayıtlı — *"günlük şunu da vermedi"* uyarısı · haftalık rota/bölge önerisi · müşteri taleplerine
göre paket önerisi. MCP doğası gereği pasiftir (sohbet açılınca konuşur); gündem iki mekanizmayla
taşınır: ① **sabah brifingi tek araçtır** ve her okuma aracının cevabında "dikkat isteyenler"
bölümü vardır — sohbeti "günaydın" ile açmak gündemi getirmeye yeter; ② patron dokunuşu bile
istemeyen akış için istemcinin zamanlanmış görevi (claude.ai — §10 doğrulanacak) ya da bizim
cron'un e-posta brifingi (`packages/ai` sınıf 3 işi — MCP değil). Gündemi ÜRETEN sinyallerin hepsi
sistemde zaten var: eşik-altı stok, yaklaşan DLC partileri, talep panosu, ürün-ilgi sinyali,
vitrin doluluğu, açık talepler.

## 8. Gözlemleme ve iz

- **`mcp_call_log`:** her araç çağrısı bir satır — araç adı, başarı, süre, hata, oturum kimliği.
  Fire-and-forget (cevabı bekletmez, hatası loglanır). "Zincirleme kötüye kullanım tek tek görünsün."
- **`captureError` kaynağı `'mcp'`:** asistan yolunun kendi hataları `error_log`'a bu kaynakla düşer
  (SOURCES'a eklenir) — asistanın "sistem hatalarını raporla" aracı kendi hatalarını da görür.
- **Oturum süpürme:** süresi dolan oturum anahtarları `apps/backend/src/jobs`'a eklenecek cron'la
  temizlenir (petit `cleanup-mcp-sessions` deseni).
- **Maliyet:** MCP çağrılarının token maliyeti bize yazmaz (model istemcide, §3 ayrımı) — izlenen
  şey çağrı hacmi. `packages/ai` maliyet görünürlüğü (20.3) bu kapsamın dışında kalır.

## 9. Bugünden korunan ilkeler (Faz 1 boyunca bağlayıcı)

1. **İş kuralı motorda kalır** (STACK §4). Asistan bir gün paket kuracaksa, kural `domain-core`'da
   olduğu sürece asistan da o kuraldan geçer. Kural uygulama katmanına sızarsa asistan için ikinci
   bir yol açmak gerekir — ve ikinci yol denetlenmeyen yoldur.
2. **Okuma yüzeyleri toplanmış görünüm üretmeye devam eder** (`order_sale`, `analytics_daily*`
   gibi). Asistanın ham satır yerine görünüm okuyabilmesi, maskeleme işini yarı yarıya azaltır.
3. **Onay yüzeyi MCP'nin dışındadır** — operasyon panelinin onay ekranları asistan gelmeden de
   "insan onayı" desenini kullanıyor (B2B onayı, moderasyon); o desen korunur.
4. **Araç kataloğu = yetki:** kataloğa araç eklemek kullanıcı onayı gerektirir; "faydalı olur"
   diye sessizce araç açılmaz.

## 10. İmplementasyon öncesi doğrulanacaklar

- **Spec/SDK güncelliği:** 2026-07-28 spec'i (stateless çekirdek, auth sıkılaştırması) ve Tier-1
  TS SDK'nın o günkü kararlı sürümü — özellikle claude.ai connector'ının OAuth gereksinimleri.
  Kaynak: [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) ·
  [duyuru](https://blog.modelcontextprotocol.io/posts/2026-07-28/).
- **Tasks eklentisi:** kuyruğa giren önerinin "onay bekliyor → uygulandı" yolculuğunu istemciye
  uzun-süren iş olarak göstermek için uygun mu (uygunsa kuyruk görünürlüğü bedavaya gelir).
- **MCP Apps eklentisi:** öneri ÖNİZLEMESİ (paket kartı taslağı) sohbet içinde gösterilebilir mi —
  yalnız gösterim; onay asla (§5).
- **Oran sınırı bellek varsayımı** deploy modeliyle hâlâ uyumlu mu (tek süreç?).
- **İstemcinin zamanlanmış görev desteği** (claude.ai) — sabah brifinginin patron dokunuşsuz
  gelmesi için; yoksa cron + e-posta brifingi yolu (§7 proaktif gündem).
- **Petit yeniden okuması:** `apps/backend/src/routes/mcp/` (guard 82 · server-factory 503 ·
  well-known 37 satır) — desen bugün 864 satır; kodlama günü güncel hâli okunur, buradaki özet değil.

## 11. Nerede izlenir — ve GERÇEK ön koşullar

- **Fiziksel ön koşul — İSTEMCİYE GÖRE İKİ YOL (09.08 inceltmesi, kullanıcı düzeltmesi):**
  claude.ai/Desktop connector'ı OAuth ile publik bir URL'e bağlanır → o yol **canlıya çıkışı
  (modül 18) bekler**. Ama **Claude Code yerel istemcidir**: localhost'taki backend'e `claude mcp
  add` + Bearer header ile OAuth'suz bağlanır — **deneme için deploy GEREKMEZ.** Yani asistan
  yerelde bugün denenebilir; publik URL yalnız "telefondan/sohbet uygulamasından kullanma"
  konforunun bedelidir. (Müşteri ajanının ön koşulu değişmez: 360dialog onboarding'i, 15.6.)
- **Tasarım ihtiyacı TEK ekran:** onay kuyruğu paneli (öneri kartı + onay/ret + taslak bağı) yeni
  bir ekran desenidir → `design/pages` + `.dc` süreci modül dosyası açılırken ısmarlanır. Anahtar
  yönetimi Ayarlar altında form-kiti işidir (tasarımsız). Asistanın KENDİSİNİN arayüzü yoktur —
  arayüzü claude.ai'nin sohbeti; müşteri ajanınki WhatsApp.
- Kapsam kalemi: `architecture/BACKLOG.md` → Faz 2 (satır "kurgu belirlendi 09.08" der).
- Görev satırı **Faz 1 bitince** açılır: `build/` altında yeni modül (MCP sunucusu · anahtar
  yönetimi ekranı · onay kuyruğu + paneli · araç kataloğu fazları · maskeleme testleri).
- Gözlemleme bağı: `OBSERVABILITY.md` (asistanın okuyacağı hata verisi + kendi çağrı izi).
