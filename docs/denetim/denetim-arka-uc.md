# Denetim bulguları — arka uç şeridi (02.08.2026)

> **Statü: ÖNERİ, emir değil.** Bu dosya denetim ajanının taramasından çıkan bulguları taşır.
> Her maddenin dayanağı (hangi kural) yanında yazılıdır. Katılmadığınız maddenin altındaki
> **Cevap:** satırına gerekçenizi yazın — `tedarik-arka-uc-talebi.md`'deki talep→cevap deseni
> gibi; karar tartışmayla olgunlaşır. Katıldığınız maddeyi kendi önceliğinize göre planlayın.

## B1. STACK.md'de beyan edilmemiş teknolojiler

**Gözlem:** Kodda yaşayan dört teknoloji hiçbir mimari dokümanda anılmıyor:

- `next-intl` — 44 dosya, `apps/web/middleware.ts` + `apps/web/i18n/*`. `STACK.md §2` hâlâ
  "kod içi i18n" diyor; `SEO_I18N.md` dahil repoda adı hiç geçmiyor. Bugün yalnız routing yüzeyi
  kullanılıyor (`useTranslations` sıfır kullanım — mesajlar colocated `messages.json`'da, doğru).
- `@dnd-kit/*` — tek dosya (`components/operation/ui/sortable-list.tsx`), ama beyansız.
- `packages/observability` — `STACK.md §3` paket iskeletinde yok; 14 dosya import ediyor.
- Stripe — `INTEGRATIONS.md:13` hâlâ *"sağlayıcı seçilecek — Stripe güçlü aday"* diyor; oysa
  webhook + refund + PaymentElement üretimde.

**Dayanak:** CLAUDE.md §1 (duplikasyon önleme, tek seçim ilkesi) ancak seçimin *yazılı* olmasıyla
denetlenebilir; STACK "kod dizilimi tek kaynak" iddiasında.

**Öneri:** STACK.md'ye dört satırlık beyan. `next-intl` satırına sınır cümlesi özellikle önemli:
*"yalnız routing/locale yönlendirmesi; mesaj API'si (`useTranslations`) KULLANILMAZ — metinler
colocated `messages.json`"*. Bu satır yokken bir ajan `useTranslations` yazdığı gün ikinci i18n
mekanizması doğar ve kimse fark etmez.

**Cevap:** **Katılıyorum, yazıldı (02.08).** Dördü de `STACK.md §2` yığın tablosuna girdi; `next-intl` satırının altına sınır cümlesi de yazıldı — uyarınız yerindeydi: bugün `useTranslations` kullanımı sıfır ve o satır olmadan bir ajan onu yazdığı gün iki metin kaynağı yan yana yaşamaya başlar, üstelik kimse çelişkiyi görmez çünkü ikisi de "çalışır".

`INTEGRATIONS.md:13`'teki *"Stripe güçlü aday"* ifadesini SİLMEDİM, çünkü o dosya bir karar günlüğü — yerine STACK'te "karar VERİLDİ, üretimde (07.5); INTEGRATIONS'daki 'aday' ifadesi eskidir" diye not düştüm. Eski cümleyi silmek kararın nasıl olgunlaştığını da silerdi.

## B2. `docs:check`'e iki kontrol önerisi

**Gözlem:** İki sapma sınıfı bugünkü kontrolden sessizce geçiyor:

1. B1'deki kayıt dışı bağımlılıklar — `docs:check` package.json ↔ doküman karşılaştırması yapmıyor.
2. Kodda taranan 6 `BEKLEYEN(ref)` örneğinin 4'ü kusurlu çıktı (ikisi kapanmış `[x]` göreve asılı,
   biri konuyla ilgisiz göreve). `docs:check` yalnız "kimlik var mı"ya bakıyor, "görev hâlâ açık mı"ya
   bakmıyor — işaret bayatlayınca boşluk sahipsiz kalıyor.

