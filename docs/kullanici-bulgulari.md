# Kullanıcı bulguları — açık liste

Kullanıcının ekranlarda deneyerek bulduğu, henüz karara/işe dönüşmemiş kusurlar. Sıraya girmiş bir
modül planı değil; **biriken bir defter**. Bir madde çözülünce buradan **silinir** — kalıcı gerekçesi
ilgili `docs/build/NN-*.md` Durum notuna, tasarım kararıysa `design/KARARLAR.md`'ye yazılır.

Her madde iki bölüm taşır: **Bulgu** (kullanıcının gördüğü) ve **Ölçüm** (kodda doğrulanan yer).
Ölçüm yazılmadan madde kapatılamaz — belirtiden teori kurup düzeltme yazmak yasak (`CLAUDE §0`).

---

## 1. Rota kaydı — ikinci "Kaydet" yeni rota açmaya çalışıyor

**Bulgu (01.09):** Yeni bir rota kaydedildikten sonra tekrar Kaydet'e basılınca sistem **ikinci bir
rota** yaratmaya çalışıyor ve "aynı posta kodları eklenemez" uyarısı çıkıyor.

**Ölçüm:** Kapı doğru çalışıyor — `saveZoneAction` yeni rotanın kimliğini `{ id }` olarak döndürüyor
(`deliveries/routes-actions.ts:55`). Sorun istemcide: kayıt başarılı olunca yalnız `router.refresh()`
çağrılıyor, dönen kimlik **kullanılmıyor** (`deliveries/routes-client.tsx:238-252`). `selected` boş
kaldığı için ikinci gönderim yine `id: undefined` taşıyor ve kapı bunu "yeni rota" diye okuyor;
posta kodları da ilk rotada olduğu için çakışma kontrolü (`findConflict`) haklı olarak reddediyor.

Yani uyarı doğru, yaratan davranış yanlış. Kaydetme sonrası form **düzenleme kipine geçmeli** —
yeni kimliği benimseyip aynı rotayı güncellemeye devam etmeli.

## 2. Rota, teslim günü ve posta kodu olmadan kaydedilebiliyor

**Bulgu (01.09):** Teslim günü seçmeden rota kaydetmek mümkün. Mantıken teslim günü ve posta kodu
olmayan bir rota olamaz.

**Ölçüm:** Doğru — form şeması ikisine de alt sınır koymuyor:
- `weekdays: z.array(z.number().int().min(1).max(7))` — dizinin kendisi **boş olabilir**
  (`packages/types/src/entities/delivery-zone.schema.ts:19`)
- `postalCodes: z.array(PostalCodePickSchema)` — aynı şekilde boş geçiyor
  (`deliveries/routes-types.ts:88`)

`min(1)/max(7)` gün NUMARASINI sınırlıyor (pazartesi–pazar), gün SAYISINI değil. Boş dizi her iki
alanda da geçerli sayılıyor.

**Neden önemli:** rota = teslimat bölgesi = arabanın gittiği yer (`DOMAIN §17`). Günü olmayan rota
hiçbir sefere düşmez, posta kodu olmayan rota hiçbir adresi kapsamaz — ikisi de sessizce ölü bir
kayıt üretir ve sipariş adresten depo çözerken karşılığı olmayan bir bölgeyle karşılaşır.

**Karar bekleyen yer:** kısıt yalnız formda mı dursun, yoksa veride de mi (`check` ile). Veride
durması doğru olur — form tek yazma yolu değil (asistan önerisi `proposalId` üzerinden aynı kapıdan
geçiyor), ama boş rotalar zaten kayıtlıysa migration onları da eleyecek şekilde yazılmalı.

## 3. Native uygulama · sipariş tamamlama — mevcut adres düzenlenemiyor  ⟶ MOBİL ŞERİT

**Bulgu (01.09):** Müşteri uygulamasında sipariş tamamlama ekranında yeni teslimat adresi
oluşturulabiliyor ama **mevcut adres güncellenemiyor.**

