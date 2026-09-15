import { useCallback, useEffect, useRef, useState } from 'react';

import type { DeliveryAreaList } from '@lezzet/types';

import { fetchDeliveryAreas } from '@/lib/api/places';

/*
  TESLİMAT BÖLGELERİ VERİSİ — tek uç (`GET /api/v1/places/zones`), üç hâl.

  DİL YOK, KİMLİK YOK: cevap şehir adlarıdır (çevrilmez) ve liste herkese aynıdır — çağrının ne
  `locale` ne oturum parametresi var (uç sarmalayıcısının künyesi).

  SAYFALAMA YOK ve olmaması sözleşmenin kararıdır (`DeliveryAreaListSchema` künyesi): bölge kümesi
  operatörün elle kurduğu, doğal tavanlı bir kümedir → tek turda gelir (CLAUDE §1).

  BOŞ LİSTE HATA DEĞİLDİR: `ready` + sıfır satır meşru cevaptır (henüz müşteri-yüzü adı verilmiş
  bölge yok) ve ekran onu kendi cümlesiyle söyler. Hataya karıştırılsaydı ekran, çalışan bir
  sistemi arızalı gösterirdi.

  ESKİMİŞ CEVAP KORUMASI (`generation`): "tekrar dene"ye art arda basan parmak iki uçuş başlatır;
  yavaş olanın sonucu hızlıyı ezmesin diye sayacı tutmayan cevap YAZILMAZ (`use-packages-list`
  deseni).
*/

type DeliveryZonesStatus = 'loading' | 'ready' | 'error';

interface UseDeliveryZonesResult {
  status: DeliveryZonesStatus;
  /**
   * Ülke → yer → kodlar; yalnız `ready` hâlinde dolu olabilir (boş dizi meşru).
   *
   * ŞEKİL SUNUCUDAN GELDİĞİ GİBİ TAŞINIR — burada yeniden öbeklenmez. Öbekleme sunucunun kararı
   * (`DeliveryAreaListSchema` künyesi: iki yüzey aynı listeyi kendi kuralıyla öbeklerse bir gün
   * ayrışır); kancanın işi ağ hâllerini yönetmek, veriyi yeniden yorumlamak değil.
   */
  areas: DeliveryAreaList['areas'];
  retry: () => void;
}

export function useDeliveryZones(): UseDeliveryZonesResult {
  const [status, setStatus] = useState<DeliveryZonesStatus>('loading');
  const [areas, setAreas] = useState<DeliveryAreaList['areas']>([]);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');

    void fetchDeliveryAreas().then((result) => {
      if (run !== generation.current) return;

      if (result.error !== null) {
        // Eski satırlar bırakılmaz: hata mesajının altında kalan liste "bu bölgeler güncel"
        // izlenimi verirdi.
        setAreas([]);
        setStatus('error');
        return;
      }

      setAreas(result.data.areas);
      setStatus('ready');
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { status, areas, retry: load };
}
