'use server';

import { revalidatePath } from 'next/cache';
import { ProductService, serviceDb } from '@lezzet/database';
import { requireStaff } from '@/lib/guard';

// Ürünler ekranı server action'ları. Şimdilik yalnız aktiflik (satışta) geçişi — mobil hızlı iş ve
// düzenleme sheet'i bunu kullanır (ProductService.setActive). Tam create/update (ad, çok dilli metin,
// varyant, marj) sonraki dilimde kendi action'larıyla eklenecek.

/** Ürünü satışa aç/kapa. Yalnız personel; başarınca listeyi tazeler. */
export async function setProductActiveAction(id: string, isActive: boolean): Promise<void> {
  await requireStaff();
  await new ProductService(serviceDb()).setActive(id, isActive);
  revalidatePath('/operations/products');
}
