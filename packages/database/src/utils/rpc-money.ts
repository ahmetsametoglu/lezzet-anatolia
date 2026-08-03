import { fromCents, toCents } from '@lezzet/helper';

/**
 * RPC dönüşündeki para alanlarını cent'e indirir (02.9 · `STACK §8`).
 *
 * **Neden `BaseDbService.moneyFields` bunu yapmıyor:** o eşleme bir TABLO SATIRI üstünde çalışır —
 * kolon adını bilir, satırı doğrular. RPC dönüşü ise `jsonb`'dir: şekli fonksiyonun kendi kararıdır,
 * bir tablonun izdüşümü değil. Ortak yol yerine ortak bir YARDIMCI doğru sınır: dönüşüm yine tek
 * yerde yazılı ve yine `toCents` üstünden (elle `* 100` `STACK §8`'de yasak).
 *
 * `field` euro alan adıdır (camelCase, `dbToApp`'ten geçmiş hâli); sonuç `…Cents` adıyla yazılır ve
 * euro alan düşer. Alan yoksa dokunulmaz: RPC'ler duruma göre eksik alan döndürür (`ok: false`
 * dallarında maliyet hiç hesaplanmaz) ve orada `null` yazmak "hesaplandı, sıfır çıktı" derdi —
 * ölçülemeyen değer sıfır değildir (`CLAUDE.md §1`).
 */
export function rpcMoneyToCents(row: unknown, fields: readonly string[]): Record<string, unknown> {
  const out = { ...(row as Record<string, unknown>) };
  for (const field of fields) {
    if (!(field in out)) continue;
    const value = out[field];
    delete out[field];
    out[`${field}Cents`] = value === null || value === undefined ? null : toCents(Number(value));
  }
  return out;
}

/**
 * Ters yön: RPC'ye GİDEN gövdedeki cent alanlarını euro'ya indirir ve `…Cents` ekini düşürür.
 *
 * **Sessiz bir tuzağı kapatır.** RPC gövdeleri `jsonb` gider ve fonksiyonlar gelen anahtarları
 * tablonun kolonlarıyla KESİŞTİRİR: `unit_price_cents` diye bir kolon olmadığı için o anahtar
 * sessizce düşer, `unit_price` null kalır. Şanslıysanız `not null` kısıtı patlar (sipariş yolunda
 * öyle oldu); değilseniz satır fiyatsız doğar ve hiçbir yerde hata görünmez.
 *
 * `fields` app tarafındaki `…Cents` adlarıdır — servisin `moneyFields` beyanıyla AYNI liste, iki
 * yerde ayrı yazılmasın diye çağıran o listeyi geçirir.
 */
export function rpcMoneyToEuro(row: unknown, fields: readonly string[]): Record<string, unknown> {
  const out = { ...(row as Record<string, unknown>) };
  for (const field of fields) {
    if (!(field in out)) continue;
    const value = out[field];
    delete out[field];
    out[field.slice(0, -'Cents'.length)] = value === null || value === undefined ? null : fromCents(Number(value));
  }
  return out;
}
