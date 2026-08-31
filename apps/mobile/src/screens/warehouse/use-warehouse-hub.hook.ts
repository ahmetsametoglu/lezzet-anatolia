import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type {
  BoxPrinterContract,
  InboundTransferContract,
  NearExpiryBatchContract,
  PreparationOrderContract,
} from '@lezzet/types';

import {
  fetchNearExpiry,
  fetchWarehouseTransfers,
  fetchPendingHandover,
  fetchPreparationQueue,
  fetchPrinters,
} from '@/lib/api/warehouse';
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
  /**
   * **Bu cihazın yazıcı kurulumu** — hub'ın alt şeridi tasarımda bir AÇIKLAMA değil bir DURUM
   * yazıyor: *"kutu etiketi QL-1110NWB · kargo etiketi tanımsız"* (görsel ajanı ölçümü 30.08,
   * hub farkı #4). Şerit "bu cihaz" diyorsa cihazın o anki hâlini söylemeli; ne işe yaradığını
   * anlatan bir cümle, ayarı açmadan hiçbir şey öğretmiyordu.
   *
   * `null` = OKUNAMADI ve şerit açıklama metnine düşer — boş liste ("hiç yazıcı yok") ile
   * karıştırılmaz: biri bir ölçüm düşüşü, öteki gerçek bir kurulum hâli (CLAUDE §1).
   *
   * Hata koşuluna KATILMAZ: yazıcı okuması düşse de hub çalışır — şerit bir ayar kapısıdır,
   * günün işi değil (devir sayacıyla aynı gerekçe).
   */
  printers: BoxPrinterContract[] | null;
  reload: () => void;
  /** Aşağı çekme — ekranı karartmadan tazeler. */
  refresh: () => void;
  /** Çekme sürüyor mu (`status` DEĞİL: o ekranı söküp yükleme hâline geçirirdi). */
  /** D3 kartının kaynağı — `null` = okunamadı (kart o zaman sayı yazmaz). */
  nearExpiry: NearExpiryBatchContract[] | null;
  reloading: boolean;
}

export function useWarehouseHub(): UseWarehouseHubResult {
  const [status, setStatus] = useState<HubStatus>('loading');
  const [orders, setOrders] = useState<PreparationOrderContract[] | null>(null);
  const [transfers, setTransfers] = useState<InboundTransferContract[] | null>(null);
  const [pendingHandover, setPendingHandover] = useState<number | null>(null);
  const [printers, setPrinters] = useState<BoxPrinterContract[] | null>(null);
  /** D3 kartının iki sayısı — okunamadıysa `null` ve kart "okunamadı" der (CLAUDE §1). */
  const [nearExpiry, setNearExpiry] = useState<NearExpiryBatchContract[] | null>(null);

  /** Kaçıncı yükün geçerli olduğu — geç gelen eski cevaplar yazılmaz (katalog/kurye emsali). */
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);

    const [queue, inbound, handover, printerList, expiring] = await Promise.all([
      trackWarehouse(fetchPreparationQueue()),
      trackWarehouse(fetchWarehouseTransfers()),
      trackWarehouse(fetchPendingHandover()),
      /* YAZICI OKUMASI `trackWarehouse`TAN GEÇMEZ — ölçüldü 30.08: geçirince üç test birden
         düştü. Sebep sinyalin kendisi: `trackWarehouse` her çağrının sonucunu PAYLAŞILAN depo
         durumuna yazıyor (çevrimdışı · "hangi depo?") ve o durum ekranı kilitliyor. Yazıcı bir
         AYAR kapısıdır; okuması düşünce hub'ın günlük işi kilitlenmemeli — künyede yazdığım
         "hata koşuluna katılmaz" kuralının sinyal tarafındaki karşılığı budur. */
      fetchPrinters(),
      /* D3 SAYAÇLARI (21.187): kart "kaç parti listede, kaçı imhalık" diyor ve o sayı bugüne kadar
         fikstürden geliyordu.

         `trackWarehouse`TAN GEÇMEZ ve sebebi ölçüldü (31.08): geçirince üç hub testi birden düştü
         — çevrimdışı ve "hangi depo" uyarıları kayboldu. Sebep sinyalin kendisi: `trackWarehouse`
         HER çağrının sonucunu paylaşılan depo durumuna yazıyor ve BAŞARILI bir D3 okuması,
         hazırlık kuyruğunun çevrimdışı sinyalini eziyordu. Sayaç bir ROZETTİR (devir sayacıyla
         aynı gerekçe): düşmesi hub'ı kullanılamaz yapmaz, yalnız bir satırın rakamını söylemez. */
      fetchNearExpiry(),
    ]);
    if (run !== generation.current) return;

    setOrders(queue.error === null ? queue.data.orders : null);
    setTransfers(inbound.error === null ? inbound.data.transfers : null);
    setPendingHandover(handover.error === null ? handover.data.boxes : null);
    setPrinters(printerList.error === null ? printerList.data.printers : null);
    setNearExpiry(expiring.error === null ? expiring.data.batches : null);
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

  /* AŞAĞI ÇEKME KENDİ BAYRAĞINI İSTER (kullanıcı isteği 30.08): `status`u `loading`e çevirmek
     hub'ı söküp yükleme hâline geçirirdi — oysa çekmenin sözü "ekran dursun, üstüne taze veri
     gelsin". Bayrak ayrı; kutucuklar yerinde kalır, yalnız halka döner. */
  const [reloading, setReloading] = useState(false);
  const refresh = useCallback(() => {
    setReloading(true);
    void load().finally(() => setReloading(false));
  }, [load]);

  return { status, orders, transfers, pendingHandover, printers, nearExpiry, reload, refresh, reloading };
}
