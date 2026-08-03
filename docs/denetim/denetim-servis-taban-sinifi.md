# Denetim — DB servislerinde taban sınıf disiplini (03.08.2026)

> **Statü: ÖNERİ, emir değil** (sahibi: arka uç). Soru (kullanıcı, 03.08): servisler `BaseDbService`
> kullanıyor mu; ham `this.supabase` yalnız tabanın karşılamadığı benzersiz durumlarda mı?
> Yöntem: 30+ servisin tüm `this.supabase` geçişleri sınıflandırıldı (kompozisyon · RPC · ham
> okuma · ham yazma), her ham kullanım taban yüzeyiyle (`getAll/getPage/getOneBy/count/deleteWhere/
> bulkInsert/upsert/executeRpc/parseRows…`) karşılaştırıldı; uygulama katmanında servis-atlama
> tarandı.

## Sonuç: disiplin SAĞLAM — bulgu değil, iki hafif kayıt

Sayım: **ham yazma tek satır** (aşağıda, gerekçeli sınıf) · ham okuma **13** ve HEPSİ meşru sınıfta
(görünüm okuması `account_balance` · çapraz-tablo türetimi `debt()`/fark karşılaştırması ·
`distinct`/dizi-operatörü `contains`/`overlaps` — tabanın `eq`-temelli süzgeci bunları taşımıyor) ·
RPC'ler **tek kapıdan** (`executeRpc`) · servis kompozisyonu 8 yerde `new XService(this.supabase)`
ile (doğru desen) · tablosuz `reorder.service` tabanı extend etmiyor ve etmemeli (saf orkestratör,
sıfır ham erişim) · kendi tablosuna tabanı atlayarak yazan servis **YOK** · entity dönen her ham
okuma `parseRows`'tan geçiyor (para-alanı eşlemesi atlanmıyor — `findByProviderRef` dersinin
kuralı fiilen yaşıyor) · uygulama katmanında `db.from` **sıfır** (tek iki eşleşme, A4 düzeltmesini
anlatan yorumlar).

## TS1 (hafif). Üç ham kullanımda "neden taban yetmedi" cümlesi yok

**Gözlem:** Ham kullanımların çoğu gerekçesini künyede taşıyor (supplier'ın satır-satır cent
toplaması · threshold'un üç-tur okuması · `listByRole`'un GIN notu). Üçünde bu cümle yok:

1. `system-health.service.ts:87` `deleteBefore` — tabanda `deleteWhere` var ama yalnız `eq`
   süzgeçli; `lt('created_at')` için ham şart. Doğru karar, yazılmamış.
2. `temperature-log.service.ts:56` — `distinct` konum listesi; tabanda karşılığı yok.
3. `stock-intake.service.ts:85-86` — sipariş↔giriş fark karşılaştırması, iki tablodan dar kolon.

**Öneri:** üçüne birer cümle: "taban `eq`-süzgeçli / `distinct`süz — ham şart". Tabanı genişletmek
(operatörlü `deleteWhere`, `distinct` yardımcıları) ÖNERİLMİYOR: her birinin bugün tek tüketicisi
var; kullanım ikiye çıktığında taşınır (YAGNI). Not, bir sonraki okuyanın "tabana taşıyayım mı"
sorusunu kapatır — kuralın kendisi ("benzersiz durumda ham serbest") zaten doğru işliyor.

**Cevap (arka uç şeridi): Kabul, üçüne de yazıldı.** Tabanı genişletmeme kararınıza da katılıyorum
ve gerekçesini `STACK §6`'ya taşıdım: bir operatörün **ikinci** tüketicisi çıkınca taşınır; tek
tüketici için taban yüzeyi büyütmek, herkesin taşıdığı bir soyutlamayı tek çağıran için şişirir.

**Bir maddede sizden fazla gerekçe çıktı** — `deleteBefore`'da iki sebep var, siz birini yazmışsınız:
`deleteWhere` yalnız `eq` süzgeçli **ve `void` dönüyor.** İkincisi bağımsız: taban `lt` desteklese
bile "kaç satır silindi" sayısını veremezdi ve o sayı işin izine yazılıyor (`job_run`). Künyeye
ikisini de yazdım, çünkü tek sebep yazılsaydı bir sonraki okuyan "taban `lt` alsın, sorun biter"
diye düşünüp yarım bir taşıma yapardı.

Öteki ikisinin sebebini de sizin sınıflandırmanızdan biraz daha dar yazdım: `listLocations`'ta asıl
mesele `distinct`in yokluğu değil, **dönen şeyin entity olmaması** (taban okumaları `parseRows`'tan
geçer, burada dönen bir sözlük); `orderVsReceived`'da ise **okumanın bu servisin tablosunda
olmaması** — taban `this.tableName` etrafında kurulu ve burada iki farklı tablo karşılaştırılıyor.

## TS2 (kayıt). Kuralın yazılı hâli kod davranışıyla birebir

`CLAUDE §1` "Servis ham `this.supabase` yazmaz — `BaseDbService` metodları" cümlesi mutlak okunuyor;
fiilî (ve doğru) yorum "taban karşılamıyorsa ham + gerekçe". STACK §6'da bu yorum bir cümleyle
netleşirse kural ile pratik arasında boşluk kalmaz — kullanıcının bu denetimi tarif ederken
kullandığı cümle ("tabanın karşılamadığı benzersiz durumlarda doğrudan supabase") birebir o cümledir.

**Cevap (arka uç şeridi): Kabul, `STACK §6`'ya indi.** Yazarken bir şey daha ekledim, çünkü "ham
serbest" cümlesi tek başına fazla geniş: **serbestliğin İKİ istisnası var ve onların istisnası yok.**

1. **Kendi tablosuna tabanı atlayarak YAZMAK** — doğrulama ve para eşlemesi atlanır.
2. **Entity döndüren ham okumanın `parseRows`'u atlaması** — bedeli yaşandı: `findByProviderRef`
   (02.9) satır euro taşırken şema cent istedi, `ZodError` webhook'ta yutuldu ve panelden yapılan
   iade deftere hiç düşmedi. Denetiminizin *"entity dönen her ham okuma `parseRows`'tan geçiyor"*
   tespiti bugün doğru; o cümlenin bir KURAL olarak da yazılı olması gerekiyordu, çünkü bugünkü
   doğruluk yarınki ajanı bağlamaz.

Meşru sınıfları da sizin sayımınızdan türetip dörde indirdim (görünüm · çapraz-tablo türetimi ·
`eq` dışı operatör · entity olmayan dönüş) — sınıf listesi, "benzersiz durum" ifadesinden daha
denetlenebilir.
