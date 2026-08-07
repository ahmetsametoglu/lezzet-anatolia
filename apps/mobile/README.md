# @lezzet/mobile — Lezzet Anatolia mobil uygulaması

Expo SDK 57 (React Native 0.86, expo-router, Unistyles 3). Mimari ve şerit sınırları:
`docs/uygulama/02-mimari-ve-sinirlar.md` · görev takibi: `docs/build/21-mobil-uygulama.md`.

> **Expo Go KULLANILMAZ; geliştirme daima development build (expo-dev-client) ile yapılır** —
> push ve Stripe Apple/Google Pay Expo Go'da çalışmadığından Go yeşili yalancı yeşildir (01-teknoloji-secimi §10).

## Komutlar

```bash
pnpm -C apps/mobile start        # Metro (dev client'a bağlanır)
pnpm -C apps/mobile test         # jest-expo + RNTL v14 (DB'siz, Vitest kuyruğuna girmez)
pnpm -C apps/mobile typecheck    # tsc --noEmit
pnpm -C apps/mobile lint         # kök flat config ile eslint
```

## Ortam değişkenleri

`cp .env.example .env` ile başla. `EXPO_PUBLIC_*` değişkenleri Metro tarafından **derleme anında**
bundle'a gömülür: yalnız istemciye açık değerler (API taban adresi, Supabase URL + anon anahtar) —
`SUPABASE_SECRET_KEY` hiçbir koşulda buraya yazılmaz (02-mimari §4). Değer değişince Metro'yu
yeniden başlat (gömme önbelleklidir).

## Notlar

- **CNG (prebuild) disiplini:** `ios/`/`android/` üretilir ve git dışıdır (`.gitignore`); native
  dosya elle DÜZENLENMEZ, her native ihtiyaç config plugin ile gelir.
- **Tema:** `src/theme/unistyles.ts` `@lezzet/design-tokens` kompozisyonunu (ortak taban +
  `customerApp*`) bağlar; ham renk/ölçü değeri koda yazılmaz. `app.json`'daki splash/ikon arka
  planları (nötr `#FFFFFF`) hâlâ token kaynağından GELMİYOR — BEKLEYEN(21.3) (JSON yorum
  taşıyamadığı için not burada; kalıcı çözüm `app.config.ts`).
- **Auth tesisatı (21.4b, ekransız):** `src/lib/api/client.ts` zarf istemcisi (`{data,error}` +
  Zod parse + Retry-After), `src/lib/auth/` oturum katmanı (SecureStore + supabase-js, OTP uçları,
  401→refresh→retry, signOut). UI bağlanınca ekranlar yalnız bu fonksiyonları çağırır.

## Ekranlar ve gezinme (21.7)

- **Kabuk:** kök `Stack` → `(tabs)` grubu (dört sekme: Vitrin · Katalog · Siparişler · Hesap) +
  grubun DIŞINDA yığın ekranları (`product/[slug]`). Yığına girildiğinde sekme çubuğu kendiliğinden
  gizlenir (tasarımın davranışı) çünkü rota grubun dışındadır.
- **Rota dosyaları İNCE:** `src/app/**` yalnız adres tanımıdır; ekranın gövdesi (görünüm · hook ·
  metinler) `src/screens/<ekran>/`ta yaşar — expo-router bu klasördeki her `.tsx`i rota sayardı.
- **Metin kolokasyonu:** ekran başına `messages.json` (fr/de/tr), tip `LocalizedCopy<typeof messages>`
  ile türer. Global sözlük YOK (CLAUDE §2). JSON dosyaları `app/` altında da durabilir: yönlendirici
  yalnız `.js/.jsx/.ts/.tsx` uzantılarını tarar.
- **Dil:** cihazın tercih sırasından çözülür (`src/lib/i18n/locale.ts` — `expo-localization`), yedek
  zinciri web ile aynı (desteklenen ilk dil, yoksa `DEFAULT_LOCALE` = fr). Dil kümesi ve varsayılan
  `@lezzet/i18n`den gelir, burada ikinci kez tanımlanmaz.
  **DİKKAT — `app.json`'daki `supportedLocales` bu kümenin İKİNCİ yazımıdır:** iOS `getLocales()`
  cevabını uygulamanın `CFBundleLocalizations` listesiyle SÜZER, yani liste eksikse Alman cihaz da
  Fransızca açılır. JSON import edemediği için değer orada elle duruyor; kalıcı çözüm `app.config.ts`
  (aynı dosyadaki splash rengi notuyla birlikte değerlendirilecek — yöneticiye raporlandı).
- **Fiyat cihazda biçimlenir:** sözleşme ham cent taşır (`priceCents`), gösterim
  `src/lib/format/price.ts`te. **BEKLEYEN(21.7):** bu fonksiyon `@lezzet/helper`a terfi etmeli
  (02-mimari §3.4) — bugün web'in ikizi `apps/web/lib/storefront/format.ts`te ve oradan import
  edilemiyor; gövde birebir aynı tutuldu ki terfi bir BİRLEŞTİRME değil bir SİLME olsun.
- **İkon sistemi YOK — BEKLEYEN(21.7):** tasarımın SVG yolları var (`Mobil - Musteri v3.dc.html`)
  ama çizecek bir araç yok (`react-native-svg` kurulu değil). Sekme çubuğu etiketle, durum blokları
  ikonsuz çalışıyor; karar yöneticinin.
