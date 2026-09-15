# Marka kaynağı — ikon/perde varlıklarının TEK kaynağı

`logo-master.png` (3000×3000) uygulamanın **ikon ailesinin kaynağıdır**. Buraya konmasının sebebi
seed fikstürlerinde alınan dersin aynısı: kaynağın repo DIŞINDA (`temp/`, indirilenler) durması,
bir gün silinince yeniden üretimi imkânsız kılar.

Yazısız sürüm bilerek: ikon telefonda ~60 px çizilir, o boyutta kelime markası okunaksız bir şeride
döner. **Yazılı sürüm** giriş/onboarding/profil ekranlarında kullanılan `../images/logo.png`tir ve
o AYRI bir varlıktır (geniş oran) — ikon ailesiyle karıştırılmaz.

## Türetilen beş varlık ve parametreleri (`21.116`)

Zemin **#FAF6EC** — uydurulmadı, kaynağın kendi zemininden ölçüldü ve birebir
`customerSand['sand-25']` ("sayfa zemini"). İçerik kutusu kaynakta **(309,435)–(2686,2518)**.
Krem zemin saydama çevrilirken yumuşak rampa kullanıldı (zeminden uzaklık ≤12 tam saydam,
≥48 tam opak) — sert eşik kenarları tırtıklar.

| Dosya | Ölçü | Zemin | Sanat oranı | Neden |
| --- | --- | --- | --- | --- |
| `../images/icon.png` | 1024² | **opak** krem | **%88** | iOS saydamlık kabul etmez; kavisli kare maskesi daireden cömert olduğu için oran yüksek |
| `../images/splash-icon.png` | **1024²** | saydam | %92 | zemin `app.config.ts`ten token olarak gelir; ölçü 1024 çünkü perde işareti **164 dp** çiziliyor ve xxxhdpi'de 656 px eder — 512'lik kaynak orada bulanıklaşırdı. **164 keyfî değil**, aşağıdaki API 31 notuna bak |
| `../images/android-icon-foreground.png` | 1024² | saydam | **%48** | mürekkebin çapı tuvalin %60,9'u = 65,8 dp → Google'ın **66 dp güvenli bölgesine** sığıyor, hiçbir OEM maskesinde kesilmiyor |
| `../images/android-icon-background.png` | 1024² | düz krem | — | arka katman |
| `../images/android-icon-monochrome.png` | 1024² | saydam siluet | **%48** | temalı ikon; ön katmanla aynı oran, yoksa iki ikon farklı boyda görünür |

## DAİRE BİZİM DEĞİL, ANDROID'İN — ve kapatılamıyor

Android 8'den beri ana ekrandaki her ikon **başlatıcının maskesinden** geçer (ColorOS'ta daire,
başka cihazlarda kavisli kare). `adaptiveIcon` kaldırılsa maske kalkmaz, **kötüleşir**: eski tip
ikonu sistem kendi çizdiği zemine oturtup daha da küçültür. Elimizdeki tek değişken, maskenin
İÇİNE ne koyduğumuz.

**Ölçülen ödünleşme (25.08):** mürekkebin merkezden en dış uzaklığı sanat genişliğinin **%61,7'si**
(köşelerde kıvılcım, ekmeğin ucu, A'nın ayağı); Google'ın **güvenli bölgesi** 108 dp tuvalin
**66 dp**'si (%61,1) — bu alandaki içerik hiçbir OEM maskesinde kırpılmaz.

| Oran | Maskenin kestiği mürekkep |
| --- | --- |
| **%48 (seçildi)** | **%0** — mürekkep çapı 65,8 dp, güvenli bölgeye sığıyor |
| %60 | ~%5, en dış uçlar |
| %75 | %15,4 — bir tur denendi ve GERİ ALINDI |
| %95 | %35,8, "A" kesiliyor |

**%75 bir tur seçilmişti** (*"hem daha büyük hem de kırpma"*) ama kırpma cihazda görülünce
kullanıcı **%50'ye indirilmesini** istedi; ölçüm %50'nin de güvenli bölgeyi 2 puan aştığını
gösterdi (%63,4 > %61,1), o yüzden **%48**. Kural: **büyüklük ile bütünlük bu kompozisyonda aynı
anda sağlanamıyor** — resim geniş ve köşelerinde mürekkep var; bütünlükten yana karar verildi.

**Opak iOS ikonu pazarlık konusu değil** — saydam ikon mağaza incelemesinde reddedilir.


## AÇILIŞ PERDESİNİN DE MASKESİ VAR — her Android sürümünde

Expo, Android 12'nin splash API'sini bildiriyor (`windowSplashScreenAnimatedIcon`, `values/styles.xml`)
ve işaret **maskeleniyor**: Google'ın deyişiyle *"as with adaptive icons, one-third of the foreground
is masked"* — ikon zemini yoksa tuval **288 dp**, görünen daire **192 dp**.

**API 31'den önce de maskeleniyor.** androidx `core-splashscreen`in kendi kaynağı bunu yazıyor
(`compat_splash_screen_no_icon_background.xml`):

```xml
<!-- We mask the outer bounds of the icon like we do on Android 12 -->
```

Cihazda ölçüldü (OPPO CPH1907, **Android 11 / API 30**): görünen daire ≈ **191 dp**.

## İKİ HATA BURAYA YAZILIYOR Kİ TEKRARLANMASIN (25.08)

**(1)** `imageWidth` 280 yapıldı; mürekkep 257 dp'ye çıktı ve daireyi taştı — işaret cihazda
kırpıldı (sol ilmik ve sağ süpürme gitti, "A"nın tepesi kesildi).

**(2) Cihaz turu bunu GÖSTERMİŞTİ, gözden kaçtı.** 280'lik derlemenin ekran görüntüsü alınmış,
yalnız işaretin BOYU ölçülmüş, bütünlüğü karşılaştırılmamıştı. Ölçüt basit: **kaynak sanatın oranı
1,141** (2377×2083); ekrandaki oran **0,85** çıkıyordu. Kırpılmış bir görüntünün oranı sapar.
**Perde ve ikon doğrulaması bundan sonra bu karşılaştırmayı içermeli** — "büyük görünüyor" bir
doğrulama değildir.

Sınır ölçülerek bulundu: `imageWidth` **164 dp** → üretilen çizimde tüm mürekkebin çapı **191,5 dp**
(izin verilen 192). Büyütülecekse cihazda oran karşılaştırmasıyla doğrulanmalı.
