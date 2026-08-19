import type { KeysetCursor, TransferStatus } from '@lezzet/types';
import type { WarehouseContext } from '@/lib/warehouse/context';

/**
 * Transfer ekranının tip sözleşmesi (19.6) — YALNIZ görünüm tipleri. Sevk penceresinin varyant
 * kartı (`DispatchCandidate`) ve üç fiilin sonuçları `@lezzet/application`dan gelir: aynı kapıyı
 * yarın mobil de kullanacak, burada kopyası yaşamaz (K5-1 dersi).
 */

/** Yoldakiler sekmesinin satırı — sevk edilmiş, henüz kabul edilmemiş sevkiyat. */
export interface TransitRowView {
  id: string;
  referenceNo: string;
  fromCode: string;
  toCode: string;
  dispatchedAt: string;
  /** Sevk edenin adı — kimlik değil (log'a kimlik, ekrana ad). Profil silinmişse null. */
  dispatchedByName: string | null;
  lineCount: number;
  totalQty: number;
  /** Yolda geçen tam gün (bugün − sevk anı). */
  ageDays: number;
  /**
   * Ulaşım süresine göre ton: `ok` süre içinde · `warn` bir gün taştı · `late` belirgin aştı.
   * Eşik parametrik (`transfer_transit_days`); hesap okuma katmanında — ekran eşik BİLMEZ.
   */
  ageTone: 'ok' | 'warn' | 'late';
  /**
   * Kabul düğmesi yalnız HEDEF deposu kapsamında olana çizilir: kabulü malı sayan yapar ve o,
   * hedefin personelidir. Depo-üstü bakış (yönetici) her hedefi kabul edebilir.
   */
  canReceive: boolean;
}

/** Geçmiş sekmesinin satırı — kapanmış (kabul edilmiş ya da geri alınmış) kayıt. */
export interface HistoryRowView {
  id: string;
  referenceNo: string;
  fromCode: string;
  toCode: string;
  dispatchedAt: string;
  lineCount: number;
  sentQty: number;
  /** Kabulde sayılan toplam — `cancelled`da anlamsız, null. */
  receivedQty: number | null;
  outcome: 'full' | 'partial' | 'zero' | 'cancelled';
}

export interface HistoryPageView {
  rows: HistoryRowView[];
  /** Keyset imleci — servisin ürettiği hâliyle taşınır; URL'e YAZILMAZ (CLAUDE §1, runs emsali). */
  nextCursor: KeysetCursor | null;
}

/** Sayfanın açılış verisi — iki sekmenin ilk yükü + bağlam. */
export interface TransfersPageView {
  /** Sevk kaynağı ve kabul yetkisi bu bağlamdan türer; seçici üst barda zaten var. */
  context: Pick<WarehouseContext, 'scope' | 'activeWarehouseId'>;
  /** Sevk penceresinin kaynak/hedef seçenekleri: AKTİF depolar, operatör sırasıyla. */
  warehouses: Array<{ id: string; code: string; name: string }>;
  transit: TransitRowView[];
  /** Ulaşım süresini belirgin aşan sevkiyat sayısı — üst şeridin amber rozeti. */
  lateCount: number;
  history: HistoryPageView;
  transitDays: number;
}

/** İçerik penceresinin satırı — sevk edilen kalem; kapanmış kayıtta `receivedQty` da dolu. */
export interface TransferDetailLineView {
  lineId: string;
  name: string;
  lotNumber: string | null;
  expiryDate: string;
  sentQty: number;
  /** Kabulde sayılan adet — `null` = henüz sayılmadı (yolda) ya da kayıt geri alındı. */
  receivedQty: number | null;
}

/**
 * İçerik penceresi TEK ve iki yüzü var (19.08 kabul eleştirisi): `canReceive` ise kabul FORMU
 * (gelen sayılır, boş satır kilitler), değilse SALT-OKUNUR içerik — kapsam dışındaki personel ve
 * kapanmış kayıt "hangi ürün, kaç adet, eksik mi geldi" sorusunu buradan okur.
 */
export interface TransferDetailView {
  transferId: string;
  referenceNo: string;
  fromCode: string;
  toCode: string;
  status: TransferStatus;
  dispatchedAt: string;
  ageDays: number;
  /** Kabul formu yalnız buna çizilir: kayıt yolda VE hedef, bakanın kapsamında. */
  canReceive: boolean;
  /** Kapanmış kaydın sonucu (geçmiş rozetiyle aynı dil); yolda ise `null`. Hesap okuma katmanında. */
  outcome: HistoryRowView['outcome'] | null;
  lines: TransferDetailLineView[];
}
