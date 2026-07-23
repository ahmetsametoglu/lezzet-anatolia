import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify, uniqueSlug } from '@lezzet/helper';

/**
 * Tablo genelinde benzersiz slug üretir: addan taban slug çıkar, aynı tabanla çakışan mevcut
 * slug'ları prefix sorgusuyla çekip `-2`/`-3`… ekiyle boş olanı bulur. Katalog servisleri
 * (kategori/koleksiyon/ürün/paket) paylaşır. Tablo `slug` text sütunu taşımalı.
 */
export async function uniqueSlugForTable(supabase: SupabaseClient, table: string, source: string): Promise<string> {
  const base = slugify(source) || 'x';
  const { data, error } = await supabase.from(table).select('slug').like('slug', `${base}%`);
  if (error) throw error;
  const taken = new Set((data ?? []).map((row: { slug: string }) => row.slug));
  return uniqueSlug(source, (candidate) => taken.has(candidate));
}
