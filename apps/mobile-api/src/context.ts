/**
 * Hono bağlam tipi — KENDİ modülünde, çünkü hem `app.ts` hem `api/v1/auth.ts` kullanıyor ve
 * `app.ts`'ten import etmek döngü kuruyordu (auth → app → router → auth; `boundaries`
 * yakaladı). Bağımlılıksız bir tip modülü döngünün dışında durur.
 *
 * `reqId` burada TANIMLI olmak zorunda: Hono `c.set/get`'i tipe bağlıyor ve tipsiz bir anahtar
 * derleme hatası veriyor — yani kimliği taşımayı unutan bir ara katman derlenmez.
 */
export interface AppEnv {
  Variables: { reqId: string };
}
