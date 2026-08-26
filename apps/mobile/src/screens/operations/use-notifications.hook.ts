import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { fetchNotifications, markAllNotificationsRead } from '@/lib/api/notifications';
import { visibleNotifications } from '@/lib/operations/sections';
import { toOperationsNotification, type OperationsNotification } from './notification-map';
import { useOperationsSections } from './sections-context';

/*
  BİLDİRİM AKIŞI — kabuğun TEK bildirim kaynağı. Fixture dönemi KAPANDI (21.13'ün beklediği uç
  14.13'te geldi): satırlar `/me/notifications`tan — personel de aynı uçtan okur, çünkü fan-out
  satırı zaten KİŞİYE yazılıyor (0049) ve `resolveCustomer` personel profilini de çözer. İki uç
  ailesi açmak, aynı satırın iki adresi olurdu.

  İki tüketicisi var ve ikisi de AYNI listeyi görmek zorunda: bildirim ekranının satırları ve
  bölüm köklerindeki zil sayacı. Süzmeyi iki yerde ayrı ayrı yapmak, rozetin "3" deyip listenin
  iki satır göstermesine giden en kısa yoldu — kural yerinde (`visibleNotifications`, saf ve
  testli), yalnız veri kaynağı değişti (fixture künyesinin verdiği sözün kendisi).

  ── ROZET = SÜZÜLMÜŞ OKUNMAMIŞ ──────────────────────────────────────────────
  Sayı rol süzmesinden SONRAKİ okunmamışlardır (zil künyesi: "kullanıcı açamayacağı bir işin
  sayısını taşımaz") — ve artık OKUNMUŞLUK gerçek: ekran açılınca akış okundu sayılır (aşağıda).

  ── TAZELEME ODAKTA — kanal YOK ve bu bilinçli ──────────────────────────────
  Personel kanalının adı sunucu sırından türetilir (`staffNotificationsChannelName`) ve mobil o
  sırrı taşıyamaz; guard'lı bir uçtan ad taşımak 14.15'in web zilinin işi. Hub'a/ekrana her
  dönüşte tazelenen sayı, operasyon ritmi için yeterli — kuyruğun kendisi zaten ekranların içinde.

  SAYFALAMA YOK (ekran künyesindeki karar): akış son işlerin kısa bir seçkisidir; ilk sayfa yeter.
*/

interface UseOperationsNotificationsResult {
  rows: OperationsNotification[];
  /** Rol süzmesinden sonraki OKUNMAMIŞ sayısı — zilin rozeti. */
  unread: number;
  /** Ekran açılışının "gördüm" beyanı: akışı okundu sayar, rozet söner; satırlar listede kalır. */
  markAllSeen: () => void;
}

export function useOperationsNotifications(): UseOperationsNotificationsResult {
  const sections = useOperationsSections();
  const [raw, setRaw] = useState<{ id: string; readAt: string | null; mapped: OperationsNotification }[]>([]);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      void fetchNotifications()
        .catch(() => null) // env'siz ortamda istemci kurulamadan fırlar — liste son hâlinde kalır
        .then((result) => {
          // Hata/misafirde eldeki liste korunur: rozeti sıfıra düşürmek, bozuk ölçümü sağlıklı
          // gibi okutur (CLAUDE §1) — kabuk zaten oturumsuz açılmaz.
          if (result === null || result.error !== null) return;
          setRaw(result.data.notifications.map((row) => ({ id: row.id, readAt: row.readAt, mapped: toOperationsNotification(row, now) })));
        });
    }, []),
  );

  const markAllSeen = useCallback(() => {
    if (!raw.some((row) => row.readAt === null)) return;
    const simdi = new Date().toISOString();
    setRaw((current) => current.map((row) => (row.readAt === null ? { ...row, readAt: simdi } : row)));
    // İyimser; düşerse bir sonraki odak tazelemesi gerçeği geri getirir (rozet yeniden yanar).
    void markAllNotificationsRead().catch(() => undefined);
  }, [raw]);

  return useMemo(() => {
    const visible = visibleNotifications(
      raw.map((row) => ({ ...row.mapped, readAt: row.readAt })),
      sections,
    );
    return {
      rows: visible,
      unread: visible.filter((row) => row.readAt === null).length,
      markAllSeen,
    };
  }, [raw, sections, markAllSeen]);
}
