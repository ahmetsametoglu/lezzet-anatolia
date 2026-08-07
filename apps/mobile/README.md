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
- **Tema:** `src/theme/unistyles.ts` şimdilik boş iskelet — BEKLEYEN(21.3): gerçek token seti
  `design-tokens` paketinden gelecek, ham renk değeri bu pakete yazılmaz. `app.json`'daki splash/ikon
  arka planları (nötr `#FFFFFF`) da 21.3'te token kaynağından güncellenecek (JSON yorum taşıyamadığı
  için not burada).
- **Ekran yok:** tasarımlar ayrı hatta kurgulanıyor; tek sade `index` rotası + yer tutucu komponent var.
- **Auth tesisatı (21.4b, ekransız):** `src/lib/api/client.ts` zarf istemcisi (`{data,error}` +
  Zod parse + Retry-After), `src/lib/auth/` oturum katmanı (SecureStore + supabase-js, OTP uçları,
  401→refresh→retry, signOut). UI bağlanınca ekranlar yalnız bu fonksiyonları çağırır.
