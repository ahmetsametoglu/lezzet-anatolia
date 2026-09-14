'use client';

import { useRouter } from 'next/navigation';
import { useBell } from './use-bell.hook';

/**
 * Operasyon ekranının CANLI BAĞI (16.8). Çizdiği bir şey yok — tek işi **zili duyunca sayfayı
 * sunucudan yeniden istemek**.
 *
 * ── NEDEN GEREKLİ ───────────────────────────────────────────────────────────
 * Talep yazısı üç ayrı süreçten geliyor ve üçü de operatörün tarayıcısından bağımsız: müşteri
 * mobil uygulamadan yazıyor (`apps/mobile-api`), müşteri web `/support`tan yazıyor, AI cron'u
 * taslak/cevap yazıyor (`apps/backend`). Operatör ekranı açık tutuyor ve hiçbiri görünmüyordu —
 * ancak F5'e basınca beliriyordu.
 *
 * ── NEDEN `router.refresh()` ────────────────────────────────────────────────
 * Sunucu bileşenini yeniden çalıştırır, yani kuyruk VE seçili yazışma (adresteki `?t=`) aynı turda
 * tazelenir; istemci hiçbir veriyi kendi kurmaz. Zil zaten boş: ne olduğunu söyleyen tek kaynak
 * sunucu render'ıdır (`@lezzet/application/realtime/bell` künyesi).
 *
 * ── SEKME GÖRÜNMEZKEN YENİLEME YOK ──────────────────────────────────────────
 * Arka plandaki sekme de zili duyar; her mesajda bir sunucu turu atması boşuna yüktür ve operatör
 * o an bakmıyor. Kaçırılan zil kaybolmuyor: sekmeye dönüldüğünde bir kez yeniliyor — yani gecikme
 * var, kayıp yok. Kural ortak kancada (`useBell`, 15.32): bildirim zili ve mesaj penceresi de onu kullanıyor.
 */
interface LiveRefreshProps {
  channel: string;
}

export function LiveRefresh({ channel }: LiveRefreshProps) {
  const router = useRouter();
  useBell(channel, () => router.refresh());
  return null;
}
