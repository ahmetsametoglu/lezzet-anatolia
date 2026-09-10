import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type { ApiFail } from '@/lib/api/client';
import { fetchManagementHub } from '@/lib/api/management';
import type { ManagementHub } from '@lezzet/types';

/*
  YÖNETİM HUB OKUMASI (21.12) — karar kutusu + gün özeti tek zarfta.

  İki ekran (hub · gün özeti) aynı kancayı AYRI AYRI kurar ve bu bilinçli: gün özeti her açılışta
  taze okur — hub'dan devralınmış bayat bir fotoğraf göstermek, "salt okuma · günün fotoğrafı"
  vaadinin tersi olurdu. Ortak durum gerekseydi provider deseni hazır (sale emsali); burada durum
  değil VERİ paylaşılıyor ve verinin tazesi uçta.

  Yarışın bekçisi sıra numarası (`use-sale.hook` künyesi): geç gelen eski cevap sessizce düşer.

  ── ODAKTA TAZELENİR (06.09'da ölçülen arıza) ───────────────────────────────
  Okuma MONTAJDA bir kez koşuyordu (`useEffect`) ve bir daha hiç bakmıyordu; kabuk yığınında hub
  ekranı sökülmediği için sayılar saatlerce yerinde kalıyordu. İki sonucu vardı:

  · **Kapı, içerisiyle ayrışıyordu.** Kutucuk "1 cevap bekleyen konuşma" derken gelen kutusu
    ekranı (odakta tazelenen bir liste) çoktan başka bir sayıya bakmış oluyordu; operatör
    sohbetleri cevaplayıp geri döndüğünde kapının rakamı hâlâ eski gündü.
  · **Ölü bir oturumu SAĞLIKLI gösteriyordu.** Cihazda oturum ölünce her okuma `401` döner; hub
    ise montaj anındaki dolu fotoğrafı çizmeye devam ettiği için arıza "yalnız sosyal gelen
    kutusunda" gibi göründü ve teşhis yanlış yere gitti (rapor: "hub veriyle yükleniyor").

  Kurye günü ve depo hub'ı aynı kararı çoktan vermişti (*"alt ekrandan dönen depocu az önce yazdığı
  işin listeden düştüğünü GÖRMELİ"*); yönetim hub'ı bölümün tek aykırısıydı. Dönüşlerde iskelet
  gösterilmez — kartlar yerinde kalır, sayı sessizce tazelenir.
*/

type HubState =
  | { status: 'loading' }
  /** Düşen çağrının kendisi taşınır: sebep cümlesini ekran ondan kurar (`operationsFailureText`). */
  | { status: 'error'; failure: ApiFail }
  | { status: 'ready'; hub: ManagementHub };

interface UseManagementHubResult {
  state: HubState;
  retry: () => void;
  /** Aşağı çekme — ekranı karartmadan tazeler. */
  refresh: () => void;
  /** Çekme sürüyor mu. `state` DEĞİL: onu `loading`e çevirmek kartları söküp iskelete geçirirdi. */
  reloading: boolean;
}

export function useManagementHub(): UseManagementHubResult {
  const [state, setState] = useState<HubState>({ status: 'loading' });
  const [reloading, setReloading] = useState(false);
  const generation = useRef(0);
  /** İlk yük iskeletle, sonraki odak dönüşleri sessiz — depo hub'ı/kurye günüyle aynı kural. */
  const loaded = useRef(false);

  /*
    `silent` AŞAĞI ÇEKMENİN ŞARTIDIR (depo hub'ıyla aynı desen): çekme "ekran dursun, üstüne taze
    veri gelsin" der. Durumu `loading`e çevirmek kartları söker ve yerine iskelet koyar — yani
    yöneticinin okumakta olduğu kuyruk gözünün önünde kaybolur.
  */
  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    const run = ++generation.current;
    if (options.silent !== true) setState({ status: 'loading' });
    const result = await fetchManagementHub();
    if (run !== generation.current) return;
    loaded.current = true;
    setState(result.error !== null ? { status: 'error', failure: result } : { status: 'ready', hub: result.data });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: loaded.current });
    }, [load]),
  );

  const refresh = useCallback(() => {
    setReloading(true);
    void load({ silent: true }).finally(() => setReloading(false));
  }, [load]);

  return { state, retry: () => void load(), refresh, reloading };
}
