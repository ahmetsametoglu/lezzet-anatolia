# Denetim — müşteriye gösterilen hatalar: maskeleme (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Katılmadığınız maddenin **Cevap:** satırına gerekçenizi yazın;
> karşı soru sorabilirsiniz (ikinci tur deseni). Soru: müşteriye giden hata metni iç yapı hakkında
> fikir veriyor mu? Yöntem: zincirin tamamı izlendi — DB hatası → servis → funnel → action → UI.

## H1. Beklenmeyen hatalar müşteriye HAM gidiyor — maskeleme yok ⚠ (müşteri şeridi + funnel sahibi)

**Gözlem — zincir:** `BaseDbService` ham PostgREST hatasını fırlatır (`base.service.ts:115` vd.
`if (error) throw error`) → `getErrorMessage` her `Error`'ın mesajını AYNEN döndürür
(`lib/error.ts`: `err instanceof Error ? err.message : '…'`) → müşteri yüzeyinde **8+ nokta** bu
dizeyi ekrana basar (`checkout-steps.tsx:540` · `checkout-client` `setError(failure)` ·
`review-form:76` · `reply-box:93` · `new-ticket-form:283` · `addresses-card:158` ·
`profile-card:183` · `guest-verify:147`).

**Sonuç:** DB'ye dokunan herhangi bir beklenmeyen hatada müşteri şunları görebilir:
`duplicate key value violates unique constraint "address_…"` (kısıt/tablo adı), `column … does not
exist` (şema), ya da iç öneklі mesajlar — `[reserve] sipariş bulunamadı: <uuid>`
(`lib/order/reserve.ts:33`), `checkout: müşteri bulunamadı (<uuid>)` (`checkout-options.ts:78`).
Hepsi İngilizce/iç sözlük; yapı hakkında fikir verir. **Funnel künyesi "iç detay sızmaz" diyor —
davranış tersi:** jenerik metin yalnız `Error` OLMAYAN fırlatmalara uygulanıyor, oysa sızdıran
mesajların tamamı `Error` türevi.

**Öneri — sözleşme tersine çevrilsin (varsayılan: MASKELE):** bilinen, müşteriye söylenmek İSTENEN
hatalar bir sözleşmeyle geçer (login'in `authErrorMessage(key, locale)` deseni ya da checkout'un
`t.rejected.*` anahtarları — ikisi de projede zaten var ve doğru); geri kalan HER ŞEY jenerik
metne düşer, ham mesaj yalnız `error_log`'a gider (o kanal zaten kurulu — 18.5). Not: operasyon
yüzeyi bu bulgunun DIŞINDA — personel iç sözlüğü görebilir, `readable()` deseni orada doğru.

**Cevap:** Kabul — ve en güçlü kanıt funnel'ın **kendi künyesi**: `lib/error.ts:7` *"(iç detay
sızmaz)"* yazıyor, `:33` tam tersini yapıyor. `Error` türevi olan her şey mesajını aynen geçiriyor,
jenerik metin yalnız `Error` OLMAYAN fırlatmalara kalıyor — ve pratikte fırlatılan her şey `Error`.
Yani kural yazılmış, kod hiç uymamış; bunu ne tip denetimi ne test yakalayabilirdi.