**İstenen çözüm (kullanıcı):** Karta **uzun basılı tutunca** düzenleme açılsın. Bunun keşfedilebilir
olması için kartın uygun bir köşesine ya da adresin adının yanına, **parantez içinde ve silik**
bir ipucu konsun — *"düzenlemek için uzun basınız"* gibi.

**Ölçüm:** yapılmadı — bu alan mobil şeridin (`apps/mobile`). Web şeridi ölçmedi, kod okumadı.

**Not:** düzeltme mobil şeritte yaşayacak. Buraya yazılmasının sebebi kullanıcının listeyi tek
yerden vermesi; işin sahibi burası değil.

## 4. Native uygulama · dokunmatik geri bildirim (haptic) kapsamı dar  ⟶ MOBİL ŞERİT

**Bulgu (01.09):** Dokunmatik geri bildirimin uygulandığı alan sayısı artırılmalı. Örnek: ürün
detay sayfasında adet artırılırken/azaltılırken titreşim olmalı. Eksiklik yalnız müşteri yüzeyinde
değil — **operasyon yüzeyinde de var.** Düğmelere basıldığında mümkün mertebe geri bildirim
verilmeli.

**Ölçüm:** yapılmadı — alan mobil şeridin (`apps/mobile`).

**Not:** bu bir tek-ekran işi değil, bir **kural** işi: hangi etkileşim hangi şiddette titreşir
(seçim · onay · uyarı · hata) tek yerde tanımlanıp bileşen kitine bağlanmalı, yoksa ekran ekran
eklenir ve yarısı unutulur.

## 5. WhatsApp ile giriş — hiç yazılmadı, görev satırı da yok

**Bulgu (01.09):** Uygulamada WhatsApp ile oturum açma entegre edilmemiş.

**Ölçüm:** Doğru, ve eksik yalnız kodda değil **planda**:
- Niyet yazılı: `DOMAIN.md:523` — *"Önce Google (OAuth) + e-posta + OTP; **WhatsApp ile giriş canlı
  kanal devreye girince** (hepsi Faz 1)."*
- Native tasarım envanteri de yeni kapsam saymış (`docs/uygulama/03-tasarim-envanteri.md:186`).
- **Ama `docs/build/15-whatsapp.md`'de karşılığı bir görev satırı YOK** (15.1–15.19 tarandı).
  Yani iş hiçbir modülün sırasında durmuyor.

**Bugün WhatsApp'ın kimlikle ilişkisi BAĞLAMADIR, giriş değil**
(`packages/application/src/customer/whatsapp-link.ts`): giriş yapmış müşteri düğmeye basar → jeton
üretilir → `wa.me` önceden yazılı mesajla açılır → webhook hem göndereni hem jetonu görür → numara
hesaba bağlanır. Oturum açmış olmayı **varsayar**; oturum açtırmaz.

**Ön koşullar (ikisi de yarım):** canlı kanal `15.7` webhook alıcısı `[~]`, giriş kodunu taşıyacak
utility template `15.11` `[~]`. Bunlar kapanmadan giriş yazılamaz.

**Karar bekleyen:** iş `04` (kimlik) modülüne mi yoksa `15`'e mi yazılacak. Doğal yeri `15` gibi
duruyor — kanalın kendi ön koşullarına bağlı.

## 6. Native uygulamada online ödeme "henüz açık değil" — anahtar eksik, kod değil

**Bulgu (01.09):** Mobil uygulamada sipariş tamamlarken "online ödeme" seçilince *"henüz açık
değil"* uyarısı çıkıyor. Oysa Stripe web'de entegre ve çalışıyor.

**Ölçüm — kod hazır, env eksik.** Sabahki R2 hatasının aynı ailesi:

`apps/mobile/src/lib/payment/stripe-config.ts:57`
```ts
const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!publishableKey) return { configured: false };
```

`apps/mobile/.env` yalnız üç anahtar taşıyor: `EXPO_PUBLIC_API_URL` · `EXPO_PUBLIC_SUPABASE_URL` ·
`EXPO_PUBLIC_SUPABASE_KEY`. **`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` yok** → `stripeConfig()`
`configured: false` dönüyor → `StripeProvider` kurulamıyor → ekran "açık değil" diyor.

