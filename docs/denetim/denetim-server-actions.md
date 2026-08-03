# Denetim — server action taraması (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın.
> Kapsam: `'use server'` işaretli 26 dosya — guard-ilk · `{ data, error }` sözleşmesi (throw yok) ·
> `getErrorMessage` funnel'ı · kolokasyon (CLAUDE.md §2). İki bulgu, gerisi temiz (§S3).

## S1. `login/actions.ts` — ikinci dönüş sözleşmesi (müşteri şeridi)

**Gözlem:** 24 action dosyası `ActionResult` (`{ data, error }`) dönerken login iki fonksiyonu
`{ ok: boolean, error? }` dönüyor (`:25,:29,:39,:41,:52,:66`). Çalışıyor ve tipli — ama yüzeyde
iki sözleşme yaşıyor; login'i örnek alan bir sonraki public action üçüncü varyantı doğurur.

**Öneri:** Ya `ActionResult`'a hizalansın (mekanik: `ok:true` → `data`, `ok:false` → `error`), ya
da "public/oturumsuz akış sözleşmesi ayrıdır" kararı yazılıp künyeye konsun. Denetim görüşü:
hizala — ayrı sözleşmenin taşıdığı bilgi yok.

**Cevap (müşteri şeridi): Kabul, hizalandı (03.08) — ama hedef `ActionResult` DEĞİL,
`CustomerResult`.**

Bulgunuzun ölçüsü bir tur eskiydi: 08.15'te müşteri yüzeyinin BÜTÜN kapıları `ActionResult`'tan
`CustomerResult`'a (`{ data, errorKey }`) geçti — `getErrorMessage` müşteri yüzeyinde hiç kalmadı.
Yani hizalanacak sözleşme o. Fark yalnız alan adı değil, kimin cümle kurduğu: **kapı metin değil
ANAHTAR döndürür, cümleyi ekran kurar.** Login iki kez sapıyordu — hem `{ ok, error }` şekliyle,
hem de hazır cümle taşımasıyla; ikincisi ilkinden daha önemliydi ve siz onu görmemiştiniz çünkü
bulgu şekle bakıyordu.

Uygulanan: `AuthResult<T> = { data: T | null; errorKey: AuthErrorKey | null }`. `authErrorMessage`
zaten saf bir tablo (sunucuya bağlı değil), o yüzden çeviri istemcide sıfır maliyetle yapılıyor.

**Anahtar kümesi `SHARED_ERROR_KEYS`e bağlanMADI** ve bu bilinçli: `code_expired`, `code_locked`,
`cooldown` gibi hâllerin yüzeyin geri kalanında karşılığı yok. Ortak sözlüğe zorlamak, ya oraya
yalnız login'in kullandığı beş anahtar eklemek ya da bu akışın hâllerini "unexpected"a ezmek
olurdu — ikisi de bilgi kaybı.

**Kapsam bulgudan bir dosya büyüktü:** `checkout/components/guest-verify.tsx` aynı iki action'ı
çağırıyor (misafir doğrulaması login sayfasına gitmiyor, checkout içinde kalıyor). O da hizalandı;
künyesindeki *"hata metnini olduğu gibi geçiriyoruz: action zaten müşterinin dilinde döndürüyor"*
notu artık yanlış olduğu için düzeltildi — o gün doğruydu, sözleşme değişince not da değişti.

## S2. `warehouses/actions.ts` — tek dosyada iki hata yolu (operasyon şeridi, aktif iş)

**Gözlem:** Beş catch'in dördü `readable(error)` (kısıt adı → insan mesajı eşlemesi, funnel'ı
sarmalıyor — iyi desen), biri (`:205`) çıplak `getErrorMessage`. `:205`'teki eylem bir DB kısıtına
çarpabiliyorsa mesajı ham kalır. Bilinçliyse (o eylem kısıta çarpamaz) tek satır yorum yeter;
değilse `readable`'a bağlanmalı.

**Cevap (operasyon yüzeyi şeridi):** **Bilinçli** — ve haklısınız, yazılı değildi; yazıldı.

`:205` = `searchPostalCodesAction`, salt OKUMA (posta kodu önek araması, `searchPrefix`). Yazma
yok, dolayısıyla çarpabileceği bir kısıt da yok. `readable` kısıt ADINI insan cümlesine çeviriyor;
hiç kısıt üretemeyen bir yola onu bağlamak, olmayan bir hâli varmış gibi göstermek olurdu — eşleme
sözlüğü de zamanla "acaba buradan hangisi çıkar" diye okunmaz hâle gelirdi.

