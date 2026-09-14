import type * as NotificationsModule from 'expo-notifications';

/**
 * `expo-notifications`in KORUMALI kapısı — modül bu derlemede yoksa `null` (27.08).
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Native modül `package.json`a girmekle var olmaz: dev-client (ve store) derlemesinin YENİDEN
 * yapılması gerekir. Derlenmemiş bir kurulumda statik `import` TEK BAŞINA uygulamayı düşürüyordu —
 * modül açılış zincirinde duruyor (`sign-out` → `register-device`) ve hata kırmızı ekranla
 * geliyordu: *"Cannot find native module 'ExpoPushTokenManager'"*. Kimse giriş bile yapamıyordu
 * (yaşandı 26.08 · OPPO CPH1907; üç şeridin cihaz turu o gün bu yüzden kapandı).
 *
 * Fonksiyonun içindeki `try/catch` bu hâli YAKALAYAMAZ: patlayan şey çağrı değil, dosyanın
 * yüklenmesidir. Bu yüzden import geciktirilir — `require` ilk ihtiyaç anında koşar ve yokluk
 * orada, çalışma zamanında karşılanır.
 *
 * ── NEDEN SESSİZ (ve neden bu sessizlik meşru) ──────────────────────────────
 * Push bir HIZLANDIRICIDIR, tek kapı değil (zemin brief kuralı): modül yoksa uygulama içi zil
 * aynı satırları taşımaya devam eder, yani bu bir arıza değil bir vazgeçiştir. Yutma sessiz ama
 * GÖRÜNMEZ değil — "push neden gelmiyor" sorusu koddan cevaplanır: `pushNative()` `null` döner ve
 * çağıranların ikisi de o dalda hiç iş yapmadan çıkar (CLAUDE §1: sessiz catch ancak sebebi
 * yazılıysa meşrudur). Log'lanmıyor çünkü mobilde `console` lint'le kapalı ve tek kullanımlık bir
 * uyarı için kanal açmak, kanalın kendisini bir borca çevirirdi.
 */
let cached: typeof NotificationsModule | null | undefined;

export function pushNative(): typeof NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as typeof NotificationsModule;
  } catch {
    cached = null; // künye yukarıda: modül yok = push yok, uygulama açılmaya devam eder
  }
  return cached;
}
