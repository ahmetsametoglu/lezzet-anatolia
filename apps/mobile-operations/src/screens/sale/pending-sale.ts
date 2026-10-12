import { z } from 'zod';
import { CatalogImageSchema, SalePlaceEnum, type SalePlace } from '@lezzet/types';

import { DEVICE_STORE_KEYS, deviceStore } from '@lezzet/mobile-kit/src/lib/storage/device-store';

/*
  Cevabı gelmemiş satış cihazda durur: uygulama kapanır ya da ekrandan çıkılırsa aynı satış aynı kimlikle yeniden gönderilir ve sunucu
  onu ikinci kez yazmaz. Kayıt yalnız aynı hesapta, aynı yerde ve aynı gün geri yüklenir; başka zamanda gönderilseydi sunucuya hiç
  ulaşmamış satış yanlış güne ya da yanlış depoya yazılırdı.
*/

const PendingSaleLineSchema = z.object({
  variantId: z.string().min(1),
  name: z.string(),
  qty: z.number().int().positive(),
  listPriceCents: z.number().int(),
  negotiatedCents: z.number().int().nullable(),
  availableHere: z.number().int(),
  image: CatalogImageSchema,
});

const PendingSaleSchema = z.object({
  key: z.string().min(1),
  /** Satışı gönderen hesap (oturumun e-postası); paylaşılan telefonda başkasının satışı geri yüklenmez. */
  account: z.string().nullable(),
  place: SalePlaceEnum,
  /** Tesis satışında cihazın seçili deposu; araçta depoyu sunucu seferden çözer, `null`dır. */
  warehouseId: z.string().nullable(),
  createdAt: z.string(),
  payment: z.enum(['cash', 'card']),
  lines: z.array(PendingSaleLineSchema).min(1),
});
export type PendingSale = z.infer<typeof PendingSaleSchema>;

/** Okunamayan ya da bozuk kayıt "bekleyen satış yok" demektir; satış ekranı açılmalı, bozuk kayıt silinir. */
export async function readPendingSale(): Promise<PendingSale | null> {
  let raw: string | null;
  try {
    raw = await deviceStore.getItem(DEVICE_STORE_KEYS.pendingSale);
  } catch {
    // Depo okunamıyorsa kayıt da yoktur; satış ekranını kilitlemek okunamayan bir kayıt için kuryeyi durdurmak olurdu.
    return null;
  }
  if (raw === null) return null;
  const parsed = PendingSaleSchema.safeParse(jsonOf(raw));
  if (parsed.success) return parsed.data;
  await clearPendingSale();
  return null;
}

/** Kayıt yazılamazsa satış yine gönderilir: kayıt bir emniyet ağıdır, satışın şartı değil. */
export async function savePendingSale(sale: PendingSale): Promise<void> {
  try {
    await deviceStore.setItem(DEVICE_STORE_KEYS.pendingSale, JSON.stringify(sale));
  } catch {
    // Yazılamayan kayıtta kilit yalnız bu oturumda sürer; uygulama kapanırsa sepet geri gelmez.
  }
}

export async function clearPendingSale(): Promise<void> {
  try {
    await deviceStore.removeItem(DEVICE_STORE_KEYS.pendingSale);
  } catch {
    // Silinemeyen kayıt bir sonraki açılışta okunur ve sunucu aynı kimliği ikinci kez yazmadığı için zararsızdır.
  }
}

/** Gün cihazın yerel takvimidir (`stamp.ts`teki kural): personelin "bugün" dediği gün cihazının günüdür. */
export function isRestorable(
  sale: PendingSale,
  at: { account: string | null; place: SalePlace; warehouseId: string | null; now: Date },
): boolean {
  return (
    sale.account === at.account &&
    sale.place === at.place &&
    sale.warehouseId === at.warehouseId &&
    new Date(sale.createdAt).toDateString() === at.now.toDateString()
  );
}

function jsonOf(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Bozuk metin şema doğrulamasından düşer ve kayıt silinir.
    return null;
  }
}
