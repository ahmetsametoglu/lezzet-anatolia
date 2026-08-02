import type { SupabaseClient } from '@supabase/supabase-js';
import { PostalCodePlaceSchema, type Country, type PostalCodePlace } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Posta kodu referansı servisi (19.8) — salt okunur.
 *
 * Tablo migration'la doğar ve uygulama ona **yazmaz** (`never, never`): veri GeoNames dökümünden
 * üretilir, yılda bir yenilenir (`pnpm postal:build`). Bir kaydı elle düzeltmek, bir sonraki
 * üretimde sessizce geri alınacak bir düzeltmedir — o yüzden yazma kapısı hiç açılmıyor.
 *
 * **Karar vermez, satır getirir** (`STACK §4`): "bu kod hangi depoya düşer", "belirsiz mi" kararları
 * `domain-core/delivery/warehouse-resolve` motorundadır. Burası yalnız kodun hangi ülkelerde
 * geçerli olduğunu söyler.
 */
export class PostalCodePlaceService extends BaseDbService<PostalCodePlace, never, never> {
  constructor(supabase: SupabaseClient) {
    super(
      supabase,
      'postal_code_place',
      PostalCodePlaceSchema,
      PostalCodePlaceSchema as never,
      PostalCodePlaceSchema as never,
      false,
    );
  }

  /**
   * Bir posta kodunun geçerli olduğu ülkeler + yer adları.
   *
   * Dönüş **0, 1 ya da 2 satırdır**: 0 = hiçbir ülkede geçerli değil (yazım hatası), 1 = normal hâl,
   * 2 = kod iki ülkede birden geçerli. Sonuncusu nadir değil — FR 6.065 + DE 10.813 kodun 610'u
   * öyle, yani her on Fransız kodundan biri.
   *
   * Sayfalama YOK ve olmamalı: dönüş kümesi hizmet verilen ülke sayısıyla sınırlı (bugün en fazla
   * iki satır), veriyle büyümüyor (`CLAUDE.md §1`).
   */
  async findByPostalCode(postalCode: string): Promise<PostalCodePlace[]> {
    return this.getAll({ postalCode }, { orderBy: 'country' });
  }

  /**
   * `(ülke, kod)` ikilisinin kapsadığı yerleşimler (19.17) — adres tutarlılığının kapısı.
   *
   * `findByPostalCode`'dan AYRI: o "bu kod hangi ülkelerde geçerli" sorusunun cevabıdır ve ülkeyi
   * bilmez; bu ise ülke zaten çözülmüşken sorulur ("67000 + LINGOLSHEIM tutarlı mı").
   *
   * **Boş dizi "uyuşmuyor" DEĞİL "bilinmiyor" demektir:** kod referansta olmayabilir ama yine de
   * bizim bölge tablomuzda olabilir (19.16a). Kararı çağıran değil `cityMatchesPlaces` verir ve o
   * boş listede engellemez — ölçülemeyen değer sıfır değildir (`CLAUDE.md §1`).
   */
  async findPlaces(country: Country, postalCode: string): Promise<string[]> {
    const rows = await this.getAll({ country, postalCode });
    return rows[0]?.places ?? [];
  }
}
