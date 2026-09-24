import { staffNotificationBrief, type StaffNotificationTone } from '@lezzet/i18n';
import type { AppNotificationKind } from '@lezzet/types';

import type { NotificationRow } from '@lezzet/mobile-kit/src/lib/api/notifications';
import type { OperationsSection } from '@/lib/operations/sections';

/*
  Uçtan gelen satır → operasyon bildirimi: başlık, alt satır ve ton web ile paylaşılan sözlükten (`staffNotificationBrief`) gelir, burada
  yüzeye özgü olan satırın gittiği yer ve bilinmeyen türün genel metnidir. Kitleyi yalnız sunucu belirler; bölüm hedef ekranın bölümüdür,
  rengi verir ve satır gizlemez, hedefi olmayan satır tıklanmaz.
  BEKLEYEN(21.284): belge · askıda kapanış için hedef ekranlar.
*/

/** Ekranın çizdiği şekil — uçtan kurulur, sözlük + hedef eşlemesiyle zenginleşir. */
export interface OperationsNotification {
  id: string;
  title: string;
  /** Açıklayıcı ikinci satır (tasarımın `bn.alt`ı) — sözlükten; olgusu yoksa `null`. */
  sub: string | null;
  /** Kısa tür etiketi ("Belge"), bir bakışta ayırt etmek için; sözlükten gelir. */
  label: string;
  /** Satırın RENGİNİ ve rozetini veren bölüm — hedef ekranın bölümü. Satırı GİZLEMEZ. */
  section: OperationsSection;
  /** Aciliyet — sözleşmenin üç değeri; kart zeminini/kenarını/başlık rengini bu belirler. */
  tone: StaffNotificationTone;
  /** Ham damga: satırın saati ve gün grubu bundan türer (ekran cihaz saatiyle biçimler). */
  createdAt: string;
  /** `null` = okunmamış → tasarımın 8 px noktası. */
  readAt: string | null;
  /** Hedef — yoksa satır tıklanmaz ve hedef satırı çizilmez. */
  destination: NotificationDestination | null;
}

/** Satıra dokununca gidilecek yer + tasarımın "… aç →" etiketi. */
export interface NotificationDestination {
  href: string;
  /** Tasarımın hedef satırı — EKRANIN adını söyler, olayı değil ("Transferi aç"). */
  label: string;
  /** Hedefin bölümü; kullanıcı o bölümü açamıyorsa satır tıklanmaz. */
  section: OperationsSection;
}

/**
 * Tür → hedef tablosu: etiket hedef başına yazılır (iki transfer türü aynı ekrana gider) ve şablonla türetilmez, çünkü Türkçe ek ses
 * uyumuna göre değişir ("Transfer'i", "Toplama'yı"); bölüm de bu tablodan okunur ki aynı gerçek iki tabloda yazılmasın.
 */
const DESTINATION: Partial<Record<AppNotificationKind, (targetId: string | null) => NotificationDestination | null>> = {
  /* Talep kuyruğunun kaydına doğrudan açılan TEK tür — ekran `?id=` alıyor (complaint-screen). */
  ticket_opened: (targetId) => (targetId === null ? null : { href: `/complaint?id=${targetId}`, label: 'Talebi aç', section: 'management' }),
  /* Eşik listesi tedarik önerisinde yaşıyor; varyanta açılan bir ekran yok, kuyruk var. */
  stock_low: () => ({ href: '/supply-suggestion', label: 'Tedarik önerisini aç', section: 'management' }),
  /* Bildirim başvurunun kendisine açılır; kimliksiz satır tıklanmaz, çünkü hedefsiz bir "aç" düğmesi ölü düğmedir. */
  b2b_application_received: (targetId) =>
    targetId === null ? null : { href: `/b2b-application?id=${targetId}`, label: 'Başvuruyu aç', section: 'management' },
  /* Kapanış farkı gün sonu özetinde okunur (M2) — parametresiz, salt okuma. */
  run_close_mismatch: () => ({ href: '/day-end', label: 'Gün sonunu aç', section: 'money' }),
  /* Transferin iki yüzü de aynı ekranda: "son kapananlar" listesi gönderen satırını da taşıyor.
     BEKLEYEN(21.284): ekran `?transferId=` alıp satırı seçmiyor, liste başına gidilir. */
  transfer_shortfall: () => ({ href: '/inbound', label: 'Transferi aç', section: 'warehouse' }),
  transfer_excess: () => ({ href: '/inbound', label: 'Transferi aç', section: 'warehouse' }),
};

/**
 * Hedefi OLMAYAN türün bölümü — işin yapılacağı yer. Hedef doğduğu gün bu tablodan düşer ve
 * bölüm `DESTINATION`dan okunmaya başlar; iki tablo aynı anda aynı türü taşımaz.
 */
const SECTION_WITHOUT_DESTINATION: Partial<Record<AppNotificationKind, OperationsSection>> = {
  document_undeliverable: 'management',
  run_close_pending: 'management',
};

/** Bilinmeyen türün genel satırı — metin mobile özgü (web her zaman sunucuyla eşzamanlı). */
const FALLBACK = {
  section: 'management' as OperationsSection,
  tone: 'quiet' as StaffNotificationTone,
  title: 'Yeni bir bildirim — ayrıntı için uygulamayı güncelleyin',
  label: 'Bildirim',
};

/**
 * Push dokunuşunun adresi uygulama içi listeyle aynı hedef tablosundan (`DESTINATION`) gelir, yoksa bildirimden açılan ekran listeden
 * açılandan başka olurdu. Hedefi olmayan tür `null` döner ve dokunuş uygulamayı yalnız öne getirir.
 */
export function operationsNotificationHref(target: Pick<NotificationRow, 'kind' | 'targetId'>): string | null {
  return DESTINATION[target.kind as AppNotificationKind]?.(target.targetId)?.href ?? null;
}

export function toOperationsNotification(row: NotificationRow): OperationsNotification {
  const brief = staffNotificationBrief(row);
  const kind = row.kind as AppNotificationKind;
  const destination = DESTINATION[kind]?.(row.targetId) ?? null;
  return {
    id: row.id,
    title: brief?.title ?? FALLBACK.title,
    sub: brief?.subtitle ?? null,
    label: brief?.label ?? FALLBACK.label,
    section: destination?.section ?? SECTION_WITHOUT_DESTINATION[kind] ?? FALLBACK.section,
    tone: brief?.tone ?? FALLBACK.tone,
    createdAt: row.createdAt,
    readAt: row.readAt,
    destination,
  };
}
