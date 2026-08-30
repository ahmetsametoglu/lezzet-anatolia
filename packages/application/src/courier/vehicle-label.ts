import { VehicleService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **Aracın OKUNUR adı** — `vehicle.label` varsa o ("soğutmalı panelvan"), yoksa plakası.
 *
 * ── NEDEN KENDİ DOSYASI ─────────────────────────────────────────────────────
 * İki okuma kapısı da aynı soruyu soruyor: rota SEÇİM listesi (`routes.ts`) *"bu rota bugün hangi
 * araçla"*, günün seferi (`day.ts`) *"ben hangi aracı süreceğim"*. Kural tek: **ad varsa ad, yoksa
 * plaka.** İki yere ayrı yazılsaydı bir gün birinde `label` tercih edilir, ötekinde plaka kalırdı
 * ve aynı araç iki ekranda iki isimle görünürdü (CLAUDE §1).
 *
 * Kolonun kendi künyesi de bunu söylüyor (`0045_storage_area_vehicle.sql:96`):
 * *"label — 'Küçük kamyonet' — ekranda okunan ad"*. Plaka `not null unique`, yani yedek her zaman
 * var; dönüş tipinde `null` yok — kimliği çözülemeyen araç haritaya HİÇ girmez ve çağıran bunu
 * "araçsız" diye okur.
 */
export async function vehicleLabelsOf(
  db: SupabaseClient,
  vehicleIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const vehicles = new VehicleService(db);
  const map = new Map<string, string>();
  for (const id of new Set(vehicleIds.filter((value): value is string => value !== null))) {
    const vehicle = await vehicles.getById(id);
    if (vehicle) map.set(id, vehicle.label ?? vehicle.plate);
  }
  return map;
}

/** Tek araç için kısayol — `null` kimlik ve bulunamayan kayıt aynı cevabı verir: adı yok. */
export async function vehicleLabelOf(db: SupabaseClient, vehicleId: string | null): Promise<string | null> {
  if (!vehicleId) return null;
  return (await vehicleLabelsOf(db, [vehicleId])).get(vehicleId) ?? null;
}
