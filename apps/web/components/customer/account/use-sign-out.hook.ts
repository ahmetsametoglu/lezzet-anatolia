'use client';

import { useState } from 'react';
import { signOutAction } from '@/lib/auth/actions';

/**
 * Çıkış akışı — **iki yüzey, tek davranış** (03.08).
 *
 * Masaüstü başlığındaki hesap menüsü ile mobil menü aynı işi yapıyor ve aynı şeyi yapmak zorunda:
 * oturumu kapat, sonra **tam yenileme**. Yumuşak tazeleme yetmez — oturum sunucuda çözülüyor ve ona
 * göre kurulmuş her şey (sepet, adresler, kayıtlılar) sıfırdan kurulmalı; yoksa ekranda önceki
 * kişinin verisi kalır. Paylaşılan bir telefonda bu, kimliğin sızması demektir.
 *
 * İki satırlık bir iş ama iki yerde durursa biri değiştiğinde öteki eskir ve fark ancak birinin
 * ekranında görünür. `busy` de buradan gelir: çift tıklamada ikinci çağrı boşa gider.
 */
export function useSignOut(): { busy: boolean; signOut: () => Promise<void> } {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    signOut: async () => {
      setBusy(true);
      await signOutAction();
      window.location.reload();
    },
  };
}
