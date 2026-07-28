import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * REST katmanının (PostgREST) isteği karşılayacak hâle gelmesini bekler.
 *
 * NEDEN: `supabase db reset` (ve `supabase start`) konteynerleri yeniden başlatır ve komut,
 * VERİTABANI sağlıklı olur olmaz döner — oysa PostgREST o anda hâlâ bağlanıp şema önbelleğini
 * yüklüyor olabilir. Bu aralıkta gelen ilk istek API kapısından (Kong) **502** alır:
 * `An invalid response was received from the upstream server`. Belirti hep aynı yerde çıkıyordu —
 * `db:refresh`'in seed adımı ilk sorgusunda düşüyor, test dosyaları `beforeAll`'da yüklenemiyordu —
 * ve rastgele göründüğü için kod hatası sanılıyordu.
 *
 * Bekleme İSTEĞE bağlı değil, ölçülü: hazır olana kadar kısa aralıklarla yoklar, tavana varınca
 * SESSİZ KALMAZ — son hatayı yükseltir. "Bekledim, olmadı, yine de devam ettim" demek, asıl sorunu
 * bir sonraki adıma taşımak olurdu.
 *
 * Yoklama `head` isteğidir: satır getirmez, yalnız kapının ardındaki servisin cevap verdiğini sınar.
 * PostgREST'ten YAPISAL bir hata dönmesi de (kod taşıyan hata) "ayakta" sayılır — o hâlde beklenecek
 * bir şey yok, çağıran kendi hatasıyla ilgilenir.
 */
export interface WaitForRestOptions {
  /** Yoklama sayısı (varsayılan 40 × 250ms ≈ 10 sn — reset sonrası PostgREST bir saniyede toparlar). */
  tries?: number;
  delayMs?: number;
  /** Yoklanacak tablo — her ortamda var olan, küçük bir tablo. */
  table?: string;
}

export async function waitForRest(db: SupabaseClient, options: WaitForRestOptions = {}): Promise<void> {
  const { tries = 40, delayMs = 250, table = 'settings' } = options;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const { error } = await db.from(table).select('*', { head: true, count: 'exact' });
      // Hata yoksa hazır. Hata varsa ve PostgREST'in kendi kodunu taşıyorsa da hazır: cevap veriyor.
      if (!error || error.code) return;
      lastError = error;
    } catch (err) {
      // Ağ düzeyinde düşme (kapı henüz dinlemiyor) — beklenen hâl, yoklamaya devam.
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const detail = lastError instanceof Error ? lastError.message : JSON.stringify(lastError);
  throw new Error(
    `Supabase REST katmanı ${((tries * delayMs) / 1000).toFixed(0)} sn içinde hazır olmadı: ${detail}\n` +
      'Yığın ayakta mı? → supabase status · konteynerler: docker ps --filter name=supabase',
  );
}