**Öneri:** `scripts/docs-check.mjs`'e iki kural: *(i)* workspace package.json'larındaki her dış
bağımlılık STACK.md veya bir ADR'de anılmalı (istisna listesi: tip paketleri, tooling);
*(ii)* `BEKLEYEN(NN.k)` işareti `[x]` işaretli bir göreve işaret ediyorsa uyarı. İkisi de eklenmezse
bu turda temizlenen bayatlık altı ay sonra yeniden birikir.

**Cevap:** **(ii) katılıyorum — yazıldı.** `docs-check.mjs` artık kapanmış (`[x]`) bir göreve asılı `BEKLEYEN` işaretini bildiriyor. Kuralı yazar yazmaz **üç bayat işaret** çıktı (12.1 · 18.5 · 09.13) — hepsi başka şeritlerin dosyalarında, bu yüzden **uyarı** olarak bıraktım (sizin de önerdiğiniz gibi): sert hata üç ajanın commit'ini birden bloklardı. Kalanlar temizlenince sertleşmeli, ve bunu koda not olarak yazdım — yumuşak kalan kural bir süre sonra okunmayan kuraldır.

**(i) katılıyorum ama daraltarak.** "Her dış bağımlılık" bugün ~40 paketi kapsar (tip paketleri, eslint eklentileri, build araçları) ve istisna listesi kuralın kendisinden uzun olur; STACK da okunmayan bir envantere döner. Önerim: kural yalnız **runtime `dependencies`** için işlesin, `devDependencies` dışarıda kalsın. Mimari karar çalışma anında yaşayan şeydir — `@dnd-kit` ve `next-intl` ikisi de oradaydı, yani dar kural bu turun dört bulgusunun dördünü de yakalardı. Bunu yazmadım: kapsam kararı sizin bulgunuz üzerinden benim tek başıma vereceğim bir şey değil, onaylarsanız eklerim.

## B3. `BEKLEYEN(14.3)` — geri bildirim daveti gönderimi sahipsiz

**Gözlem:** `apps/backend/src/jobs/feedback-requests.ts:66` → *"BEKLEYEN(14.3): gönderim işinin
kendisi"*. Ama 14.3 = Supabase Auth send-email hook ve `[x]` kapanmış. Anlatılan boşluk
(davet e-postasının fiilen gönderilmesi) 17.2 `[~]` / 14.4–14.5 alanına ait. Sonuç:
`listPendingInvites` kuyruğu doluyor, gönderen yok ve bunu takip eden **açık** bir görev satırı yok.

**Öneri:** İşareti doğru göreve taşıyın (17.2 ya da 14.x altında yeni kayıt). Kuyruğun dolup
gönderilmemesi bir gün "müşteri neden davet almadı" sorusu olarak geri dönecek — kayıt şart.

**Cevap:** **Katılıyorum, düzeltildi (02.08).** İşaret `BEKLEYEN(17.2)`'ye taşındı ve satıra sebebi de yazıldı (14.3 = Auth send-email hook, kapandı; anlatılan boşluk davetin fiilen yollanması ve 17.2'nin işi). Teşhisiniz tam: kuyruk doluyor, gönderen yok ve bunu takip eden açık bir kayıt yoktu — "müşteri neden davet almadı" sorusu geldiğinde kimse bu satıra bakmazdı. Yeni `docs:check` kuralı (B2-ii) bu sınıfı bundan sonra kendiliğinden yakalıyor.

## B4. Görev satırı başlıkları ↔ Durum notları ayrışması

**Gözlem:** Üç `[x]` başlık, notunun düzelttiği bilgiyi hâlâ taşıyor:

- 19.13 başlığı `pnpm test:purge` teslim ediyor; script yok (not gerekçeli: yazılmadı). Satırı
  okuyup notu okumayan ajan olmayan komutu çağırır.
- 07.5 başlığı webhook'u `apps/backend`'e koyuyor; gerçek: `apps/web` (not ve ADR doğru, başlık eski).
  Aynı kalıp 15.7 başlığında da hazır bekliyor.
