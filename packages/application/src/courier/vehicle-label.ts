import { VehicleService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **Aracın OKUNUR adı** — `"FR-482-BX · Frigo kamyonet"`; adı yoksa yalnız plaka.
 *
 * ── PLAKA DA YAZILIR (v3:16/17 · kullanıcı bulgusu 31.08) ───────────────────
 * Kural önce *"ad varsa ad, yoksa plaka"* idi ve gerekçesi doğruydu ama YARIMDI: kurye rampada
 * aracı `vehicleId`nin uuid'sinden bulamaz — **ama "Frigo kamyonet"ten de bulamaz.** Depoda üç
 * frigo kamyonet varsa hangisi? Aracın sahadaki tek tekil işareti PLAKASIDIR ve tasarım ikisini
 * de yazıyor: 16 numaranın başlığı `{{ aracPlaka }}`, 17 numaranın araç kartı
 * `"FR-482-BX · Frigo kamyonet"`. Ad plakanın yerine değil YANINA geçer; ad "hangi tür araç",
 * plaka "hangi araç" sorusunun cevabı ve ikisi ayrı sorular.
 *
 * Plaka `not null unique` (`0045_storage_area_vehicle.sql`), yani dizge hiçbir hâlde boş kalmaz.
 *
 * ── NEDEN KENDİ DOSYASI ─────────────────────────────────────────────────────
 * İki okuma kapısı da aynı soruyu soruyor: rota SEÇİM listesi (`routes.ts`) *"bu rota bugün hangi
 * araçla"*, günün seferi (`day.ts`) *"ben hangi aracı süreceğim"*. Kural tek: **ad varsa ad, yoksa
 * plaka.** İki yere ayrı yazılsaydı bir gün birinde `label` tercih edilir, ötekinde plaka kalırdı
 * ve aynı araç iki ekranda iki isimle görünürdü (CLAUDE §1).
 *
 * Kolonun kendi künyesi de bunu söylüyor (`0045_storage_area_vehicle.sql:96`):
 * *"label — 'Küçük kamyonet' — ekranda okunan ad"*. Dönüş tipinde `null` yok — kimliği
 * çözülemeyen araç haritaya HİÇ girmez ve çağıran bunu "araçsız" diye okur.
 */
export async function vehicleLabelsOf(
  db: SupabaseClient,
  vehicleIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const vehicles = new VehicleService(db);
  const map = new Map<string, string>();
  for (const id of new Set(vehicleIds.filter((value): value is string => value !== null))) {
    const vehicle = await vehicles.getById(id);
    if (vehicle) map.set(id, vehicle.label === null ? vehicle.plate : `${vehicle.plate} · ${vehicle.label}`);
  }
  return map;
}

/** Tek araç için kısayol — `null` kimlik ve bulunamayan kayıt aynı cevabı verir: adı yok. */
export async function vehicleLabelOf(db: SupabaseClient, vehicleId: string | null): Promise<string | null> {
  if (!vehicleId) return null;
  return (await vehicleLabelsOf(db, [vehicleId])).get(vehicleId) ?? null;
}