Öteki dördü gerçekten yazma: künye (`warehouse_code_key`, `warehouse_single_online`), kapatma,
sıralama, bölge (`delivery_zone_postal_code_pkey`). Ayrım tesadüf değil ama tek satır yorumla
sabitlendi: buraya bir gün yazma eklenirse `readable`'a bağlanmalı.

## S3. Sağlık raporu — tarama geneli temiz

- **Guard disiplini TAM:** operasyon tarafında 6 dosyada guard çağrısı = fonksiyon sayısı
  (procurement 14 fonksiyonda 15 çağrı — `requireFinance` + taslak sahipliği için ikinci katman
  `requireDraft`). İlk bakışta guard'sız görünen `operations/actions.ts` kapıyı içeride kuruyor
  (`writeWarehouseContext` → `requireWarehouseScope`).
- **Müşteri kimliği her eylemde SUNUCUDA çözülüyor** (`currentCustomerId()` / `requireCustomer`);
  istemciden kimlik alınan tek action yok.
- **Funnel yaygın ve tutarlı:** try/catch + `getErrorMessage` deseni 24/26 dosyada; `throw` yalnız
  try içlerinde.
- **Tek throw istisnası KAYITLI:** `lib/ai/translate.ts:20` stub'ı bilinçli throw ediyor ve
  `BEKLEYEN(09.4)` işaretli — kural disiplinine uygun.
- **Kolokasyon doğru:** sayfa eylemleri sayfa klasöründe; `lib/` altındakiler gerçekten çok
  sayfadan paylaşılanlar (cart, delivery, auth, offer).
- (Ham DB erişimi bulguları bu dosyada tekrarlanmadı — `denetim-arka-uc-veritabani.md §A4`.)

**Cevap (operasyon yüzeyi şeridi):** Rapor doğrulandı, itirazım yok. Guard sayımını örnekledim
(tedarik 14 fonksiyon / 15 çağrı — ikinci katman `requireDraft` taslak sahipliği için).

**Ekleme — bu turda doğan iki yeni action taramanızın dışında kaldı:** Depolar ekranının beş
yazma kapısı (S2'de anıldı) ve `lib/observability/report-client-error.ts` (denetim G1'in karşılığı).
Sonuncusu sözleşmenin **bilinçli istisnası** ve gerekçesi kendi künyesinde: `ActionResult` DÖNMÜYOR
(`Promise<void>`) ve **guard'ı YOK**. Sebep — çağıranı bir hata sınırı; gösterecek bir arayüzü yok
(zaten hata ekranındayız) ve müşteri sınırı oturumsuz ziyaretçide de tetikleniyor, kimliğe bağlamak
en çok gereken hâli kör bırakırdı. Kötüye kullanım üç daraltmayla tutuluyor (sabit kaynak · tek
satır + 200 karakter · parmak izi başına dakikada bir). Bir sonraki turda bakarsanız bu istisnayı
S1'in "ikinci sözleşme" ölçütüyle tartın — bence ayrı bir sınıf, ama karşı görüşe açığım.

**Denetim görüşü (03.08):** **S2 KAPANDI** — yorum kodda doğrulandı (`warehouses/actions.ts:206`,
denetim referansıyla; "yazma eklenirse `readable`'a bağlanmalı" cümlesi de var — istisna artık
denetlenebilir). S3'teki tartıma cevabım: **haklısınız, ayrı sınıf.** Ölçütü şöyle koyuyorum ve
ileride S1 türü değerlendirmelerde bunu kullanacağım: *çağıranın sonucu GÖSTERECEĞİ bir arayüzü
var mı?* Login'de var (kullanıcı cevap bekliyor) → `ActionResult` sözleşmesine tabidir;
`report-client-error`'da yok (zaten hata ekranındayız, dönen değeri okuyacak kimse yok) → sözleşme
dışı `Promise<void>` meşru, guard'sızlık da işlevin doğası. Tek şartım künyede zaten sağlanmış
(gerekçe yazılı). İkinci bir void-telemetri action'ı doğarsa desen adlandırılmalı ki istisna
sınıfı sessizce büyümesin. Dosyada açık kalan tek madde: **S1** (müşteri şeridi).
