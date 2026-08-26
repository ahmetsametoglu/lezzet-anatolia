import { Hono } from 'hono';
import { z } from 'zod';
import { readManagementHub } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { ManagementHubSchema } from '@lezzet/types';
import { ok } from '../../lib/respond';
import { requireStaffRole, type StaffEnv } from './auth';

/**
 * **YÖNETİM BÖLÜMÜ UÇLARI** (21.12) — hub'ın karar kutusu + Y5 gün özeti.
 *
 * ── BU DOSYA KURAL HESAPLAMAZ ────────────────────────────────────────────────
 * parse → kapı → zarf. Karar kutusunun sayıları ve günün toplamları `readManagementHub`ta
 * birleşir; eksik toplama önerisi hazırlık motorunun, teklif adayı raf ömrü motorunun,
 * tedarik önerisi eşik servisinin sözüdür — uç yalnız taşır.
 *
 * ── KAPI YALNIZ `admin` ─────────────────────────────────────────────────────
 * Doc 04 rol tablosu: karar kutusu (Y1–Y6) yönetim bölümünündür. Depo süzgeci YOK ve bu bilinçli:
 * yönetim işletmenin tamamına bakar (`OrderListFilters` künyesi — depo-üstü okuma yalnız
 * admin/muhasebe için meşru); depo bazlı motorlar hub okumasının içinde tesis tesis sorulur.
 *
 * ── TEK UÇ, İKİ EKRAN ───────────────────────────────────────────────────────
 * Hub ve gün özeti ekranı aynı zarfı okur: özet ekranı hub'daki başlık şeridinin AÇILMIŞ hâlidir,
 * ayrı bir uç iki ekranın sayılarını iki ayrı ana düşürürdü ("kutu 3 diyor, özet 2" çelişkisi).
 */
export const management = new Hono<StaffEnv>();

management.use('*', requireStaffRole('admin'));

management.get('/hub', async (c) => {
  const hub = await readManagementHub(serviceDb());
  return ok(c, ManagementHubSchema.parse(hub satisfies z.input<typeof ManagementHubSchema>));
});
