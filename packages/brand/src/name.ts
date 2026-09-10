/*
  MARKANIN ADI — TEK yazıldığı yer; `brand.name` (`./index`) bundan türer.

  AYRI YAPRAK DOSYA, çünkü native uygulamanın `app.config.ts`i adı Node'un kendi ESM yükleyicisiyle,
  Metro'dan önce okur: Node uzantısız göreli importu çözemez ve paket girişi öyle importlar taşıyabilir.
  Bu dosya hiçbir şey içe aktarmaz; alt yolu (`@lezzet/brand/name`) yalnız bunun için açıktır — iki
  kuralı da `apps/mobile/src/lib/app-config-guard.test.ts` çiviliyor.
*/
export const BRAND_NAME = 'Lezzet Anatolie';
