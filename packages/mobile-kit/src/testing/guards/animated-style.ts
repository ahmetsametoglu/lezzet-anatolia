import { readFileSync } from 'node:fs';
import path from 'node:path';

import { sourceFiles } from './source-files';

/*
  RN `Animated`IN DÜZLEŞTİRME BEKÇİSİ (21.121'in ikinci yarısı, 27.08).

  ── KURAL ───────────────────────────────────────────────────────────────────
  **React Native'in kendi `Animated.View`'ine İKİ unistyles stili verilemez.**

  Dizi sözdizimi doğru olsa bile (`style={[styles.a, styles.b, {…}]}`) RN'in `Animated`ı diziyi
  İÇERİDE tek nesneye düzleştiriyor; düzleşen nesnede iki unistyles anahtarı yan yana gelince
  kütüphane uyarıyor: *"we detected style object with 2 unistyles styles… might cause no updates
  or unpredictable behavior."* Uyarı boş değil — birleşen stiller tema değişimini alamayabilir,
  yani karanlık moda geçiş o bileşene işlemez.

  ── NEDEN BEKÇİ: ÜÇÜNCÜSÜ OLMASIN ───────────────────────────────────────────
  Aynı arıza İKİ KEZ ayrı ayrı bulundu ve her seferinde tek dosyada düzeltildi:
  · **15.08 (21.52 · MB-30)** — `skeleton.tsx`. Çözüm: zemin tonlarını tek tam stile taşımak.
    Künyesi de gerekçeyi yazmıştı; ama kural o dosyada kaldı.
  · **27.08 (21.121)** — `loading-state.tsx`. Aynı desen (`[styles.ring, styles[size], …]`), aynı
    uyarı. 21.52 turu kardeşini görmedi çünkü aramak için bir yer yoktu.
  Cihazda ölçüldü (logcat, taze süreç + depo hub'ı): düzeltme öncesi **2 uyarı**, sonrası **0**.

  ── SINIR: REANIMATED MUAF, VE BU ÖLÇÜLDÜ ───────────────────────────────────
  `react-native-reanimated`ın `Animated.View`'i style'ı düzleştirmiyor. `discover-screen`de aynı
  şekilli BEŞ kullanım var (`[styles.glow, styles.glowRest, glowStyle]` gibi) ve cihazda kart
  sürüklenirken bile **tek uyarı çıkmadı** (27.08 ölçümü). Bu yüzden bekçi importa bakar: kural
  yalnız `react-native`ten gelen `Animated` içindir. Reanimated'ı da suçlamak, olmayan bir arıza
  için beş yeri değiştirmek olurdu (CLAUDE §1: sebebi kanıtlanmadan müdahale yok).

  ── BEKÇİ NEYİ ÖLÇMEZ ───────────────────────────────────────────────────────
  Çalışma anındaki uyarının kendisini — o cihazda ölçülür. Bu dosya yalnız uyarıyı DOĞURAN deseni
  arar: RN `Animated.View`ın style dizisinde birden fazla `styles.*` başvurusu.

  ── MANTIK KİTTE, TARAMA KÖK BAŞINA (21.310) ─────────────────────────────────
  Her uygulama kendi kaynağını `describeAnimatedStyleGuard` ile tarar, kit kendi kaynağını kendi
  testinde; bölünmeden sonra operasyon ekranlarının bir tur bu bekçinin dışında kaldığı boşluk böyle
  kapandı.
*/

/** `import { … Animated … } from 'react-native'` — Reanimated varsayılan importu bu kalıba UYMAZ. */
export function usesReactNativeAnimated(source: string): boolean {
  const named = source.match(/import\s*\{([^}]*)\}\s*from\s*'react-native'/);
  return named !== null && /\bAnimated\b/.test(named[1]!);
}

/**
 * `<Animated.View style={[ … ]}>` dizisindeki `styles.*` başvurularını sayar.
 *
 * `styles.ring(size)` gibi DİNAMİK stil de tek başvurudur ve tek unistyles nesnesi döndürür —
 * 21.121'in çözümü tam olarak buydu, o yüzden ihlal sayılmaz.
 */
export function violationsIn(label: string, source: string): string[] {
  const found: string[] = [];
  const pattern = /<Animated\.View\b[\s\S]{0,400}?style=\{\[([\s\S]*?)\]\}/g;
  for (const match of source.matchAll(pattern)) {
    const styleRefs = match[1]!.match(/\bstyles\.[A-Za-z0-9_$]+|\bstyles\[/g) ?? [];
    if (styleRefs.length > 1) {
      const line = source.slice(0, match.index).split('\n').length;
      found.push(`${label}:${line} → ${styleRefs.length} unistyles stili`);
    }
  }
  return found;
}

/** Bir kökün (uygulamanın ya da kitin kaynağı) ihlalleri — `dosya:satır` adresiyle. */
export function animatedStyleViolations(root: string): string[] {
  return sourceFiles(root).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return usesReactNativeAnimated(source) ? violationsIn(path.relative(root, file), source) : [];
  });
}

/** Bir kökün kuralı; bekçinin öz-testleri kitin kendi testinde. */
export function describeAnimatedStyleGuard(root: string): void {
  describe('RN Animated — style dizisinde iki unistyles stili olamaz', () => {
    it('hiçbir `Animated.View` iki unistyles stilini birlikte taşımaz', () => {
      expect(animatedStyleViolations(root)).toEqual([]);
    });
  });
}
