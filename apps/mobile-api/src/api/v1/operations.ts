import { Hono } from 'hono';
import type { z } from 'zod';
import { serviceDb, WarehouseService } from '@lezzet/database';
import { StaffScopeSchema } from '@lezzet/types';
import { ok } from '../../lib/respond';
import { requireStaffRole, type StaffEnv } from './auth';
import { soleWarehouseIdOf } from './warehouse';

/**
 * **OPERASYON KABUĞUNUN UÇLARI** (30.08) — bölümlerin değil, KABUĞUN kendi künyesi.
 *
 * Dört bölüm yönlendiricisinin (`warehouse` · `sale` · `money` · `management`) hepsinin bir rol
 * kapısı var ve hiçbiri ötekini kabul etmiyor: depocu para özetini göremez, muhasebeci hazırlık
 * kuyruğunu açamaz. Kabuğun kendi sorusu ise bölüm-üstüdür ("nerede çalışıyorum") ve bir bölümün
 * içine konsaydı yalnız o bölümü açabilen personel cevabı alırdı — üstbaşlık kuyruğu Para
 * ekranında doğar, Depo ekranında doğmazdı.
 *
 * ── KAPI: OPERASYON BÖLÜMÜ DOĞURAN HER ROL ──────────────────────────────────
 * Liste `apps/mobile`ın rol→bölüm eşlemesiyle (`lib/operations/sections.ts`) aynı kümedir:
 * `customer` ve `system` bölüm doğurmaz, kalan dördü doğurur. Kapı `admin`i de sayar (her bölüme
 * girer — kabuk kuralı) ve müşteriye 403 döner: kabuğun künyesi personelin künyesidir.
 */
export const operations = new Hono<StaffEnv>();

operations.use('*', requireStaffRole('warehouse', 'courier', 'accounting', 'admin'));

/**
 * **Personelin depo kapsamı** — üstbaşlık kuyruğunun ve kapsam seçicisinin tek kaynağı.
 *
 * Kararlar ve `null`ın anlamı sözleşme künyesinde (`operations-api.schema.ts`). Bu dosyanın işi
 * taşımak: çözüm kuralı depo kapısında yaşıyor (`soleWarehouseIdOf`, `warehouse.ts`) ve buradan
 * ÇAĞRILIYOR, yeniden yazılmıyor.
 *
 * ── İKİ KÜME, TEK SORGU ─────────────────────────────────────────────────────
 * Kapsamı olan personel için seçilebilir küme KAPSAMIN KENDİSİDİR — aktiflik süzgeci YOK ve bu
 * bilinçli: atama bir gerçektir, pasife alınmış bir tesise atanmış personelin ekranından tesisin
 * adının kaybolması "sen hiçbir yerde çalışmıyorsun" derdi. Kapsamı BOŞ olan **admin** için küme
 * aktif tesislerin tamamıdır (guard'ın admin dalının aynası); orada aktiflik süzgeci VAR, çünkü
 * kapatılmış bir tesis bir seçenek değildir.
 *
 * **Kapsamı boş ve admin OLMAYAN personel boş liste alır** ve bu, listeyi guard'la aynı hizada
 * tutmanın tek yolu: kapı kapsam dışı bir kimliği yalnız admine açıyor (`403
 * warehouse_out_of_scope`), yani başkasına gösterilen her seçenek reddedilecek bir seçenek
 * olurdu — seçilebilir görünen ama seçilemeyen bir liste, arızanın kendisidir.
 *
 * Süzgeç `warehouseIds` ile veriliyor, hepsini çekip sonra elemekle değil: kapsam dışı bir depo
 * hiçbir seçicide seçenek olarak var OLMAMALI (`WarehouseService.list` künyesi).
 */
operations.get('/scope', async (c) => {
  const profile = c.get('staff');
  const service = new WarehouseService(serviceDb());
  const warehouses =
    profile.warehouseIds.length > 0
      ? await service.list({ warehouseIds: profile.warehouseIds })
      : profile.roles.includes('admin')
        ? await service.list({ activeOnly: true })
        : [];

  const body: z.input<typeof StaffScopeSchema> = {
    warehouses,
    resolvedId: soleWarehouseIdOf(profile.warehouseIds),
  };
  return ok(c, StaffScopeSchema.parse(body));
});