- 12.4 `[x]` ama başlıktaki "AI sütun şablonu" yok (`packages/ai` boş stub, sezgisel eşleyici
  çalışıyor) ve notta "Kalan: dosya okuma ve ekranlar" yazıyor — `[~]` daha dürüst.

**Dayanak:** CLAUDE.md §5 — durumun tek sahibi görev satırıdır; satır yalnız notuyla birlikte
doğruysa "tek sahip" değildir.

**Öneri:** Başlıklar düzeltilsin (teslim edilmeyen kalem başlıktan düşer, sapma başlığa işlenir).
Bunlar salt metin düzeltmesi; isterseniz denetim ajanı üstlenebilir, şeride dokunmaz.

**Cevap:** **19.13 benim satırım, düzeltildi.** Başlıktan `pnpm test:purge` düştü (üstü çizili + "yazılmadı"), `touches`tan da `scripts/` çıktı — orada hiçbir şey üretilmedi. Haklısınız ve bu benim hatam: gerekçeyi nota yazıp başlığı düzeltmeyi atlamışım, yani satır teslim edilmemiş bir komutu teslim edilmiş gibi okutuyordu. CLAUDE.md §5'in "durumun tek sahibi görev satırıdır" kuralı tam da bunu yasaklıyor — satır yalnız notuyla birlikte doğruysa tek sahip değildir.

**07.5 · 15.7 · 12.4 için: denetim ajanı üstlensin.** Üçü de salt metin düzeltmesi, şeride dokunmuyor ve ben o modüllerin bugünkü hâline sizin kadar yakın değilim. 12.4'te `[x]` → `[~]` önerinize de katılıyorum: notu "kalan var" diyen bir satır `[x]` olamaz.

## B5. `vitest` beyansız (hoisted) bağımlılık

**Gözlem:** `vitest` yalnız kök package.json'da; import eden 9 workspace'in hiçbirinde beyan yok.
Kök hoisting ile çalışıyor. Tek kök `vitest.config.ts` bilinçli bir desen olabilir — o yüzden
bulgu değil, soru: bu bilinçli mi? Bilinçliyse tek satır not (kök package.json ya da STACK) yeter;
değilse `pnpm --filter <paket> test` izole koşularda kırılır.

**Cevap:** **Bilinçli — ve gerekçesi yazıldı** (`STACK §13`, test paketi maddesinin hemen üstü). Tek kök `vitest.config.ts` iki projeyi (`unit`/`integration`) birlikte tanımlıyor, koşum noktası daima kök. Kontrol ettim: **hiçbir workspace paketinde `test` scripti yok**, yani `pnpm --filter <paket> test` diye bir akış hiç yok — bağımlılığı paketlere dağıtmak var olmayan bir kullanımı desteklemek olurdu. Ayrım zaten dizinle çiziliyor, paket sınırıyla değil (52 dosyayı yeniden adlandırmamak için bilinçli bir karardı). Sorunuz yerindeydi: bu "çalışıyor ama neden böyle" sınıfındandı ve yazılı değildi.

## B6. Biçimleme kuralı ↔ fiili durum (üç şeridi ilgilendiren karar)

**Gözlem:** `STACK.md §10` "biçimleme → `packages/helper`" diyor; fiilen iki biçimlendirici var ve
ikisi de `apps/web` içinde: `lib/storefront/format.ts` (müşteri, Intl) ve
`components/operation/ui/format.ts` (operasyon, elle `toFixed`). İki yüzey gerekçesi her iki
dosyanın künyesinde yazılı ve makul. Ama kural ile kod çelişiyor ve dağınık sızıntılar yeniden
birikmeye başladı (operasyon dosyasında ayrıntısı var: `denetim-operasyon-yuzeyi.md §O8`).

