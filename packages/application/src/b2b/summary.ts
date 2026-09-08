import { b2bSummaryTask, runTask, type AiFailureReason } from '@lezzet/ai';
import type { SupabaseClient } from '@supabase/supabase-js';

import { readB2bCheck } from './check';

/*
  BAŞVURU ÖZETİ — kontrol kartındaki tek cümlelik OKUMA YARDIMI (21.285).

  ── NEDEN KARTIN İÇİNDE DEĞİL, AYRI BİR OKUMA ───────────────────────────────
  Model çağrısı saniye mertebesinde; kartın açılışı onu bekleseydi operatör kararın dayanağını
  görmek için modelin dönmesini beklerdi. Sıra bilinçli: kart çizilir, özet sonradan düşer. Özet
  hiç gelmezse kart eksik değildir — sinyaller zaten yukarıda ve karar onlardan verilir.

  ── DIŞ SERVİSLER BURADA SORULMAZ ───────────────────────────────────────────
  `refreshExternal: false`: kartı okuyan çağrı SIRET ve VIES'i az önce sordu ve özet ancak kart
  çizildikten sonra isteniyor. Burada bir kez daha sormak kart başına iki SIRET + iki VIES çağrısı
  demekti — aynı gerekçe web'in eyleminde de yazılı.

  ── İKİ YÜZEYİN TEK KAPISI ──────────────────────────────────────────────────
  Bu montaj bir tur yalnız web'in server action'ında duruyordu; mobil de aynı cümleyi isteyince
  buraya terfi etti. İkinci nüsha yazılsaydı bir gün biri girdiyi başka kurar (mesela mükerrer
  sayısını unutur) ve iki yüzey aynı başvuru için farklı cümleler gösterirdi (CLAUDE §1).
*/

export type B2bSummaryResult =
  | { ok: true; summary: string }
  | { ok: false; reason: AiFailureReason; message: string };

/**
 * Başvurunun sinyallerini tek cümleye indirir. **Fırlatmaz** — anahtar yoksa da sağlayıcı düştüyse
 * de adlı bir ret döner (`runTask`ın sözleşmesi).
 *
 * Sebep ayrık tutuluyor ama YÜZEYE ayrıntısıyla gitmesi gerekmiyor: operatörün yapacağı şey her
 * iki hâlde de aynı — sinyalleri yukarıdan okumak. Ayrım çağıranın kaydı ve teşhisi içindir.
 */
export async function readB2bSummary(db: SupabaseClient, customerId: string): Promise<B2bSummaryResult | null> {
  const check = await readB2bCheck(db, customerId, { refreshExternal: false });
  // `null` = müşteri yok; "özet üretilemedi" DEĞİL. İkisini tek cevaba indirmek, silinmiş bir
  // kaydı "modeli çalışmadı" gibi okuturdu ve çağıran yanlış hâli çizerdi.
  if (!check) return null;

  const result = await runTask(b2bSummaryTask, {
    legalName: check.legalName,
    country: check.country,
    // Sinyaller motorun ürettiği gibi gider; model kendi kanıtını toplamaz (sınıf 3 çizgisi).
    signals: check.signals.map((signal) => ({ label: signal.label, value: signal.value, tone: signal.tone })),
    duplicateCount: check.duplicates.length,
  });

  if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
  return { ok: true, summary: result.data.summary };
}
