'use client';

import { useEffect } from 'react';
import { recordVisitAction } from '@/lib/feedback/visit-actions';

/**
 * Günlük ziyaret puanının tetikleyicisi (17.4) — **hiçbir şey çizmez**, oturum başına bir kez
 * sunucuya "geldi" der.
 *
 * Yalnız GİRİŞLİ müşteri için monte edilir (`layout.tsx`): kimlik zaten kökte okunuyor, yani
 * ziyaretçi için boşuna bir sunucu turu atılmaz. Kapı yine de kendi kimliğini sunucuda çözer —
 * montaj bir OPTİMİZASYON, güvenlik kararı değil.
 *
 * ── BEKÇİ NEDEN GARANTİ DEĞİL ────────────────────────────────────────────────
 * `sessionStorage` yalnız gürültüyü azaltır: silinebilir, ikinci sekme onu paylaşmaz, gizli sekmede
 * hiç yazılamayabilir. **Günde birin asıl güvencesi veritabanındaki gün bazlı tekillik indeksidir**
 * (`points_entry_visit_day`) — yarışta ikinci yazım oraya takılır ve `awardPoints` `23505`'i zaten
 * sessizce yutar. Bekçiyi garanti sanıp indeksten vazgeçmek, kuralı kodun tarayıcıdaki yarısına
 * emanet etmek olurdu.
 */
export function VisitPing() {
  useEffect(() => {
    let alreadyPinged = false;
    try {
      alreadyPinged = sessionStorage.getItem(SESSION_KEY) !== null;
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // Yutuluyor ve sebebi yukarıdaki künyede: depo okunamıyorsa bekçisiz devam edilir. Fazladan
      // bir çağrı zararsızdır (indeks ikinciyi reddeder), ama sırf depo kapalı diye puanı hiç
      // yazmamak müşterinin hakkını yerdi.
    }
    if (alreadyPinged) return;
    void recordVisitAction();
  }, []);

  return null;
}

/** Oturum bekçisinin anahtarı — öteki istemci depolarıyla aynı `lezzet.` önekinde. */
const SESSION_KEY = 'lezzet.visit';
