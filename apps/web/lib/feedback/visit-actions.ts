'use server';

import { currentCustomerId } from '@/lib/guard';
import { awardVisitPoints } from './points';

/**
 * **Günlük ziyaret puanı tetikleyicisi** (17.4 · kullanıcı kararı 03.08) — günde bir kez, 10 puan.
 *
 * Ödül "şunu yaptın" değil **"geldin"** karşılığıdır: keşfedilecek aday her zaman olmayabilir ama
 * ziyaret her zaman değerlidir, o yüzden ana sayfaya gelen de kazanır. Oy puanından ayrı bir
 * enstrüman ve ayrılması şart — oy puanı ürün başına tek kalır (her ziyarette yeniden ödemek,
 * `signal-quality`'nin bastırmak için var olduğu davranışı satın almak olurdu).
 *
 * ── KİMLİK SUNUCUDA ÇÖZÜLÜR ──────────────────────────────────────────────────
 * Müşteri kimliği parametre DEĞİL: istemciden gelen bir kimlikle puan yazmak, tarayıcı konsolundan
 * başkasının hesabına puan yüklemeye açık kapı bırakırdı. Girişsizde sessizce hiçbir şey olmaz —
 * ödülün sahibi yok.
 *
 * ── NEDEN BİR ACTION, MIDDLEWARE YA DA LAYOUT DEĞİL ──────────────────────────
 * - **RSC render'ında yazma YOK:** `layout.tsx` her sayfada koşuyor ama render yan etkisizdir; oraya
 *   bir defter yazımı koymak her gezinmede, her prefetch'te ve her `refresh`te tetiklenirdi.
 * - **Middleware YOK:** her istekte koşar (varlıklar, prefetch dahil) ve edge çalışma zamanında
 *   servis istemcimiz yok.
 *
 * **Dönüş yok ve sessiz.** Gün içindeki ikinci geliş bir arıza değil normal davranıştır; ekranın
 * söyleyeceği bir şey olmadığı için `awardVisitPoints`'in `null`'ı da buraya kadar gelmez. Bakiye
 * hesap sayfasındaki puan kartında zaten görünüyor.
 */
export async function recordVisitAction(): Promise<void> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) return;
    await awardVisitPoints(customerId);
  } catch {
    // Yutuluyor: bu eylemin bir ekranı yok ve ziyaretçi zaten gezinmeye devam ediyor. Bir puanın
    // yazılamaması, sayfanın açılmasını engellemesi gereken bir şey değil (DOMAIN §14: ödül
    // aksiyonu teşvik eder, ona şart koşmaz).
  }
}
