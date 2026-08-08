import type { OperationsSection } from '@/lib/operations/sections';

/*
  BİLDİRİM LİSTESİ — FIXTURE (v2:1069 `bilAll` birebir). Gerçek akış push altyapısıyla gelir
  (21.13); o gün bu dosya silinir ve yerine uçtan gelen liste geçer. Süzme kuralı ise fixture'a
  BAĞLI DEĞİL: saf fonksiyon (`lib/operations/sections.ts`) ve kendi birim testi var, yani veri
  kaynağı değişince kural yerinde kalır.

  Katalog emsalindeki `catalog-fixture.ts` ile aynı rol: ekranın tüm hâllerini (dolu · boş · rol
  süzülmüş) gerçek uç olmadan çizilebilir kılmak.
*/

/**
 * Satır başındaki noktanın rengi. Tasarım bunu BÖLÜMDEN DEĞİL, satırın kendisinden veriyor —
 * ölçüldü (v2:1070-1075): iki "Yönetim" satırı iki farklı nokta taşıyor (karar bekleyen
 * terracotta, yeni şikâyet kırmızı) ve azalan stok tespiti gri. Yani nokta bölümün kimliğini
 * değil işin ACİLİYETİNİ söylüyor; bölümü zaten satırın alt metni yazıyor.
 *
 * Değerler token ADIdır, renk değil: ekran onları temadan çözer, fixture'a hex girmez (CLAUDE §3).
 */
export type NotificationDot = 'courier' | 'warehouse' | 'attention' | 'alert' | 'quiet';

export interface OperationsNotification {
  id: string;
  /** Satır başlığı (v2 `t`). */
  title: string;
  /** Hangi bölümün işi — rol süzmesi bunun üstünden çalışır. */
  section: OperationsSection;
  dot: NotificationDot;
  /** Göreli zaman (v2 `dk`): "2 dk", "1 sa". Gerçek damga 21.13'le gelir. */
  ago: string;
}

/** v2'nin altı satırı, sırası dahil (en yeni üstte değil — tasarımın sırası bölüm karışımıdır). */
export const NOTIFICATION_FIXTURE: OperationsNotification[] = [
  { id: 'n1', title: 'Yeni sipariş onaylandı — toplama bekliyor', section: 'warehouse', dot: 'warehouse', ago: '2 dk' },
  { id: 'n2', title: 'Rota güncellendi — 1 durak eklendi', section: 'courier', dot: 'courier', ago: '9 dk' },
  { id: 'n3', title: 'Eksik toplama — karar bekliyor', section: 'management', dot: 'attention', ago: '14 dk' },
  { id: 'n4', title: 'Yeni şikâyet — Bozuk', section: 'management', dot: 'alert', ago: '12 dk' },
  { id: 'n5', title: 'Uyuşmazlık göründü — gün sonu', section: 'money', dot: 'alert', ago: '25 dk' },
  { id: 'n6', title: 'Azalan stok tespiti — tetik yakında', section: 'management', dot: 'quiet', ago: '1 sa' },
];
