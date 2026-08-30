import { useCallback, useRef, useState } from 'react';
import type { ResolvedBatchContract } from '@lezzet/types';

import { resolveBatchCode } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  RAFTAKİ PARTİ ETİKETİNİ OKUT — D4'ün İKİNCİ ÇIKIŞ YOLU (v3:914, 30.08).

  ── NEDEN AYRI BİR HOOK ─────────────────────────────────────────────────────
  Sayım ekranının kendi hook'u (`use-adjustment`) düzeltmenin YAZMA yarısıdır ve konusu zaten
  seçilmiş bir partidir. Bu ise konuyu BULMA yarısı: ekran daha bir partiye sahip değilken çalışır
  ve iş bitince ekranı terk eder (rota değişir). İkisini tek hook'a koymak, yazma durumunu
  (sebep · adet · not) henüz konusu olmayan bir ekranda taşımak olurdu.

  ── ÇOĞUL EŞLEŞME BİR ARIZA DEĞİL, KURALIN KENDİSİ ──────────────────────────
  Lot numarası benzersiz DEĞİL (`stock.lot_number` üzerinde tekillik kısıtı yok): aynı lot iki ayrı
  son tarihle ya da iki ayrı rafta durabilir. Tekile indirip ilkini seçmek, depocunun elinde
  tutmadığı bir partiden mal düşürmek olurdu — sistem hangisini seçtiğini söylemeden. Bu yüzden
  bir eşleşmede DOĞRUDAN geçilir, birden çoğunda SORULUR.

  ── OKUNAMAYAN CEVAP SESSİZ KALMAZ ──────────────────────────────────────────
  `unknown` bir hata değil cevaptır ("bu kodla bu depoda açık parti yok") ve okutulan kodu
  içinde taşır: depocu yanlış kutuyu mu okuttuğunu ancak kodu görerek anlar.
*/

const t = warehouseCopy;

interface BatchScanNotice {
  tone: 'warn' | 'error';
  text: string;
}

interface UseBatchScanResult {
  /** Tarama sayfası açık mı — ekran `ScanSheet`i bununla çizer. */
  open: boolean;
  openScan: () => void;
  closeScan: () => void;
  /** Ham kodun çözümü; sonucu ya `picking`e ya `onPick`e ya da bir uyarıya döner. */
  handleScan: (code: string) => void;
  /**
   * Birden çok parti eşleştiğinde seçim listesi; tek eşleşmede HİÇ dolmaz (soru sorulmaz).
   * `null` = seçilecek bir şey yok.
   */
  picking: { code: string; batches: ResolvedBatchContract[] } | null;
  /** Listeden seçim — çağırana verir ve listeyi kapatır (kapama hook'un işi, ekranın değil). */
  pick: (batch: ResolvedBatchContract) => void;
  cancelPicking: () => void;
  notice: BatchScanNotice | null;
}

/**
 * @param onPick seçilen parti — ekran onu rotaya taşır (`/stock-count?stockId=…`). Hook rota
 *   bilmez: aynı çözüm yarın başka bir ekranın konusu olabilir ve hedefi bilen çağırandır.
 */
export function useBatchScan(onPick: (batch: ResolvedBatchContract) => void): UseBatchScanResult {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<{ code: string; batches: ResolvedBatchContract[] } | null>(null);
  const [notice, setNotice] = useNotice<BatchScanNotice>();

  /** Geç dönen eski çözüm yenisini ezmez — iki kod arka arkaya okutulabilir (katalog emsali). */
  const generation = useRef(0);

  const openScan = useCallback(() => {
    setNotice(null);
    setOpen(true);
  }, [setNotice]);

  const closeScan = useCallback(() => setOpen(false), []);
  const cancelPicking = useCallback(() => setPicking(null), []);

  /**
   * Seçimi teslim eder ve listeyi kapatır — kapama BURADA, çağıranda değil: ekran hedefe giderken
   * kendini terk etmiyor (aynı rota, yeni parametreler) ve listeyi kapatmak çağırana bırakılsaydı
   * bir gün unutulur, sayfa açık bir seçim listesinin altında çizilirdi.
   */
  const pick = useCallback(
    (batch: ResolvedBatchContract) => {
      setPicking(null);
      onPick(batch);
    },
    [onPick],
  );

  const handleScan = useCallback(
    (code: string) => {
      setOpen(false);
      setNotice(null);
      void (async () => {
        const run = (generation.current += 1);
        const result = await trackWarehouse(resolveBatchCode(code));
        if (run !== generation.current) return;

        if (result.error !== null) {
          setNotice({ tone: 'error', text: t.adjustment.scan.error });
          return;
        }
        if (result.data.status === 'unknown') {
          setNotice({ tone: 'warn', text: fillCopy(t.adjustment.scan.unknown, { code }) });
          return;
        }

        const { batches } = result.data;
        // Tek eşleşmede soru YOK: seçenek yoksa seçim de yoktur (yazıcı ekranının aynı kararı).
        const only = batches.length === 1 ? batches[0] : undefined;
        if (only !== undefined) {
          pick(only);
          return;
        }
        // Boş `found` kapıdan dönmez (`resolveBatchCode` eşleşme yoksa `unknown` der) ama tip onu
        // bilmiyor; sessizce boş bir seçim listesi açmaktansa bilinmeyen muamelesi yapılır.
        if (batches.length === 0) {
          setNotice({ tone: 'warn', text: fillCopy(t.adjustment.scan.unknown, { code }) });
          return;
        }
        setPicking({ code, batches });
      })();
    },
    [pick, setNotice],
  );

  return { open, openScan, closeScan, handleScan, picking, pick, cancelPicking, notice };
}
