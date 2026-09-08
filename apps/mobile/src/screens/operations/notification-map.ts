import { staffNotificationBrief, type StaffNotificationTone } from '@lezzet/i18n';
import type { AppNotificationKind } from '@lezzet/types';

import type { NotificationRow } from '@/lib/api/notifications';
import type { OperationsSection } from '@/lib/operations/sections';

/*
  UÇTAN GELEN SATIR → OPERASYON BİLDİRİMİ (14.13 — fixture'ın yerini alan çeviri katmanı).

  ── BAŞLIK + ALT SATIR + TON `@lezzet/i18n`DEN ──────────────────────────────
  Web operasyon zili aynı personel satırını aynı cümleyle göstermek zorunda; sözlük paylaşılan
  pakette (`staffNotificationBrief`, Türkçe: operasyon yüzeyi tek dil, CLAUDE §2). Burada YÜZEYE
  ÖZGÜ olan kalır: satırın nereye GİTTİĞİ ve bilinmeyen türün genel metni.

  ── BÖLÜM ARTIK BİR KAPI DEĞİL, ETİKET (kullanıcı kararı 05.09) ─────────────
  Eski hâlde bölüm iki iş yapıyordu: satırın rengini söylemek VE satırı gizlemek. İkincisi ölçülen
  bir arızaydı — sunucu alıcıyı *rol × depo* ile seçtikten sonra ekran aynı satırı bir kez daha
  *bölüm* ile süzüyordu ve iki süzgeç aynı fikirde değildi. Somut: `stock_low` rolleri
  `['admin','warehouse']` ama eski eşleme onu `'warehouse'` bölümüne bağlıyordu, yani YALNIZ yönetici
  olan kişiye YAZILAN satır ekranda hiç çizilmiyordu. Ters yönü de vardı: `run_close_pending`
  depocuya yazılıyor ama bölümü `'management'`, depocu göremiyordu.

  Bundan sonra kitleyi YALNIZ SUNUCU belirler. Bölüm rengi/rozeti/çipi verir; hiçbir satırı
  düşürmez (`sections.ts` künyesi).

  ── BÖLÜM = HEDEF EKRANIN BÖLÜMÜ, üreten modülün değil ─────────────────────
  Kural tasarımın kendi verisinden: v3'ün örnek satırında "Azalan stok" bir STOK olayı ama bölümü
  YÖNETİM, çünkü hedefi tedarik ekranı; "Musa K. rotayı kapattı" bir KURYE olayı ama bölümü DEPO,
  çünkü hedefi kurye dönüş kabulü. Web de aynı şeyi söylüyor (`opsNotificationHref`: `stock_low` →
  `/operations/procurement`). Eski mobil eşleme bölümü üreten modüle göre yazmıştı — tasarımla da
  weble de çelişen tek yer orasıydı.

  ── HEDEFİ OLMAYAN SATIR TIKLANMAZ ─────────────────────────────────────────
  Tasarım bunu zaten öngörmüş (`sc-if bn.hedef`). Mobilde operasyon tarafında derin bağ altyapısı
  yok ve İKİ türün (belge · askıda kapanış) açacağı ekran HENÜZ YOK — o satırlar yalnız haber
  verir. "Var olmayan adrese götürmektense hiç götürme" kararının devamı; eskisinden farkı, artık
  HERKESİ bölüm köküne götürmüyor olması (bölüm kökü bir cevap değil, bir savuşturmaydı).
  **Kurumsal başvuru 07.09'da bu üçlüden ÇIKTI** — ekranı doğdu (21.217).
  BEKLEYEN(21.284): belge · askıda kapanış için hedef ekranlar.
*/

/** Ekranın çizdiği şekil — uçtan kurulur, sözlük + hedef eşlemesiyle zenginleşir. */
export interface OperationsNotification {
  id: string;
  title: string;
  /** Açıklayıcı ikinci satır (tasarımın `bn.alt`ı) — sözlükten; olgusu yoksa `null`. */
  sub: string | null;
  /** Kısa TÜR etiketi ("Belge") — bir bakışta ayırt etme (26.08); sözlükten gelir. */
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
 * TÜR → HEDEF. Etiket TÜR başına değil HEDEF başına yazılır: iki transfer türü aynı ekrana gider,
 * aynı cümleyi paylaşır. Şablonla türetilmedi ("{ad}'ı aç") çünkü Türkçe çekim eki sesli/sessiz
 * uyumuna göre değişiyor ("Transfer'i", "Gün Sonu'nu", "Toplama'yı") ve şablon üçünü de bozardı.
 *
 * Bölüm bu tablodan OKUNUR (aşağıdaki `sectionOf`) — ikinci bir bölüm tablosu tutmak, aynı gerçeği
 * iki yerde yazmak olurdu (CLAUDE §1).
 */
const DESTINATION: Partial<Record<AppNotificationKind, (targetId: string | null) => NotificationDestination | null>> = {
  /* Talep kuyruğunun kaydına doğrudan açılan TEK tür — ekran `?id=` alıyor (complaint-screen). */
  ticket_opened: (targetId) => (targetId === null ? null : { href: `/complaint?id=${targetId}`, label: 'Talebi aç', section: 'management' }),
  /* Eşik listesi tedarik önerisinde yaşıyor; varyanta açılan bir ekran yok, kuyruk var. */
  stock_low: () => ({ href: '/supply-suggestion', label: 'Tedarik önerisini aç', section: 'management' }),
  /*
    BAŞVURUNUN KENDİSİNE (21.217) — bildirim hangisini kastettiğini biliyor, araya liste konmuyor.
    Kimliksiz bildirimde satır tıklanmaz (`null`): hedefi olmayan bir "aç" düğmesi, dokunulunca
    hiçbir yere gitmeyen ölü bir düğmedir.
  */
  b2b_application_received: (targetId) =>
    targetId === null ? null : { href: `/b2b-application?id=${targetId}`, label: 'Başvuruyu aç', section: 'management' },
  /* Kapanış farkı gün sonu özetinde okunur (M2) — parametresiz, salt okuma. */
  run_close_mismatch: () => ({ href: '/day-end', label: 'Gün sonunu aç', section: 'money' }),
  /* Transferin iki yüzü de aynı ekranda: "son kapananlar" listesi gönderen satırını da taşıyor.
     BEKLEYEN(21.284): ekran `?transferId=` alıp satırı seçmiyor — bugün liste başına gidiliyor. */
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
  /* `b2b_application_received` 07.09'da BURADAN DÜŞTÜ — hedefi doğdu (21.217). Künyenin kendi
     kuralı: "hedef doğduğu gün bu tablodan düşer; iki tablo aynı anda aynı türü taşımaz." */
};

/** Bilinmeyen türün genel satırı — metin mobile özgü (web her zaman sunucuyla eşzamanlı). */
const FALLBACK = {
  section: 'management' as OperationsSection,
  tone: 'quiet' as StaffNotificationTone,
  title: 'Yeni bir bildirim — ayrıntı için uygulamayı güncelleyin',
  label: 'Bildirim',
};

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
