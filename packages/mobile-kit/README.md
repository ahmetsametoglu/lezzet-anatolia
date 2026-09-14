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
  ayarları burada yazılır; uygulamalar okur, kopyalamaz.
- **Bağımlılık sürümleri uygulamayla BİREBİR aynı.** Kitin `node_modules`u pnpm deposunda
  uygulamanınkiyle AYNI klasörlere bağlanmalı. Ayrışırsa Metro iki ayrı `react-native-unistyles`
  kopyası paketler ve tema kaydı ikiye bölünür. Karşılaştırma:
  `readlink packages/mobile-kit/node_modules/react-native-unistyles` ile
  `readlink apps/mobile/node_modules/react-native-unistyles` aynı depo klasörünü göstermeli.
  Bu karşılaştırmayı uygulamanın testi makineyle yapar (`src/testing/dependency-guard.ts`).
- **Sürüm, aralıkla değil TAM yazılabilir.** Kit yeni bir içe aktarıcı olduğu için aynı aralık
  (`~57.0.9`) en yükseğe çözülebilir: `expo-constants` böyle 57.0.14'e gitti ve pnpm uygulamanın
  Expo CLI kopyasını da o bağlama taşıdı (ölçüldü 14.09). Kitte bu yüzden `"expo-constants": "57.0.9"`
  yazılı. Kit kodu onu henüz import etmediği için `knip.json`da muaf; ortak çekirdek geldiğinde
  (`lib/env.ts`) kullanılır hâle gelir ve muafiyet silinir.

## Komutlar

```bash
pnpm -C packages/mobile-kit test        # jest-expo + RNTL v14 (DB'siz)
pnpm -C packages/mobile-kit typecheck
pnpm -C packages/mobile-kit lint
```
