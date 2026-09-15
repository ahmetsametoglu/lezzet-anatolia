import type { HttpBindings } from '@hono/node-server';

/**
 * Backend'in Hono bağlamı: `reqId`i paylaşılan istek izi yazar ve tanımlı olmazsa `app.use('*', requestLog)` derlenmez. `Bindings`
 * node sunucusunun ham `req`/`res` çifti, çünkü MCP taşıması cevabı Hono'nun dışında doğrudan `ServerResponse`e yazar.
 */
export interface AppEnv {
  Bindings: HttpBindings;
  Variables: { reqId: string };
}
