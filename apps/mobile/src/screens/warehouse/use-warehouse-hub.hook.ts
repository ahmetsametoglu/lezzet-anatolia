import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { PreparationOrderContract, InboundTransferContract } from '@lezzet/types';

import { fetchInboundTransfers, fetchPendingHandover, fetchPreparationQueue } from '@/lib/api/warehouse';
import { trackWarehouse } from './warehouse-status';

/*
  DEPO HUB'ININ SAYILARI (v2:264-310) — iş listesi, sayaçlarıyla.

  ── SAYAÇ UÇTAN GELMEZ, LİSTEDEN SAYILIR ────────────────────────────────────
  Sözleşme künyesi açık: *"hub sayaçları ve D3 listesi burada YOK, çünkü karşılıkları henüz bir
  kapıda değil."* Yani hub'ın kendi ucu yok; sayılar bölümün ZATEN okuduğu iki listeden çıkıyor —
  hazırlama kuyruğu (D1) ve gelen transferler (D5). Üçüncü bir "özet" ucu istemek, iki kez okunan
  aynı gerçeği bir kez daha okumak olurdu.

  ── BİR SAYAÇ KENDİ UCUNDAN GELİYOR, VE SEBEBİ ÖLÇÜLDÜ ──────────────────────
  **Kargo devri (D8) istisna** (07.12): bekleyen kutuları hiçbir liste taşımıyor. Duyurulmuş bir
  siparişin kutuları hazırlık kuyruğundan DÜŞMÜŞTÜR (sipariş `ready`/`out_for_delivery`) ve gelen
  transferlerle hiç ilgisi yok — yani "listeden say" burada uygulanamıyordu. Ucu bu yüzden var
  (`GET /warehouse/handover/pending`) ve döndürdüğü şey bir LİSTE değil bir SAYI: devir ekranı bir
  okutucudur, bekleyenler listesi olmayan bir seçimi varmış gibi gösterirdi.

  Karşılığı OLMAYAN satırlar (D2 mal kabul · D6 kurye dönüşü) sayaç göstermez ve bu bilinçli:
  bekleyen sevkiyatı ve dönüş dökümünü listeleyen kapı yok. Uydurma bir sayı basmak, depocuyu
  olmayan bir işe göndermek olurdu (CLAUDE §1). D3'ün sayısı fixture'dan gelir ve fixture'ın
  gerekçesi kendi dosyasında (06.13).

  ── İKİ OKUMANIN KADERİ AYRI ────────────────────────────────────────────────
  Biri düşerse ÖTEKİ ayakta kalır: satırın alt metni "okunamadı" der ve liste çizilir. İkisi birden
  düşerse hata bloğu çıkar — gösterilecek hiçbir şey kalmamıştır. Sıfır yazmak yasak: ölçülemeyen
  değer sıfır değildir ve "bekleyen sipariş yok" diyen bir hub, depocuyu evine gönderir.

  ── ODAKTA TAZELENİR ────────────────────────────────────────────────────────
  Alt ekrandan (toplama, kabul, transfer) dönen depocu az önce yazdığı işin listeden düştüğünü
  GÖRMELİ. `useFocusEffect` ilk girişte de koşar; sonraki dönüşlerde iskelet gösterilmez (liste
  yerinde kalır, sessizce tazelenir) — kurye emsaliyle aynı.
*/

type HubStatus = 'loading' | 'ready' | 'error';

interface UseWarehouseHubResult {
  status: HubStatus;
  /** Hazırlama kuyruğu; `null` = OKUNAMADI (boş liste değil). */
  orders: PreparationOrderContract[] | null;
  /** Gelen transferler; `null` = OKUNAMADI. */
  transfers: InboundTransferContract[] | null;
  /**
   * Rampada taşıyıcıyı bekleyen kutu adedi; **`null` = OKUNAMADI, sıfır DEĞİL** (CLAUDE §1).
   * Sıfıra düşürmek "rampa boş" derdi ve depocu kutuları orada bırakırdı.
   */
  pendingHandover: number | null;
  reload: () => void;
}

export function useWarehouseHub(): UseWarehouseHubResult {
  const [status, setStatus] = useState<HubStatus>('loading');
  const [orders, setOrders] = useState<PreparationOrderContract[] | null>(null);
  const [transfers, setTransfers] = useState<InboundTransferContract[] | null>(null);
  const [pendingHandover, setPendingHandover] = useState<number | null>(null);

  /** Kaçıncı yükün geçerli olduğu — geç gelen eski cevaplar yazılmaz (katalog/kurye emsali). */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);

    const [queue, inbound, handover] = await Promise.all([
      trackWarehouse(fetchPreparationQueue()),
      trackWarehouse(fetchInboundTransfers()),
      trackWarehouse(fetchPendingHandover()),
    ]);
    if (run !== generation.current) return;

    setOrders(queue.error === null ? queue.data.orders : null);
    setTransfers(inbound.error === null ? inbound.data.transfers : null);
    setPendingHandover(handover.error === null ? handover.data.boxes : null);
    /*
      HATA HÂLİ İKİ ANA OKUMAYA BAĞLI KALDI — devir sayacı onu tetiklemiyor.

      Sayaç bir ROZETTİR: düşmesi hub'ı kullanılamaz yapmaz, yalnız bir satırın rakamını
      söylemez. Onu da hata koşuluna katsaydık tek bir sayacın düşüşü, çalışan iki listeyi de
      gizleyen tam ekran hata bloğu doğururdu.
    */
    setStatus(queue.error !== null && inbound.error !== null ? 'error' : 'ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  return { status, orders, transfers, pendingHandover, reload };
}
