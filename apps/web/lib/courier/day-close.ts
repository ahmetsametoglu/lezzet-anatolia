import { CourierDayCloseService, CourierDayCollectionService, serviceDb } from '@lezzet/database';
import type { CourierDayClose, CourierDayCloseResult } from '@lezzet/types';
import { listCourierDay, type CourierStop } from './day';

/**
 * Kurye gün kapanışı (11.6) — **uygulama katmanı orkestrasyonu**.
 * `design/pages/kurye-kapanis.md` + DOMAIN §7.
 *
 * Kapanış bir **mutabakattır**, para hareketi değil: para kapıda tahsil edilirken yazıldı (11.3).
 * Burada yapılan tek şey beklenen ile sayılanı yan yana koymak ve farkı **aynı gün** görünür kılmak.
 *
 * **Kurye yalnız kendi gününü görür** — `courierId` her iki fonksiyonda da zorunludur; işletme
 * kasası, diğer hesaplar ve marj bu okumaya hiç girmez (tasarım §6).
 */

/** Kapanış öncesi ekranın gördüğü: günün resmi + beklenen tahsilat. */
export interface DayCloseDraft {
  date: string;
  /** Zaten kapatılmışsa kayıt döner ve ekran SALT-OKUNUR gösterir (tasarım §6). */
  closed: CourierDayClose | null;
  delivered: CourierStop[];
  /** Ulaşılamayanlar — yarının işine devrolur, kapanışta kaybolmaz. */
  pending: CourierStop[];
  /** Reddedilenler — getirilen mal; depoya fiziksel teslim edilir. */
  returned: CourierStop[];
  expected: { cash: number; card: number; cheque: number };
}

/**
 * Kapanış taslağı. Beklenen toplamlar **görünümden** okunur (`courier_day_collection`) — kapanış
 * RPC'si de aynı görünümü okur, toplama iki kez yazılmaz.
 *
 * Hiç kapıda ödeme yoksa görünümde satır doğmaz; o gün tahsilatsızdır ve sıfır gösterilir — "veri
 * yok" ile "para yok" ekranda aynı şeydir.
 */
export async function openDayClose(input: { courierId: string; date?: string }): Promise<DayCloseDraft> {
  const db = serviceDb();
  const date = input.date ?? new Date().toISOString().slice(0, 10);

  const [stops, collection, closed] = await Promise.all([
    listCourierDay({ courierId: input.courierId, date }),
    new CourierDayCollectionService(db).getByDay(input.courierId, date),
    new CourierDayCloseService(db).getByDay(input.courierId, date),
  ]);

  return {
    date,
    closed,
    delivered: stops.filter((stop) => stop.outcome === 'delivered'),
    pending: stops.filter((stop) => stop.outcome === 'pending' || stop.outcome === 'unreachable'),
    returned: stops.filter((stop) => stop.outcome === 'refused'),
    expected: {
      cash: collection?.expectedCash ?? 0,
      card: collection?.expectedCard ?? 0,
      cheque: collection?.expectedCheque ?? 0,
    },
  };
}

/**
 * **Günü kapat.** Sonuçlanmamış durak varken de kapatılabilir (tasarım §4): kurye depoya dönmüşse
 * günü kapatabilmelidir, ulaşılamayan sipariş yarına kalır. Dönen `pendingCount` çağıranın uyarı
 * göstermesi içindir — engel değil.
 *
 * Fark hesaplanmaz, **türer**: sayılan − beklenen. İşaret anlamlıdır (eksi eksik, artı fazla) ve
 * mutlak değere indirilmez — ikisi de açıklanmayı hak eder.
 */
export function closeCourierDay(input: {
  courierId: string;
  date: string;
  countedCash?: number;
  countedCard?: number;
  countedCheque?: number;
  /** Fark çıktığında kısa açıklama — fark gizlenmez, açıklanır (tasarım §3). */
  note?: string | null;
}): Promise<CourierDayCloseResult> {
  return new CourierDayCloseService(serviceDb()).close({ ...input, actorId: input.courierId });
}