Geri kalan her şey yerinde: `apps/mobile-api/.env.local`'de `STRIPE_SECRET_KEY` var, ödeme uçları
yazılmış (`apps/mobile-api/src/api/v1/payments.ts` — `paymentIntents.create/retrieve`), webhook
web'de işliyor. Yayınlanabilir anahtar da elde: `apps/web/.env.local`'de
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` olarak duruyor.

**Düzeltme:** aynı `pk_...` değeri `apps/mobile/.env`'e `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` adıyla
eklenecek, sonra Metro yeniden başlatılacak (Expo env'i açılışta okuyor). Kod değişikliği YOK.

## 7. Native uygulama · kapsam bilgisi bayat kalıyor — uygulama kapatılmadan tazelenmiyor  ⟶ MOBİL ŞERİT

**Bulgu (01.09):** Senaryo şöyle işliyor:
1. Posta kodu henüz hiçbir aktif rotada değil. Müşteri *"buraya da gelin"* kaydı bırakıyor
   (`zone_notice`).
2. Teslimat yapılmadığını görüp almaktan vazgeçiyor, ama uygulamayı açık bırakıyor.
3. Bir süre sonra o posta kodu aktif bir rotaya ekleniyor.
4. **Müşteri uygulamayı tamamen kapatıp yeniden açmadıkça, kodun artık kapsandığı bilgisini
   alamıyor** — ekran hâlâ "buraya gelmiyoruz" diyor.

**Kısmî ölçüm (web şeridi):** Sunucu tarafı doğru cevabı veriyor — kapsama `/places/by-postal-code`
ve `/places/zones` uçlarından **her istekte canlı** okunuyor; uçlarda önbellek başlığı ya da
`revalidate` yok. Yani bayatlık sunucudan gelmiyor, **istemcinin elindeki durumdan** geliyor:
uygulama cevabı bir kez alıp ekranlar arası taşıyor ve yeniden sormuyor. `apps/mobile`'da global
bir sorgu önbelleği ayarı (`staleTime`/`QueryClient`) bulamadım — derinlemesine bakmadım, alan
mobil şeridin.

**Bunu daha görünür yapan şey:** kapsanan bölge için `zone_available` işi saat başı çalışıp
bekleyenlere haber gönderiyor (e-posta + hesabı olana uygulama içi satır). Yani müşteri bir yandan
*"bölgeniz açıldı"* bildirimi alırken, açık duran uygulamada hâlâ *"buraya gelmiyoruz"*
görebiliyor — **iki yüzey aynı anda birbirini yalanlıyor.** Kusurun en kötü hâli bu.

**Dikkat:** bu yalnız bir tazeleme kusuru değil, bir **tetik** sorusu da: uygulama öne geldiğinde
(`AppState` active) ya da bildirime dokunulduğunda kapsamın yeniden sorulması gerekiyor.

## 8. Ödeme çekmecesi iptal edilince ikinci deneme kırılıyor — anahtar "yanmış" oluyor

**Bulgu (01.09):** Online ödeme seçilip Stripe çekmecesi açıldıktan sonra çarpıya basılıp
vazgeçiliyor. Kapıda ödeme kapalı olduğu için tekrar online ödeme deneniyor ve ikinci denemede
*"Siparişiniz gönderilemedi, bağlantınızı kontrol edip tekrar deneyin"* hatası geliyor.

**Hata mesajı yanıltıyor:** kırılan yer ödeme değil, **siparişin kendisi** — istemci 2xx dışı her
cevabı bağlantı sorunu diye anlatıyor.

**Ölçülen zincir:**

1. Tekrar anahtarı ekran açılışında BİR KEZ üretiliyor ve seçimler değişse de korunuyor
   (`apps/mobile/src/screens/checkout/checkout-screen.tsx:170` — `useState(newOrderKey)`).
   Künyesi *"başarıdan sonra ekran `replace` ile kapanır ve bir sonraki açılış yeni anahtar
   üretir"* diyor. **Çekmeceyi iptal etmek ekranı kapatmıyor**, yani ikinci dokunuş AYNI anahtarı
   gönderiyor.
2. İlk dokunuş taslak sipariş açtı ve anahtarı o SATIRA yazdı.
3. İkinci dokunuşta `placeOrder`'ın tekrar dalı bu satırı **atlıyor** — dal yalnız `draft` ve
   `cancelled` DIŞINDAKİ satırları geri veriyor (`place-order.ts:172`), taslak "kesinleşmiş sipariş"
   sayılmıyor. Doğru bir kural, ama anahtarın akıbetini kimse düşünmemiş.
4. `supersedeOpenDrafts` taslağı iptal ediyor — **anahtar satırda kalıyor**.
5. Yeni taslak aynı anahtarla yazılmak isteniyor ve kısıt reddediyor:
   `create unique index order_idempotency_key on public.order (idempotency_key) where idempotency_key is not null;`
   (`0012_order.sql:181`) — **durum süzgeci YOK**, iptal edilmiş satır da anahtarı tutuyor.

**Canlı kanıt (veritabanı, 01.09 15:28):**
```
reference_no    | (yok)
status          | cancelled
cancel_reason   | superseded
payment_method  | online
idempotency_key | m-mtithhlb-a8pz8m3k-sd8l9scd
```
İlk denemenin satırı orada, ikinci deneme tarafından `superseded` edilmiş ve anahtarı hâlâ üstünde.
İkinci denemenin siparişi ise **hiç doğmamış** — yani ikinci çağrı süpermeyi geçti, insert'te düştü.
Arada başka adım yok.

**Kapanmayan tek halka:** `error_log` bu turda BOŞ (yalnız seed örnekleri var). Yani atılan istisna
kayda geçmemiş; `captureError` kendi hatasını sessiz yutuyor (`observability/capture.ts:162`) ve iz
mobile-api'nin stdout'una gitmiş olmalı. **Bu ikinci bir bulgudur:** müşteriye görünen bir arıza
hiçbir kalıcı iz bırakmadı.

**Çözüm yönü (karar bekliyor):** anahtar SATIRA değil NİYETE ait olmalı. İki yol var —
(a) `supersedeOpenDrafts` iptal ederken anahtarı `null`'lasın (satır kapandı, anahtar serbest),
(b) tekil indeks iptal edilmişleri dışlasın (`where idempotency_key is not null and status <> 'cancelled'`).
(a) daha güvenli: indeksi daraltmak, gerçekten tekrarlanan bir isteğin ikinci siparişi açmasına yol
açabilir.

## 9. Stripe çekmecesinde test kartı otomatik doldurma  ⟶ MOBİL ŞERİT · araştırma gerekiyor

**Bulgu (01.09):** Testlerin rahat yapılması için Stripe çekmecesinde varsayılan/test kartlarını
otomatik dolduran bir özellik varsa açılması isteniyor.

**Ölçüm yapılmadı** ve dürüst olmak gerekirse **böyle bir anahtar olduğundan emin değilim:**
Stripe'ın web tarafındaki Payment Element'i test modunda "test kartını doldur" düğmesi gösteriyor,
ama React Native SDK'sının (`@stripe/stripe-react-native`) PaymentSheet'inde aynısının bulunduğu
doğrulanmadı. Önce SDK sürümünün belgesine bakılmalı.

**Yoksa alternatifler:** `defaultBillingDetails` ile ad/e-posta/adres önden doldurulur (kart numarası
değil), ve yalnız geliştirme derlemesinde görünen bir "test kartını kopyala" kısayolu konabilir.

## 10. Native uygulama · operasyon toplama — açık kutu varken "eksikleri bildirerek kapat" düğmesi görünüyor  ⟶ MOBİL ŞERİT

**Bulgu (01.09):** Sipariş toplama ekranında açık bir kutu varken *"eksikleri bildirerek siparişi
kapat"* düğmesi görünmemeli. Düğme yalnız **tüm kutular kapalıyken** görünmeli.

**Ölçüm — kural SUNUCUDA ZATEN VAR, eksik olan ekran.**
`declareOrderShort` (`packages/application/src/warehouse/boxes.ts:428`) açık kutuyu arıyor ve
içi doluysa yazımı hiç yapmadan `open_box_not_empty` + `boxNo` döndürüyor. Yani bugün düğmeye
basılsa sipariş kapanmıyor; depocu yalnız gereksiz bir ret cümlesi görüyor.

**Bir ince fark var, kararı gerekiyor:** sunucu **boş** açık kutuya izin veriyor — onu *"niyet
artığı"* sayıp siliyor ve beyanı yazıyor. Kullanıcının istediği kural bundan daha katı: *"açık kutu
varsa düğme yok."* İkisi birebir uyuşmazsa depocu şu tuzağa düşebilir: boş bir kutu açmış, düğme
gizlenmiş, kutuyu kapatamıyor (içi boş) ve beyanı da veremiyor — **çıkışsız kalır.**

İki çözüm var, ekranın kararı:
- (a) Düğme yalnız **dolu** açık kutu varken gizlensin — sunucunun kuralıyla birebir aynı olur.
- (b) Kullanıcının istediği gibi her açık kutuda gizlensin, **ama** boş kutuyu kapatmanın/atmanın
  bir yolu ekranda dursun.

**Not:** düğmeyi gizlemek reddi ortadan kaldırmaz, yalnız görünmez yapar. Sunucu kapısı yerinde
kalmalı — ekran tek yazma yolu değil.

## 11. Talebin varsayılan modu `human` — AI taslağı hiç üretilmiyor

**Bulgu (01.09):** Müşteri talebi açılıyor ama AI taslak cevap üretmiyor. **Sebep ölçüldü:** talep
`handled_by = 'human'` doğuyor ve AI turu yalnız `ai` (özerk cevap) ile `hybrid` (taslak) modundaki
satırları tarıyor — `human` hiçbir taramanın kümesinde değil.

**İş sağlıklı, arıza onda değil.** `support_ai` beş dakikada bir koşuyor; 01.09 16:10 koşusunun
sonucu `{"failed":0,"drafted":0,"replied":0,"skipped":0,"handedOff":0}`. **`skipped: 0`** kilit:
iş bir satır bulup "atladım" bile demiyor, hiç satır bulmuyor. AI anahtarı, zamanlama ve hata
yolları temiz.

**Kaynak:** `supabase/migrations/0026_ticket.sql:56` → `handled_by ticket_handler not null default
'human'`. Talep açan hiçbir kapı bu alanı yazmıyor, yani varsayılan olduğu gibi kalıyor.

**Kullanıcı kararı (01.09):** *"Varsayılan olarak hibrit ya da yapay zeka olması lazım. Hatta bu
varsayılan değer belki ayarlar kısmından da değiştirilebilmeli."*

**Yapılacak (web şeridi):**
1. `settings`'e varsayılan mod anahtarı (`ticket_default_handler` gibi) — bugün böyle bir ayar YOK
   (bakıldı: `settings` tablosunda yalnız `delivery_summary_email` ve `points_daily_cap` var).
2. Talep açan kapı (`openTicket`) modu **ayardan okuyup satıra yazsın.** DB varsayılanı emniyet
   ağı olarak kalsın — veritabanı varsayılanı `settings`'i okuyamaz, o yüzden karar uygulama
   katmanında verilmeli. Varsayılanın varsayılanı `hybrid`.
3. Operasyon Ayarlar ekranına anahtar konsun.

**Karar bekleyen ince nokta:** ayar TÜM talepler için tek mi olsun, yoksa **kaynağa göre** mi
(`source`: `form` · `whatsapp` · personelin elle açtığı)? Personelin kendi açtığı talebe AI taslağı
üretmek çoğu zaman gereksiz — operatör zaten cevabı biliyor ve talebi kayıt için açıyor. Tek
anahtarla başlanabilir; kaynak kırılımı ihtiyaç ölçülünce eklenir (YAGNI).

**Not:** varsayılanı `ai` (özerk cevap) yapmak `hybrid`'den başka bir karardır — orada cevap
müşteriye **onaysız** gider. Kullanıcı ikisini de saydı; önerim `hybrid` ile başlamak, `ai`
güven oluşunca açılsın.

## 12. AI cevap yazdı, müşteriye hiçbir bildirim gitmedi — bildirim mailin bastırma kuralına asılı

**Bulgu (01.09):** Sipariş talebine AI cevap verdi (16:25). Mobil uygulamada hiçbir bildirim
gelmedi. Kullanıcının istediği: hesap sayfasındaki **"Taleplerim"** girişinde okunmamış mesaj varsa
görsel bir işaret (rozet).

**Ölçüm — cevap yazıldı, bildirim satırı HİÇ doğmadı.**
`ticket_message`: `ai` göndericili cevap 16:25'te yazılmış. `notification` tablosunda o talebe ait
tek satır 15:31'deki `ticket_opened` (personele giden); **`ticket_replied` satırı YOK.**

**Zincir:**
1. AI cevabı `queueTicketReplyMail` çağırıyor (`ticket/ai.ts:377`) → `reply_pending_since` damgası
   konuyor. Buraya kadar doğru.
2. Bildirimin kendisi (`notifyTicketReplied`) cevap anında DEĞİL, **süpürgede** atılıyor
   (`reply-mail.ts:115`) ve süpürge 5 dakika bekliyor (`TICKET_REPLY_MAIL_DELAY_MIN`).
3. Arada `clearTicketReplyMail` damgayı siliyor — müşteri ekranı açtığında. Künyesi bunu açıkça
   yazıyor (kullanıcı kararı 17.08): *"uygulama ARKA PLANDAYKEN bile ekran ayakta kaldığı için zil
   sessiz tazelemeyi koşturuyor ve damga boşalıyor."*
4. Damga boşalınca süpürge o talebi hiç görmüyor → **ne mail gidiyor, ne uygulama içi satır
   yazılıyor.** Ölçüm bunu doğruluyor: `reply_pending_since` şu an `null`, `sent: 0`.

**Kusurun özü:** *"ekran açık = insan okuyor"* eşitliği **MAİL için** tartışılıp kabul edildi ve
orada mantıklı — cebinde uygulaması açık duran müşteriye e-posta atmak gürültüdür. Ama aynı kapı
**uygulama içi bildirimi de** kapatıyor, ve o bildirim tam olarak uygulaması açık olan kişi için
vardır. Kural kendi amacının tersine dönüyor.

**İkinci bulgu — istenen rozet bugün TÜRETİLEMİYOR.** `ticket_message`'da okundu bilgisi yok
(kolonlar: `id · ticket_id · sender · author_id · body · language · translations · translated_at ·
attachments · created_at`) ve `ticket`'ta müşteri bazlı "en son ne zaman baktı" damgası yok.
`reply_pending_since` bu iş için kullanılamaz: mail kuyruğunun damgasıdır ve ekran açılır açılmaz
siliniyor — yani rozet görülmeden kaybolurdu.

**Yapılacak (iki parça):**
- **Veri + kapı (web şeridi):** uygulama içi bildirim mailin bastırma kuralından AYRILSIN —
  `notifyTicketReplied`ın `inApp` yarısı cevap ANINDA yazılsın, mail 5 dakikalık kuyrukta kalsın.
  Ayrıca rozetin dayanağı için müşteri bazlı bir "görüldü" damgası (`ticket.customer_seen_at` gibi).
- **Rozet (mobil şerit):** hesap sayfasındaki "Taleplerim" girişinde işaret.

**Yan gözlem:** `support_ai` 16:30 koşusu `handedOff: 1` döndü — müşterinin ikinci mesajından
("Adım ne") sonra AI talebi insana devretti, `handled_by` yine `human` oldu. Beklenen davranış;
madde 11'in varsayılan tartışmasıyla karıştırılmasın.
