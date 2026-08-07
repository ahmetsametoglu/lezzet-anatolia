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
  **Yerel modül eklendiğinde dev-client YENİDEN DERLENİR** — bu dilimde üçü birden geldi
  (`expo-blur`, `react-native-svg`, `expo-font`); mevcut bir dev-client build'i onları görmez.
- **Yapılandırma `app.config.ts`te** (21.7'de `app.json`ın yerine geçti): TS olduğu için hem
  import edebiliyor hem gerekçe taşıyabiliyor. `supportedLocales` artık `@lezzet/i18n`in
  `LOCALES`ından TÜRÜYOR (ikinci yazım kalktı); splash/ikon arka planları hâlâ nötr `#FFFFFF` —
  **BEKLEYEN(21.3)**, gerekçesi (görsellerin de krem zemine göre yeniden üretilmesi gerektiği)
  artık dosyanın kendi içinde yazılı.
- **Tema:** `src/theme/unistyles.ts` `@lezzet/design-tokens` kompozisyonunu (ortak taban +
  `customerApp*`) bağlar; ham renk/ölçü değeri koda yazılmaz. Boşluk/ölçü ailesi paket taşımadığı
  için `src/theme/metrics.ts`te (terfi adayı).
- **Fontlar (Token Kararlari #24):** `src/theme/fonts.ts` — Lora 400·600 + Karla 400·600·700,
  italik YOK, kaynak `@expo-google-fonts/*` (sürümlü ve kilitli). Yükleme kökte tek yerde
  (`app/_layout.tsx`) ve AÇILIŞI ENGELLEMEZ (FOUT kabul). **Seam AĞIRLIKLA indekslenir**
  (`theme.font.body[700]`) çünkü RN'de ağırlık ailenin adının içindedir; `fontFamily` +
  `fontWeight` ikilisi özel ailede sahte kalınlık üretirdi.
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
  `@lezzet/i18n`den gelir, burada ikinci kez tanımlanmaz — `app.config.ts`teki `supportedLocales`
  de artık aynı kaynaktan türüyor (iOS `getLocales()` cevabını `CFBundleLocalizations` listesiyle
  SÜZER; liste sapsaydı Alman cihaz sessizce Fransızca açılırdı).
- **Fiyat cihazda biçimlenir:** sözleşme ham cent taşır (`priceCents`), gösterim
  `@lezzet/helper`ın `formatPrice`ıdır — web ile TEK kaynak (02-mimari §3.4).
- **İkon sistemi (21.7):** `src/components/ui/icon.tsx` (çizim) + `icon-paths.ts` (geometri).
  Yollar v3 tasarımından BİREBİR alınır — hazır bir ikon setine geçmek "improvise etme" kuralının
  ihlali olurdu. Renk ve boy çağırandan/temadan; ham hex yok. İkon ekran okuyucudan gizlidir
  (yanında zaten metin var). Bugün bağlı olanlar: dört sekme + katalog arama/süzgeç + boş/hata
  blokları. **BEKLEYEN(21.7):** şablonun kalan ~20 ikonu (paylaş · kupon · kamyon · kalp · zil …)
  ekranları yazıldıkça sözlüğe eklenecek.
- **Krem cam yüzeyler:** `AppBar` ve `BottomTabBar` `expo-blur` + `cream-glass` (%96) ile kurulu.
  **BEKLEYEN(21.7):** Android'de arka plan bulanıklığı `BlurTargetView` sarmalayıcısı ister (ekranın
  kaydırma alanına ref ile bağlanmak) — bugün iOS'ta bulanık, Android'de %96 krem.
