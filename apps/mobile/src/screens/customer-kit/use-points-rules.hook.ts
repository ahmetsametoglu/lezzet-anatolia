import { useEffect, useState } from 'react';

import { fetchPointsRules, type PointsRules } from '@/lib/api/points';

/*
  PUAN PROGRAMININ KURALLARI — kimliksiz okuma (kullanıcı kararı 12.08).

  İki tüketen var ve ikisi de oturumsuz olabiliyor: onboarding'in son adımı (misafir) ve hesaptan
  açılan "Nasıl puan kazanırım?" çekmecesi. Kapı `authorizedFetch` DEĞİL (`lib/api/points` künyesi):
  jeton beklemeyen açık bir uç.

  ── SONUÇ ÜÇ HÂLLİ, İKİ DEĞİL ───────────────────────────────────────────────
  `null` "yüklenmedi" demek DEĞİL: yükleniyor ile okunamadı ayrı hâller. Okunamayan kuralı boş bir
  listeye çevirseydik ekran "kazanılacak hiçbir şey yok" derdi — CLAUDE §1: ölçülemeyen değer sıfır
  değildir. Çağıran hata hâlinde bölümü hiç çizmez, uydurma bir sayı basmaz.
*/

/* İhraç EDİLMEZ (knip): çağıranlar dönüşü çıkarımla okuyor — bugün dışarıdan adıyla anan yok.
   İlk dış tüketici çıkınca açılır (kitin öteki tiplerinde de aynı hüküm). */
type PointsRulesState =
  | { status: 'loading' }
  | { status: 'ready'; rules: PointsRules }
  /** Ağ ya da sözleşme hatası — ekran bölümü çizmez; "0 puan kazanılır" demekten iyidir. */
  | { status: 'failed' };

export function usePointsRules(): PointsRulesState {
  const [state, setState] = useState<PointsRulesState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void fetchPointsRules().then((result) => {
      if (!alive) return;
      setState(result.error === null ? { status: 'ready', rules: result.data } : { status: 'failed' });
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