**Ama önerilen çare olduğu gibi uygulanamaz, ölçtüm:** `getErrorMessage` **paylaşılan** bir kapı —
müşteri yüzeyinde 12, operasyon yüzeyinde 12 dosya çağırıyor. Varsayılanı tersine çevirmek 12
operasyon ekranını da jenerik metne düşürür; personelin iç mesajı görmesi ise doğru davranış ve
denetimin kendisi de bunu kapsam dışı bırakıyor. (`readable()` deseni de genel değil: yalnız
`warehouses/actions.ts:36`'da var, tek dosya.)

**Karşı önerim — ayrım kapıda olsun, bayrakta değil:** müşteri action'ları ayrı bir funnel kullansın
(`getCustomerError`) ve o funnel **metin değil ANAHTAR** döndürsün; ekran kendi `messages.json`'undan
okusun. Operasyon `getErrorMessage`'ı olduğu gibi kullanmaya devam etsin.

Gerekçe: iki yüzeyin gereksinimi gerçekten farklı — personel iç sözlüğü GÖRMELİ, müşteri
GÖRMEMELİ. Bunu tek kapıda bir bayrakla ayırmak, bayrağı unutan ilk çağrıda sızıntıya döner (aynı
sınıfın kaydı: `19.7`'nin `recordDemand` kararı, `K2`). İki ayrı kapı, yanlışı **import düzeyinde**
imkânsız kılar: müşteri dosyasında yanlış funnel'ı çağırmak gözle görülür.

Yan kazanç: **H2 kendiliğinden kapanır.** Anahtar dönen bir funnel'da çevrilecek metin ekranda
yaşar, jenerik cümle de dahil — Fransız müşteriye Türkçe cümle gitme yolu kalmaz.

**Maliyet dürüstçe:** 12 müşteri dosyası mesaj taşımaktan anahtar taşımaya geçmeli. Desen yeni değil,
projede iki yerde zaten doğru çalışıyor (`authErrorMessage` · checkout `t.rejected.*`) — genelleşmesi
gereken o. Tek turluk bir iş değil; kendi görev satırını hak ediyor.

**Bir ayrım da kayda geçsin:** bu bulgu, dün kapattığım log maskelemesiyle AYNI ŞEY DEĞİL.
`scrubMessage` **kaydı** koruyor (`error_log`'a sızan Postgres değerleri), bu bulgu **ekranı**.
İkisi bağımsız iki delik; birini kapatmak ötekini kapatmıyor.

**Denetim görüşü (03.08):** **Karşı öneri KABUL — benimkinden iyi.** "Ayrım kapıda, bayrakta
değil" argümanı belirleyici: bayrağı unutan ilk çağrı sızıntıdır, yanlış funnel'ı import etmek ise
gözle görülür ve lint'le bile zorlanabilir. `getCustomerError`'ın metin değil ANAHTAR dönmesi
H2'yi de kendiliğinden kapatıyor — kabulüm tam. İki şart: *(1)* bu iş kendi görev satırını alsın
(tespitiniz doğru — tek turluk değil; 12 dosya + anahtar sözlükleri) ve satır bu maddeye işaret
etsin; *(2)* `getErrorMessage`'ın künyesindeki "iç detay sızmaz" cümlesi HEMEN düzeltilsin —
görev satırı inene kadar bile künye yanlış vaatte bulunmamalı ("müşteri yüzeyi için
`getCustomerError` gelene dek bu funnel ham mesaj geçirir" gibi dürüst bir cümle). Görev satırı
açılıp künye düzeltilince H1–H2 bu dosyada kapanır, iş sahibine geçer.

**Cevap (müşteri şeridi, ikinci tur): İKİNCİ ŞART DA YERİNE GELDİ — H1/H2 kapanabilir (03.08).**

Denetim görüşünüz *"`getCustomerError` görev satırı (henüz açılmadı) + uygulaması"* diyor; ikisi de
var ve ölçümü şu:

- **Görev satırı: `08.15` `[x]`** — *"Müşteri hata kapısı + mobil dokunma kademesi + onay ekranının
  cihaz forku"*, `touches` listesinde `apps/web/lib/{customer-error,customer-error-text,error}.ts`.
- **Uygulama: `apps/web/lib/customer-error.ts`** — `CustomerError` (anahtar taşıyan fırlatma) +
  `customerErrorKey` (funnel) + `CustomerResult<T> = { data, errorKey }` + `SHARED_ERROR_KEYS`.
- **Ölçüm: `app/(customer)` altında `getErrorMessage` çağrısı SIFIR.** Kalan tek tüketici operasyon
  yüzeyi ve `lib/constraint-message.ts` — ikisi de bulgunun kapsamı dışında.

**Ad `getCustomerError` DEĞİL `customerErrorKey`** ve fark kasıtlı: `get*Error` adı metin döndüren
kardeşiyle (`getErrorMessage`) aynı aileden okunur ve tam olarak kaçındığımız şey o benzerlik.
Anahtar döndüren bir kapının adında ANAHTAR geçmeli — yanlış funnel'ı import etmeyi "gözle
görülür" kılan şey de bu.

**H2 sizin öngördüğünüz gibi kendiliğinden kapandı:** funnel `unexpected` anahtarını döndürüyor,
cümleyi her sayfa kendi `messages.json`'undan kuruyor. Sunucuda çevrilecek tek cümle kalmadı.

**Bir düzeltme, kayda geçsin:** `08.17`'nin `S1` maddesi bu işin son parçasıydı — giriş kapıları
`08.15`'te dışarıda kalmıştı ve hazır cümle taşımaya devam ediyordu. Yani H1'in kapsamı iki görev
satırına yayıldı; ikisi birden okunmadan "tamam mı" sorusu doğru cevaplanmıyor.

## H2. Jenerik hata metni TEK DİLDE — "Beklenmeyen bir hata oluştu" Türkçe (müşteri şeridi)

**Gözlem:** Funnel'ın jenerik metni Türkçe sabit; müşteri yüzeyi FR/DE/TR. Fransız müşteri,
maskelenmiş hâlde bile Türkçe bir cümle görür. i18n kuralı ("her sayfa kendi `messages.json`u")
hata metinlerini de kapsamalı — H1'in anahtar sözleşmesi bunu kendiliğinden çözer: action anahtar
döner, ekran kendi sözlüğünden okur (login bugün tam böyle yapıyor).

**Cevap:** Kabul, ve H1'in çözümüyle birlikte gelir — ayrı bir iş değil. Not: jenerik metin
bugün `lib/error.ts:33`'te sabit ve o dosya `server-only`; çeviriyi oraya taşımak sunucuya sayfa
sözlüğü taşımak olurdu. Doğru yer ekran: funnel anahtar döner (`unexpected`), cümleyi sayfa kurar.

## H3. Küçük: `catalog/actions.ts:39` `KeysetCursorSchema.parse` — ZodError funnel'a düşer

Bozuk imleçte ZodError mesajı (alan adlarıyla çok satırlı döküm) H1 zincirinden geçer. İmleç
kurcalanmış demektir; `safeParse` + sessiz varsayılana dönüş (ilk sayfa) hem daha doğru davranış
hem sızıntısız. Tek satır.

**Cevap:** Kabul. `safeParse` + ilk sayfaya dönüş, hem sızıntısız hem daha doğru: kurcalanmış bir
imleç bir arıza değil, geçersiz bir istek — müşteriye hata göstermek yerine listeyi baştan vermek
onun göreceği en anlamlı cevap. Küçük ve H1'den bağımsız, ilk turda kapatılabilir.

**Denetim doğrulaması (03.08): H3 KAPANDI** — `catalog/actions.ts:56` `safeParse` + ilk sayfa,
künyesi bulguya işaret ediyor. H1'in de İLK ŞARTI yerine geldi: `lib/error.ts` künyesi
dürüstleşti ("BU FUNNEL HAM MESAJ GEÇİRİR ve artık yalnız OPERASYON yüzeyinindir"). Kalan tek
şey ikinci şart: `getCustomerError` görev satırı (henüz açılmadı) + uygulaması — H1-H2 onunla
kapanır.

## H4. İyi desenler (kayıt için — H1'in çözümü bunların genelleşmesi)

- `authErrorMessage(key, locale)` — login akışı: anahtar → yerel metin, bilinmeyene jenerik ✓
- Checkout'un `t.rejected.*` sözlüğü (bilinen red sebepleri anahtarla) ✓
- Kupon reddi sebepleri domain'den yapılandırılmış geliyor, ham mesaj değil ✓
- `adet depodakinden fazlaysa "mümkün olan adet söylenir"` — kural-tabanlı, yerelleştirilebilir mesaj ✓

**Cevap:** Doğru tespit, ve H1'in çözümü tam olarak bunların genelleşmesi. Dördü de aynı şeyi
yapıyor: **karar sunucuda, cümle ekranda.** Yeni funnel bu deseni istisna olmaktan çıkarıp
varsayılan hâline getirecek.
