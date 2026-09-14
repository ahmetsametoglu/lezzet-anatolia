# @lezzet/mobile-kit — native uygulamaların ortak çekirdeği

Native uygulama ikiye bölünüyor: müşteri ve operasyon (kullanıcı kararı 14.09, görev 21.310 —
`docs/build/21-mobil-uygulama.md`). İki uygulamanın ORTAK kullandığı kod burada durur: tema, UI
kiti, API istemcisi, oturum, push, dil, test sahteleri. Bugün tek tüketen `apps/mobile`; bölme
tamamlanınca iki uygulama.

## Kurallar

- **Uygulama kiti DERİN YOLLA okur:** `@lezzet/mobile-kit/src/components/ui/chat-layout`. Paketin
  girişi (barrel) YOK — hangi dosyanın kullanıldığı import satırında görünür, döngü kurulamaz.
- **Kit içi importlar GÖRELİDİR** (`../../lib/interaction/defer-press`). `@/` takma adı yalnız
  uygulamalarda; kitte takma ad olsaydı `pnpm boundaries`in döngü bekçisi onu göremezdi.
- **Kit uygulamaya bağlanamaz** (`pnpm boundaries` → `packages-not-to-apps`). Uygulamaya özgü bir
  karar gerekiyorsa parametreyle ya da kayıt fonksiyonuyla dışarıdan verilir.
- **Tek tarif:** Babel (`babel.cjs`), Jest (`jest-base.cjs`) ve TypeScript (`tsconfig.base.json`)
  ayarları burada yazılır; uygulamalar okur, kopyalamaz. Jest tabanı ORTAK kurulumu (`jest.setup.ts`:
  Unistyles + tema, hareket, çekmece, dokunma ertelemesi) her tüketende İLK çalıştırır; uygulama yalnız
  kendi yerel modül sahtelerini sona ekler.
- **Bağımlılık sürümleri uygulamayla BİREBİR aynı.** Kitin `node_modules`u pnpm deposunda
  uygulamanınkiyle AYNI klasörlere bağlanmalı. Ayrışırsa Metro iki ayrı `react-native-unistyles`
  kopyası paketler ve tema kaydı ikiye bölünür. Karşılaştırma:
  `readlink packages/mobile-kit/node_modules/react-native-unistyles` ile
  `readlink apps/mobile/node_modules/react-native-unistyles` aynı depo klasörünü göstermeli.
  Bu karşılaştırmayı uygulamanın testi makineyle yapar (`src/testing/dependency-guard.ts`).
- **Sürüm TAM yazılır, aralıkla değil.** Kit yeni bir içe aktarıcı olduğu için aynı aralık en yükseğe
  çözülebilir: `expo-constants` `~57.0.9` iken 57.0.14'e gitti ve pnpm uygulamanın Expo CLI kopyasını
  da o bağlama taşıdı (ölçüldü 14.09). Kural: eş bağımlılık = kit kodunun içe aktardığı dış paket (ev
  sahibi sağlar, uygulamanın aralığıyla); geliştirme bağımlılığı = aynı paketlerin uygulamadaki KİLİTLİ
  sürümü + test araçları + eş kimliği için gerekenler (`react-native-nitro-modules`,
  `react-native-reanimated`, `react-native-worklets`, `react-native-safe-area-context`,
  `react-native-screens`, `expo`).
- **Kurulumdan sonra kilit farkına bak.** Yeni içe aktarıcı eklenince pnpm Expo araçlarının yama
  sürümünü kaydırabiliyor (`@expo/image-utils`, `@expo/require-utils`; ölçüldü 14.09, iki kez). Kayma
  HEAD değerine döndürülür ve `pnpm install --frozen-lockfile` ile doğrulanır.
- **İkon verisi kitte DEĞİL:** geometri `@lezzet/brand/icons`ta (web'in telefon görünümüyle ortak,
  platformdan bağımsız). Kit yalnız çizicileri taşır.

## Komutlar

```bash
pnpm -C packages/mobile-kit test        # jest-expo + RNTL v14 (DB'siz)
pnpm -C packages/mobile-kit typecheck
pnpm -C packages/mobile-kit lint
```