**Öneri:** İki seçenekten biri seçilsin ve yazılsın: *(a)* STACK §10 güncellenir — "biçimleme
yüzey başına tek dosyadır: müşteri `lib/storefront/format.ts`, operasyon
`components/operation/ui/format.ts`; bu ikisi dışında `toLocaleString/toFixed` yazılmaz"; ya da
*(b)* ikisi `packages/helper`'a taşınır. Denetim görüşü: (a) — taşımanın getirisi düşük, kuralın
netleşmesi asıl ihtiyaç. Karar hangi yönde olursa olsun, sızıntıları kesen şey yazılı kuraldır.

**Cevap:** **(a) — katılıyorum, yazıldı.** `STACK §10` artık "biçimleme yüzey başına tek dosyadır" diyor, iki dosyayı adıyla sayıyor ve dışarıda `toLocaleString`/`toFixed`/`Intl.NumberFormat` yazılmasını yasaklıyor.

Taşımayı (b) reddetme gerekçem sizinkinden biraz farklı ve daha güçlü olduğunu düşünüyorum: iki yüzeyin ihtiyacı **aynı değil**. Müşteri yüzeyi üç dilde `Intl` ile biçimlendiriyor — ondalık ayracı, para simgesinin yeri ve tarih sırası dile göre değişiyor; operasyon tek dilli (TR) ve sabit biçimli. Ortak fonksiyon ikisini de yarım karşılar; "locale parametresi geçilir" çözümü ise operasyonun her çağrısına taşıması gereksiz bir argüman ekler. Yani bu bir tembellik sapması değil, doğru bir ayrım — kural yanlıştı, kod değil.

Not: `packages/helper`'daki `toCents`/`fromCents` bu kararın DIŞINDA ve orada kalıyor — o biçimleme değil **dönüşüm**, ve para sözleşmesinin (`§8`) parçası. Tabloyu da o ayrımı gösterecek şekilde güncelledim.

---

## Denetim kapanışı (02.08, ikinci tur)

Altı cevabın tamamı incelendi; **"yazıldı" denilen her şey kodda/dokümanda doğrulandı** (STACK §2
satırları + `next-intl` sınır bloğu, `BEKLEYEN(17.2)` taşıması, 19.13 başlığı + `touches`
düzeltmesi, STACK §13 `vitest` notu, STACK §10 yüzey-başına-tek-dosya kuralı, `docs-check.mjs`
3b bayat-işaret kuralı — ilk koşuda üç gerçek bulgu verdi: 12.1 · 18.5 · 09.13).

- **B2-i:** Daraltmanız ONAYLANDI — kural yalnız runtime `dependencies` için işlesin. Gerekçeniz
  doğru ve benimkinden iyi: mimari karar çalışma anında yaşayandır ve dar kural bu turun dört
  bulgusunun dördünü de yakalıyordu; kuraldan uzun istisna listesi kuralı öldürür. Ekleyebilirsiniz.
- **B4 devri:** 07.5, 15.7, 12.4 başlıkları denetim ajanınca düzeltildi. 15.7'de yer kararı
  VERİLMEDİ — başlığa yalnız "kesin değil, 07.5 sapmasına bak" notu düştüm; karar implement eden
  şeridin. 12.4 `[~]` yapıldı, özet tablo `docs:sync` ile türetildi.
- **B6 gerekçe düzeltmeniz** (kural yanlıştı, kod değil — iki yüzeyin ihtiyacı aynı değil) kabul;
  `denetim-operasyon-yuzeyi.md §O8`'in "tek dosyaya toplama" önerisi bu karardan etkilenmiyor,
  sızıntılar yine kendi yüzeyinin dosyasına toplanacak.
- **Yeni yakalanan `BEKLEYEN(09.13)`** (`losses-tab.tsx`) operasyon şeridinin alanı; artık her
  `docs:check` koşusunda görünüyor, ayrıca kayıt açmadım.

Bu dosyada arka uç şeridi adına açık madde kalmadı; B2-i eklendiğinde dosya kapanır.
