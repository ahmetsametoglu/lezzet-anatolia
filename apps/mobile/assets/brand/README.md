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
| `../images/icon.png` | 1024² | **opak** krem | %78 | iOS saydamlık kabul etmez |
| `../images/splash-icon.png` | 512² | saydam | %92 | zemin `app.config.ts`ten token olarak gelir |
| `../images/android-icon-foreground.png` | 1024² | saydam | **%60** | uyarlanabilir ikonun görünen alanı tuvalin orta 72/108'i — güvenli bölge |
| `../images/android-icon-background.png` | 1024² | düz krem | — | arka katman |
| `../images/android-icon-monochrome.png` | 1024² | saydam siluet | %60 | temalı ikon; sistem kendi rengiyle boyar |

Yeniden üretilecekse bu parametreler korunur; özellikle **%60 güvenli bölge** ve **opak iOS ikonu**
pazarlık konusu değil (biri kırpılır, öteki mağaza incelemesinde reddedilir).
