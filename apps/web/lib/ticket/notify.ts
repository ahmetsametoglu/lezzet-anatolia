import 'server-only';
import {
  notifyTicketReceived as notifyReceived,
  notifyTicketReplied as notifyReplied,
  notifyTicketStatusChanged as notifyStatusChanged,
} from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { NotifyResult } from '@lezzet/notify';
import type { Ticket, TicketStatus } from '@lezzet/types';

/**
 * KÖPRÜ (16.08) — gövde `@lezzet/application/ticket/notify`ye terfi etti (`order/notify` ile aynı
 * yol, 21.21). Sebep: özerk AI ajanı (16.5) cevabı backend cron'unda yazıyor ve o cevap da
 * müşteriye personel cevabıyla AYNI maili doğurmalı; kurucu iki uygulamada iki kopya olamazdı.
 *
 * Web çağıranları `db` geçmez — bu yüzeyin veritabanı daima `serviceDb()`; imzayı burada bağlamak,
 * on çağrı yerine `serviceDb()` yazdırmaktan hem kısa hem tekti.
 */

export function notifyTicketReceived(ticket: Ticket, openedBy: 'customer' | 'staff'): Promise<NotifyResult[]> {
  return notifyReceived(serviceDb(), ticket, openedBy);
}

export function notifyTicketReplied(ticket: Ticket): Promise<NotifyResult[]> {
  return notifyReplied(serviceDb(), ticket);
}

export function notifyTicketStatusChanged(ticket: Ticket, from: TicketStatus, by: 'customer' | 'staff'): Promise<NotifyResult[]> {
  return notifyStatusChanged(serviceDb(), ticket, from, by);
}
