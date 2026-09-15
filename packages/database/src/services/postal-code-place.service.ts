import type { SupabaseClient } from '@supabase/supabase-js';
import { PostalCodePlaceSchema, type Country, type PostalCodePlace } from '@lezzet/types';
import { BaseDbService } from '../core/base.service';
import {
  isPlaceNameQuery,
  MIN_PLACE_NAME_LENGTH,
  MIN_POSTAL_PREFIX_LENGTH,
  normalizePlaceName,
  normalizePostalCode,
} from '@lezzet/address';
import { DeliveryZonePostalCodeService } from './delivery-zone.service';

/** Salt okunur: veri GeoNames dökümünden üretilir (`pnpm postal:build`) ve elle düzeltme bir sonraki üretimde sessizce geri alınırdı. */
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

  /** En çok hizmet ülkesi sayısı kadar satır döner, sayfalanmaz; iki satır aynı kodun iki ülkede geçerli olmasıdır. */
  async findByPostalCode(postalCode: string): Promise<PostalCodePlace[]> {
    return this.getAll({ postalCode }, { orderBy: 'country' });
  }

  /** Boş dizi "uyuşmuyor" değil "bilinmiyor" demektir: kod referansta olmayıp bizim bölge tablomuzda olabilir. */
  async findPlaces(country: Country, postalCode: string): Promise<string[]> {
    const rows = await this.getAll({ country, postalCode });
    return rows[0]?.places ?? [];
  }

  /** Liste ekranı için tek tur; küme çağıranın elindeki sayfadır. */
  listByPostalCodes(postalCodes: readonly string[]): Promise<PostalCodePlace[]> {
    if (postalCodes.length === 0) return Promise.resolve([]);
    return this.getAll({ postalCode: [...new Set(postalCodes)] });
  }

  /**
   * Tuş yolundaki öneri ayrı bir kapıdır: onay kapısı her sorulan kodu talep sayacına yazar, öneri ise yalnız okur. Rota içi kod
   * sıralamada öne alınır ama seçilmez, çünkü adaylar arasındaki fark KDV oranı da olabilir.
   */
  async search(term: string, limit = 8): Promise<PostalCodeSuggestion[]> {
    // Dal terimin kendisinden seçilir, çağırandan bayrak alınmaz.
    const byName = isPlaceNameQuery(term);
    return byName ? this.searchByPlace(term, limit) : this.searchByCode(term, limit);
  }

  /** Önek indeksi (`postal_code_place_code`) üstünde çalışır. */
  private async searchByCode(prefix: string, limit: number): Promise<PostalCodeSuggestion[]> {
    const normalized = normalizePostalCode(prefix);
    if (normalized.length < MIN_POSTAL_PREFIX_LENGTH) return [];

    return this.enrich(
      await this.getAll(undefined, {
        prefixFilters: [{ field: 'postalCode', value: normalized }],
        orderBy: 'postalCode',
        limit,
      }),
    );
  }

  /**
   * Parça araması, çünkü `places_search` kodun bütün adlarını yan yana taşır ve önek araması çok yerleşimli kodun ikinci adını
   * bulamaz. Terim, kolonu üreten `place_search_text()` ile aynı kuralla normalleşir; ikisi ayrışırsa "Hœnheim" yazan kendi kaydını
   * bulamaz.
   */
  private async searchByPlace(term: string, limit: number): Promise<PostalCodeSuggestion[]> {
    const normalized = normalizePlaceName(term);
    if (normalized.length < MIN_PLACE_NAME_LENGTH) return [];

    return this.enrich(
      await this.getAll(undefined, {
        searchFilters: [{ field: 'placesSearch', query: normalized }],
        orderBy: 'postalCode',
        limit,
      }),
    );
  }

  private async enrich(rows: PostalCodePlace[]): Promise<PostalCodeSuggestion[]> {
    if (rows.length === 0) return [];

    // İkinci tur yalnız bulunan kodlar için, en çok `limit` tane.
    const served = await new DeliveryZonePostalCodeService(this.supabase).listByCodes(rows.map((row) => row.postalCode));
    const inRoute = new Set(served.map((row) => `${row.country}:${row.postalCode}`));

    return rows
      .map((row) => ({
        country: row.country,
        postalCode: row.postalCode,
        places: row.places,
        inRoute: inRoute.has(`${row.country}:${row.postalCode}`),
      }))
      // Ölçüt iki tabloya baktığı için sıralama bellekte; eşitlikte ülke, ki sıra belirleyici olsun.
      .sort((a, b) =>
        a.inRoute === b.inRoute
          ? a.postalCode.localeCompare(b.postalCode) || a.country.localeCompare(b.country)
          : Number(b.inRoute) - Number(a.inRoute),
      );
  }

  /**
   * Haritanın görünen alanı; `bbox` zorunlu ki ülkenin tamamını dönen, hiçbir ekranın kullanmadığı bir yol açılmasın. Tavan
   * aşılınca `truncated` döner, çünkü eksik çizilen harita olmayan kodu "yok" diye okuturdu.
   */
  async listInBounds(input: {
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
    country?: Country;
    limit?: number;
  }): Promise<{ rows: PostalCodePlace[]; truncated: boolean }> {
    const limit = input.limit ?? 1200;
    const rows = await this.getAll(input.country ? { country: input.country } : undefined, {
      // Koordinatsız satır `null` karşılaştırmasında kendiliğinden düşer; ikisinin birlikte var olması veride zorunlu.
      rangeFilters: [
        { field: 'lat', operator: 'gte', value: input.bbox.minLat },
        { field: 'lat', operator: 'lte', value: input.bbox.maxLat },
        { field: 'lng', operator: 'gte', value: input.bbox.minLng },
        { field: 'lng', operator: 'lte', value: input.bbox.maxLng },
      ],
      // Kesmede düşen satırlar belirli olsun diye sıralı; sırasız sorgu her kaydırmada başka küme döndürür.
      orderBy: 'postalCode',
      limit: limit + 1,
    });

    return { rows: rows.slice(0, limit), truncated: rows.length > limit };
  }
}

/** Etiketi ekran kurar: kaç ad yazılacağı görsel bir karardır ve hazır dize üç dilde çalışmaz. */
export interface PostalCodeSuggestion {
  country: Country;
  postalCode: string;
  /** Ham ve tam; kısaltma ekranın kararı. */
  places: string[];
  /** Sıralamayı belirler, seçimi değil. */
  inRoute: boolean;
}
