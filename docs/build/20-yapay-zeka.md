# 20 — Yapay Zekâ

## Kapsam

`packages/ai` — sağlayıcı-agnostik AI **portu** ve sistemin AI kullanım amaçlarının haritası. Paket model çağırır, tipli sonuç döner; başka hiçbir şey yapmaz (ne DB, ne log, ne iş kuralı). Kullanım amaçları dört sınıfa ayrılıyor ve **her sınıfın kendi kırmızı çizgisi var**; bu dosya o çizgileri ve prompt kararlarını tutar. Kullanan görevlerin İLERLEMESİ kendi modüllerinde yazar (05.8, 12.4, 13.7, 15.8, 16.5) — burada yalnız çekirdek ve **kullanıcı metni çevirisi** vardır.

**Ne DEĞİL:** kendi başına müşteriye konuşan bir ajan (o 15.8/16.5), model eğitimi/ince ayar (yok), gömme/vektör arama (yok — katalog araması PostgreSQL ile).

## Okunacaklar

- `STACK.md §4` (bağımlılık tek yönlü — `ai` yalnız `types` bilir), `CLAUDE.md §1` (ölçülemeyen değer sıfır değildir · log'a kimlik yazılır içerik yazılmaz)
- `AI_ADMIN_ASSISTANT.md` (Faz 2 niyeti — bugünkü kararlar önünü kapatmasın), `SEO_I18N.md` (dil yedek zinciri)
- `data-model/iletisim-geribildirim.md` (`ProductFeedback`, `TicketMessage` — çeviri alanları)

## Bağımlılık

`01-types` (Zod şemaları — görev çıktıları buradan türer). Kullanım tarafında: `05-katalog` (çeviri önerisi), `16-talep` (taslak/işletme), `12-para` (banka sütun şablonu), `13-analitik` (içgörü), `15-whatsapp` (ajan).

## Başlarken verilecek izah

> "Yapay zekâyı tek bir kapıdan kullanıyoruz. Hangi modeli çağıracağımız koda değil ortam değişkenine yazılı — model değişince kod değişmiyor. Her AI işi bir 'görev' olarak kayıtlı: talimatı, beklediği cevabın şekli ve hangi ucuzluk katmanında koşacağı tek yerde duruyor. Cevap serbest metin değil, şemaya uyan bir nesne olarak isteniyor; uymayan cevap kabul edilmiyor. AI hiçbir zaman zorunlu değil: anahtar yoksa ya da model düşerse özellik AI'sız çalışmaya devam ediyor. İlk gerçek kullanım kullanıcı yorumlarının çevirisi — müşteri hangi dilde yazdıysa o cümle olduğu gibi duruyor, çevirisi yanına yazılıyor ve okuyucu kendi dilinde okuyor."

## Dört kullanım sınıfı ve kırmızı çizgileri

| # | Sınıf | Ne yapar | Kırmızı çizgi | Nerede |
|---|---|---|---|---|
| 1 | **Öneri** (insan onaylı) | Personele metin önerir | AI **kaydetmez**; kaydeden insandır | 05.8 çeviri önerisi ✅ · 16.x talep taslağı |
| 2 | **Çeviri** (otomatik) | Kullanıcı metnini öteki dillere çevirir | **Orijinal değişmez**; çeviri yanına yazılır | 20.2 ✅ |
| 3 | **Çıkarım** (özet/eşleme) | Veriden anlatı ya da eşleme çıkarır | Ticari değeri **uydurmaz**, motordan okur | 09.11c · 12.4 · 13.7 |
| 4 | **Özerk** (müşteriye konuşur) | Müşteriyle yazışır | Stok/fiyat/durum **domain-core'dan**; şüphede insana devreder | 15.8 · 16.5 |

Sınıf numarası büyüdükçe risk büyüyor; bu yüzden sıra da böyle: 1 ve 2 indi, 3 ve 4 kendi modüllerinde bekliyor.

## Görevler

- [x] (20.1) **`packages/ai` çekirdeği:** sağlayıcı-agnostik port — görev kaydı (`AiTask`), tipli çağrı (`runTask`), token ölçümü, sahte modelle testler
  - *Bitti:* iki sağlayıcı env'den seçilebiliyor; görev prompt'u tek yerde; başarısızlık üç sebebe ayrılmış; 9 test ağa çıkmadan koşuyor
  - **Durum (03.08):** `packages/ai` — `types.ts` (sözleşmeler) · `provider.ts` (env → model; anthropic/google) · `run.ts` (`generateObject`, fırlatmaz) · `usage.ts` (token + `estimateCost`) · `testing.ts` (`fakeAiModel`/`failingAiModel`, `@lezzet/ai/testing`). Sınır `ai-scope` kuralıyla makinede: **yalnız `@lezzet/types`** — DB, logger ve iş kuralı yok, ölçümü döner LOGLAMAZ.
    - **Adaptör katmanı ELLE YAZILMADI, kütüphane kullanıldı** (kullanıcı sorusu 03.08): Vercel AI SDK (`ai@7` + `@ai-sdk/anthropic|google@4`). Referans proje (petitcigogne) nötr mesaj/araç tiplerini + döngüyü + adaptörü elle yazmış (~350 satır) ve bedeli kodda duruyor: üç sağlayıcı için tasarlanıp biri yazılmış · nötr tip `meta?: Record<string, unknown>` kaçış deliği açmak zorunda kalmış (Gemini `thoughtSignature`) · turlar arası araç geçmişi tamamen ATILMIŞ (sağlayıcı doğrulaması bozuluyordu) · elle tutulan fiyat tablosunun yedeği tabloda olmayan bir anahtara bakıyor (`pricing.ts:66` — yaklaşık maliyet yerine `TypeError`).
    - **Model ADI değil KATMAN kayıtlı** (`cheap`/`standard`): hangi modelin ucuz olduğu bugünün bilgisidir, env'den gelir (`AI_MODEL_CHEAP`/`AI_MODEL_STANDARD`). Model değiştirmek bir dağıtım kararıdır, kod değişikliği değil.
    - **Fiyat tablosu pakette YOK ve bilinçli:** `estimateCost(usage, rate)` tarifeyi PARAMETRE alır — tarife çağırandan (`settings`) gelir, bilinmiyorsa `null` döner. Sıfır göstermek harcamayı bedava gibi okuturdu (`CLAUDE §1`).
    - **Çıktı daima yapısal** (`generateObject` + Zod): serbest metin ayrıştırmak (referanstaki `parseJsonLoose`) tahmindir. Şemaya uymayan cevap `invalid_output`.
    - **Hata bir DEĞER, istisna değil.** Üç sebep ayrı, çünkü çağıranın davranışı üçünde farklı: `not_configured` (beklenen hâl, tekrar denemenin anlamı yok) · `provider_error` (geçici, denenebilir) · `invalid_output` (prompt sorunu).
    - **Anahtarlar env'de, kod anahtar bilmez:** `ANTHROPIC_API_KEY` ya da `GOOGLE_GENERATIVE_AI_API_KEY` + `AI_PROVIDER`. **Modül yüklenirken env OKUNMAZ** — anahtarsız ortamda `import` bile patlamamalı, yoksa AI'a dokunan her test ortam kurulumu isterdi.
- [x] (20.2) **Kullanıcı metinlerinin çevirisi:** orijinal + kaynak dil + çeviri torbası; üç kaynak (ürün yorumu · talep mesajı · B2B ret gerekçesi); partili cron
  - *Bitti:* Boşnakça yazılmış bir yorum üç yüzeyin üçünde de okunabiliyor, orijinali bozulmadan duruyor; çevrilmiş satır kuyruktan düşüyor
  - **Durum (03.08 · kullanıcı kararı):** Kullanıcı iki şeyi aynı anda söyledi — *"ayrı çeviri tablosuna gerek yok"* ve *"kullanıcı sistemimizde olmayan bir dilde (Boşnakça) yazabilir, yine de üç dilde barındırıp site diline göre göstermeliyiz."* İkisi de kabul edildi ve **eskiden yazılmış bir kararı geri aldı**: `0027`'de *"yorum çevrilmez, müşterinin kendi cümlesidir"* yazıyordu. Endişe doğruydu, sonucu yanlıştı — çevirmemek, Fransız okuyucuya Türkçe yorumu okuyamayacağı hâlde göstermektir. Doğrusu çevirmemek değil, **orijinali korumak ve çeviriyi yanına koymak**.
    - **Torba satırın İÇİNDE, ayrı tablo YOK:** kaynak üç ayrı tabloda olduğu için `source_id` polimorfik, yani FK'siz olurdu — silinen bir yorumun çevirisi öksüz kalır ve kimse görmez; üstelik her okuma bir join daha isterdi. Katalog zaten satır-içi jsonb ile çalışıyor (`LocalizedText`).
    - **Kaynak dil torbaya GİRMEZ.** Orijinal Türkçeyse torba `{fr, de}`, Boşnakçaysa `{tr, fr, de}`. Kaynağı da torbaya koymak orijinalin ikinci bir kopyasını üretirdi; kopyalar bir gün ayrışır. Bu kural sayesinde `resolveUserText` "torbadan gelen çeviridir" diyebiliyor.
    - **`language` artık site dili DEĞİL metnin gerçek dili** ve `preferred_language` enum'u (tr|fr|de) bu işi göremez → serbest ISO 639 kodu (`text` + desen kısıtı). **Kapı artık dil yazmıyor:** yazma anındaki tek bilgi müşterinin baktığı sayfanın dilidir ve o, metnin dili hakkında kanıt değildir — tam da bu işin sebebinde (Fransız sayfada Boşnakça yorum) yanılırdı. Dili metne BAKAN taraf yazar.
    - **Tespit ve çeviri TEK çağrıda** (yapısal çıktı): önce "hangi dil" sorup sonra çevirtmek iki çağrı, iki bekleme, iki fatura demekti.
    - **Damga başarısızlıkta da atılır** (`translated_at`) — yoksa çevrilemeyen tek bir satır kuyruğun önünü sonsuza dek tıkar. **Ama `not_configured`'da HİÇBİR satır damgalanmaz:** anahtarsız kurulumda hepsini "denendi, olmadı" diye damgalamak, anahtar geldiğinde geçmişin tamamını kalıcı olarak çevirisiz bırakırdı.
    - **Bayat çeviriyi VERİ düşürür, kapı değil:** kaynak metin değişince torbayı ve damgayı sıfırlayan genel tetikleyici (`reset_translation_on_text_change`, `0011`; kolon adlarını `tg_argv`'den alır — üç tabloda tek tanım). Kapıya bırakılsaydı bir yazma yolu unutulur ve müşteri, personelin artık yazmadığı bir gerekçenin Fransızcasını okurdu.
    - **Prompt'un en kritik kuralı sansür yasağı:** *"şikâyet şikâyet kalır, öfke öfke kalır"*. Yumuşatılmış bir çeviri, müşterinin söylemediği bir şeyi söylemiş gibi gösterir — bu işin en ağır hatası budur.
    - **Talep yazışması İKİ YÖNLÜ çevrilir:** müşteri kendi dilinde yazar personel Türkçe okur, personel Türkçe yazar müşteri kendi dilinde okur. Tek yön çevirmek yazışmanın yarısını anlaşılmaz bırakırdı. `ticket_message`'ta dil kolonu HİÇ YOKTU, eklendi.
    - **Ret gerekçesinde kaynak-dil kolonu YOK ve gerekmiyor:** operasyon yüzeyi tek dilli (`CLAUDE §2`) ve torbada olmayan dil zaten "orijinal o dilde" demeye yeter — `resolveUserText` bu hâlde orijinale düşer.
    - Yerler: `0011` (`b2b_reject_reason_translations` + genel tetikleyici) · `0026` (`ticket_message.language/translations/translated_at`) · `0027` (`product_feedback` — eski `language` enum'u serbest metne döndü). Motor `domain-core/content/user-text` (11 test), iş `apps/backend/src/jobs/translate-user-text.ts` (5 dakikada bir, 20 metin/tur), kuyruk uçları üç serviste, okuma `listProductReviews(productId, viewLanguage, …)`.
    - **Yaşandı — küresel tarayan işin testi, tarayacağı kümeyi KENDİSİ vermeli.** İlk testte kaynaklar gerçekti; iş küresel taradığı için sahte modelin tek cevabı sıradaki her satıra yazıldı ve yerelde **29 satır** (7 yorum + 22 talep mesajı) bir B2B ret gerekçesinin Fransızcasıyla damgalandı. Üç ajanın paylaştığı bir veritabanında bu yalnız kirlilik değil, başka bir şeridin verisini bozmaktır (`CLAUDE §4b`). Düzeltme: iş `opts.sources` alıyor, test bellekte sahte kaynak veriyor (7 saf test), DB'ye dokunan tek test tetikleyicinin kendi satırı üzerinde. Kirlenen satırlar noktasal `update` ile geri alındı — damga metni benzersiz olduğu için hedef kesindi; `db:refresh` gerekmedi. **Ölçüt basit ve genellenebilir: bir iş "sırada ne varsa" işliyorsa, testi ona sırayı vermeli.**
    - **Seed elle çevrilmiş örnekler taşıyor** (Boşnakça yorum dahil): ön uç şeritleri "otomatik çevrildi" rozetini ve "orijinali göster" bağlantısını API anahtarı gelmeden çizebilsin. Bir kısmı bilerek çevrilmemiş — "çeviri henüz koşmadı" da tasarlanması gereken gerçek bir hâldir.
  - **Durum (04.08) — satır `[x]` idi ama ÇIKIŞ ÖLÇÜTÜ tutmuyordu; kapatan iş bu turda indi.** Müşteri şeridi ölçtü ve haklıydı (`not-talep-yazismasi-cevrilmiyor`): `resolveUserText`'in tüm depoda TEK tüketicisi vardı (ürün yorumu). Talep yazışması ve ret gerekçesi **hiçbir yönde** çevrilmiyordu — veri hazır, motor yazılı, **çağrı yok**. Bu haftanın üçüncü "motor yazılmış, çağrılmamış" bulgusuydu (öncekiler KDV işlemi ve toptan fiyat) ve ortak noktası şu: hiçbiri hata vermez, çünkü **ham metin de geçerli bir metindir**. Bir işi bitmiş saymanın ölçütü "kapı yazıldı" değil, "kapıdan geçen var".
    - **Yön ÇAĞIRANIN dilinden gelir, kapı yön bilmez:** `toMessageViews(messages, viewLanguage)` — müşteri kapısı `locale`, operasyon kapısı `OPERATIONS_LOCALE` geçer. Aynı işlev yazışmayı iki tarafa iki dilde açar; "kim okuyor" sorusunun cevabı yalnız çağıranda vardır. `viewLanguage` varsayılansız (aynı gerekçe `listProductReviews`'ta): varsayılan koyan kapı, dilini vermeyi unutan ekranı sessizce yanlış çalıştırır.
    - **Kuyruk ÖNİZLEMESİ de çevrilir** ve bu ayrı bir karardı: detay çevrilip kuyruk çevrilmeseydi personel talebi ancak AÇARAK triyaj edebilirdi — oysa kuyruğun tek işi açmadan sıralamaktır. Satır satır mesaj tablosuna gitmek 30 satırlık kuyrukta 30 ek tur olurdu; `ticket_queue` zaten son mesajı okuduğu için iki alan (`last_message_language`/`last_message_translations`) bedavaya geldi.
    - **Ret gerekçesinde ORİJİNAL dışarı verilmiyor** — ötekilerin tersine ve bilerek: ürün yorumunda "orijinali göster" anlamlıdır (müşterinin kendi cümlesidir), ret gerekçesinin orijinali Türkçedir ve Fransız bir başvuru sahibinin onunla yapabileceği bir şey yoktur. Kaynak dil sabit `'tr'` (operasyon tek dilli); operatör yanlışlıkla başka dilde yazsa bile sonuç doğru kalır, çünkü o dilin çevirisi torbada bulunmaz ve okuma orijinale düşer.
    - Yerler: `apps/web/lib/ticket/read.ts` (`toMessageView` + kuyruk önizlemesi) · `apps/web/lib/b2b/application.ts` (`readB2bApplicant(viewLanguage)`) · `ticket-types.ts` (`bodyTranslated`/`originalBody`/`language` — alan adları `PublishedReview` ile bilerek AYNI, iki ekran aynı rozeti çiziyor). Seed'e iki yönü birden gösteren bir talep eklendi (Boşnakça müşteri + Türkçe personel cevabı, ikisi de çevrili); 4 entegrasyon testi yönün kendisini sınıyor.
  - **Durum (04.08) — OPERASYON YÜZEYİ ÇİZİLDİ; çıkış ölçütünün ekran ayağı da tamam.** Kapılar inmişti, gösteren yoktu: Talepler ekranı hem *"Müşterinin anlatımı"* kutusunda hem yazışma balonlarında **mor "otomatik çevrildi" rozetini** ve iki yönlü *"orijinali göster / çeviriyi göster"* bağını çiziyor; orijinal gösterilirken `lang` özniteliği de doğru (ekran okuyucu Fransızca cümleyi Türkçe sanmasın).
    - **Tek komponent, iki yer** (`TranslatedBody`): aynı üçlü iki blokta çiziliyor ve iki kopya bir gün ayrışır — ayrıştığı gün biri rozeti unutur, yani personel makine cümlesini müşterinin cümlesi sanar. Renk seçimi de sözlükten: **mor = makine konuştu** (`ui/tone.ts`), bir durum değil bir fail ayrımı.
    - **Varsayılan ÇEVİRİ, orijinal bir tık uzakta** — tersi değil: operatörün kuyruğu tarayabilmesi için okuyabilmesi şart. Ama orijinal kapalı da değil, çünkü personel müşterinin cümlesini bazen aynen alıntılamak zorunda (iade kararı) ve makine çevirisi bir yorum katmanıdır: *"kutu ezilmişti"* ile *"kutu hasarlıydı"* aynı tazminat kararını vermez.
    - **Kuyruk önizlemesi İŞARETLENMEDİ ve bu bir karar:** kuyrukta verilen karar "hangi talebi açayım", "bu cümleyi alıntılayayım mı" değil; satır başına bir rozet daha taranan bir listede gürültü olurdu. `previewTranslated` alanı duruyor — triyajın yanlış gittiği bir örnek çıkarsa tek satırla açılır.
    - **Çeviri önerisine ALAN TÜRÜ geçiliyor** (arka uç bildirimi): `suggestTranslationAction(text, 'ad' | 'aciklama' | 'icindekiler' | 'saklama')`. Ürün ADI iki kelimelik bir vitrin metni, SAKLAMA TALİMATI bir yönerge, İÇİNDEKİLER yasal bir listedir — dördü de varsayılan `aciklama` tonuyla çevriliyordu ve o ton üçünü birden bozuyordu. Beş çağrı yeri alanına göre geçiyor (ürün · varyant · katalog · paket · indirim etiketi).
- [ ] (20.3) **Maliyet görünürlüğü:** tarife `settings`'ten okunur, çağrı başına yaklaşık maliyet `job_run`/`error_log` bağlamına yazılır; operasyonda basit bir "bu ay AI" satırı
  - *Bitti:* bir turun kaç token ve yaklaşık kaç € yaktığı ekrandan okunuyor
  - **Neden bugün inmedi:** `estimateCost` ve token ölçümü HAZIR (20.1), eksik olan tarifenin nereden geleceği. Tarifeyi koda gömmek referans projede çürüdü; `settings` satırı doğru yer ama gerçek fatura görülmeden konacak sayı da bir tahmindir. İlk faturadan sonra inecek.
- [ ] (20.4) **Talep taslağı (sınıf 1):** yazışmadan + sipariş bağlamından cevap taslağı; **gönderim daima insanın**
  - *Bitti:* operatör "taslak öner" diyor, kutu doluyor, gönderen o
  - **Tasarım kararı verildi, motoru `16.5` ile gelir** (`CLAUDE §4`: talep girdiği modül sırası gelince o modülle birlikte iner). Referans projeden alınan üç desen: taslak satıra ÖNBELLEKLENİR (`ai_draft_reply` + `ai_draft_generated_at`; son mesajdan sonra üretildiyse model hiç çağrılmaz) · kaynaklar SINIRLI (SSS + politika + sipariş bağlamı; "bilmiyorsan söz verme") · üçüncü bir gönderici hâli AÇILMAZ (`ticket_sender='ai'` AI'ın KENDİ gönderdiği mesajdır; insanın onayladığı taslak `admin`'dir — ikisini karıştırmak "AI yanıtladı" süzgecini yalancı yapardı).
  - **Depo ve arayüz 16.08'de kuruldu** (kullanıcı kararı, ayrıntı 16.5 durum notunda): `ai_draft_reply` kolonları ticket + conversation'da gerçek, hibrit mod (`ticket_handler='hybrid'`) ve taslak kartı ("Cevaba çevir / Düzenleyerek gönder") iki ekranda da çalışıyor — bugün taslağı seed dolduruyor, bu görev DOLDURANI yazacak.

## Netleşecekler

- **Sağlayıcı anahtarı kullanıcıda.** `AI_PROVIDER` + katman modelleri + anahtar env'e eklenecek; kod tarafı hazır ve anahtarsız hâlde sessizce AI'sız çalışıyor.
- **Görüntü girişi (çok-modluluk)** henüz gerekmedi. İlk ihtiyaç sahibi fatura→stok formu (sınıf 3); geldiğinde `runTask`'a görüntü parçası eklenecek — kütüphane zaten destekliyor, sözleşmemiz henüz istemiyor.
- **Araç çağırma (function calling)** yalnız sınıf 4'ün ihtiyacı (15.8/16.5). Kütüphane hazır; araç kataloğu o modülde tanımlanacak — referans projedeki *"fiziksel engel ilkesi"* (hatayı prompt'la değil ARAÇ İMZASIYLA imkânsızlaştır) oraya taşınacak.
