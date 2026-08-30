# Maestro — native uygulamanın uçtan uca testleri

Bu klasör **native uygulamanın** akış testlerini tutar. Repodaki öteki e2e (`/e2e`, Playwright)
**web**'indir ve üç projesi de tarayıcıdır (`operations`, `desktop`, `mobile-web` — sonuncusu
müşteri *mobil web*'i, native uygulama değil; CLAUDE §2). İkisi karışmaz.

## Neden Maestro

Kurulum kararı kullanıcınındır (30.08): operasyon v3 tasarım geçişine başlamadan önce native
tarafın akış testi olsun. Jest komponent testleri bir ekranın kendi içinde doğru çizildiğini
söyler; **ekranlar arası geçişin** — kapının açılması, sekmenin doğru bölüme gitmesi, geri
dönüşün doğru yere düşmesi — bir cihazda gerçekten çalıştığını söylemez. Bu klasör onu söyler.

## Çalıştırma

```
pnpm mobile:e2e              # tüm akışlar
pnpm mobile:e2e -- depo.yaml # tek akış
```

Ön koşullar (hepsi ölçülür, eksikse akış ADLI hatayla düşer):

1. **Fiziksel cihaz ya da emülatör bağlı** — `adb devices` bir satır göstermeli.
2. **Metro ayakta** (8081) ve **mobil API** (3002) ve **Supabase** (54321).
3. **Cihazdan bu portlara erişim** — USB'de `adb reverse` tünelleri:
   `pnpm mobile:device` bunu kurar ve doğrular.

## Dev-client tuzağı

Uygulama bir **Expo dev-client**'tır. `launchApp` onu açtığında DevLauncher gelir, JS paketi
gelmez — akış "ekran bulunamadı" diye düşer ve sebep görünmez. Bu yüzden her akış paketi
**derin bağlantıyla** açar:

```
- openLink: lezzetanatolia://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081
```

Şema `app.config.ts`ten gelir (`scheme: 'lezzetanatolia'`); değişirse buradaki bağlantı da
değişmeli. Ortak açılış `common/launch.yaml`da tek yerde durur.

## Giriş

Personel girişi **dev oturumu** ucundan yapılır (`lib/auth/dev-login` → `/api/v1/auth/dev-session`):
mail turunu atlar ama kurduğu oturum gerçektir — magic-link jetonu üretilir ve Supabase'te
tüketilir. Kapı `NODE_ENV !== 'production'` ile sınırlı (`apps/mobile-api/src/api/v1/router.ts`).
Web e2e'sinin `auth/dev-login` kurulumuyla aynı içgüdü, aynı hesap listesi.

Roller birebir bölüme açılır (`lib/operations/sections.ts`), o yüzden akış hangi bölümü
sınıyorsa o rolle girer:

| Düğme | testID | Açtığı |
| --- | --- | --- |
| Depo | `login-dev-depo` | Depo |
| Kurye | `login-dev-kurye` | Kurye |
| Yönetim | `login-dev-yönetim` | Yönetim |
| Muhasebe | `login-dev-muhasebe` | Para + Depo (sekme çubuğunun görünür hâli) |
| Müşteri | `login-dev-müşteri` | Müşteri kabuğu |

## Paylaşılan veritabanı disiplini

Bu akışlar **yerel Supabase'e vurur** ve CLAUDE §4b'nin "DB'ye vuran koşu" kuralına tabidir:
gelişigüzel koşulmaz, teslim noktalarında koşulur. Akışlar **yazan** adımlar içeriyorsa
(sayım düzeltme, mal kabul) kendi kurduğu satırı kullanır; küresel sayıya bakan doğrulama
yazılmaz — başka bir ajanın verisi o sayıyı oynatır.

## Kanca konvansiyonu

Eşleşme **`testID`** üzerindendir (`id:` seçicisi), metin üzerinden değil: metin dile ve
sözlüğe bağlıdır, `testID` kodun kendi künyesidir. Uygulamada 1400'den fazla `testID` zaten
var ve kebab-case (`warehouse-hub-screen`, `operations-gate-loading`). Yeni bir kancaya ihtiyaç
doğarsa ekrana `testID` eklenir — akışa metin eşleşmesi yazılmaz.
