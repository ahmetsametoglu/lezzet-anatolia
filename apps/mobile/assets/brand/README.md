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
| `../images/android-icon-foreground.png` | 1024² | saydam | **%75** | bkz. aşağıdaki daire notu (kullanıcı kararı 25.08) |
| `../images/android-icon-background.png` | 1024² | düz krem | — | arka katman |
| `../images/android-icon-monochrome.png` | 1024² | saydam siluet | **%75** | temalı ikon; ön katmanla aynı oran, yoksa iki ikon farklı boyda görünür |

## DAİRE BİZİM DEĞİL, ANDROID'İN — ve kapatılamıyor

Android 8'den beri ana ekrandaki her ikon **başlatıcının maskesinden** geçer (ColorOS'ta daire,
başka cihazlarda kavisli kare). `adaptiveIcon` kaldırılsa maske kalkmaz, **kötüleşir**: eski tip
ikonu sistem kendi çizdiği zemine oturtup daha da küçültür. Elimizdeki tek değişken, maskenin
İÇİNE ne koyduğumuz.

**Ölçülen ödünleşme (25.08):** mürekkebin merkezden en dış uzaklığı sanat genişliğinin **%61,7'si**
(köşelerde kıvılcım, ekmeğin ucu, A'nın ayağı); maskenin görünen daire yarıçapı tuvalin **%33,3'ü**.
Yani **hiç kırpılmadan sığmak için azami oran %54** — ve o oranda logo dairenin içinde küçük durur.

| Oran | Maskenin kestiği mürekkep |
| --- | --- |
| %54 | %0,1 — ama görsel olarak küçük |
| **%75 (seçildi)** | **%15,4** — kompozisyonun en dış kuyruğu |
| %95 | %35,8 — "A" kesiliyor |

**%75 kullanıcı kararıdır** (*"hem daha büyük hem de kırpma, daire içine alma"*): büyüklük ile
kırpılmazlık bu kompozisyonda aynı anda sağlanamıyor, çünkü resim geniş ve köşelerinde mürekkep var.

**Opak iOS ikonu pazarlık konusu değil** — saydam ikon mağaza incelemesinde reddedilir.


## AÇILIŞ PERDESİNİN DE MASKESİ VAR — ama yalnız Android 12'den itibaren

Expo, Android 12'nin splash API'sini bildiriyor (`windowSplashScreenAnimatedIcon`, `values/styles.xml`).
**API 31+**'te platform işareti maskeler: Google'ın deyişiyle *"as with adaptive icons, one-third of
the foreground is masked"* — ikon zemini yoksa tuval **288 dp**, görünen daire **192 dp**.
**API 30 ve altında** androidx kendi uyum katmanını çiziyor (`compat_splash_screen.xml`) ve
maskelemiyor.

**Bu ayrım bir kez yanılttı (25.08):** `imageWidth` 280 yapıldı, elimizdeki telefonda (Android 11)
kusursuz göründü, oysa Android 12+ cihazların hepsinde kırpılırdı — mürekkep 257 dp'ye çıkıyordu.
**Cihaz testi bunu yakalayamazdı**, çünkü test cihazı API 30.

Sınır ölçülerek bulundu: `imageWidth` **164 dp** → üretilen çizimde tüm mürekkebin çapı **191,5 dp**
(izin verilen 192). Bu değer büyütülecekse Android 12+ bir cihazda doğrulanmalı.
