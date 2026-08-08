import { renderRouter } from 'expo-router/testing-library';

/*
  ROUTER TESTLERİNİN ORTAK İSKELESİ — iki kabuk testi de (müşteri `app-shell` + operasyon
  `operations-shell`) gerçek rota ağacını (`./src/app`) ayağa kaldırır; sarmalayıcı ve matcher
  tipi bu yüzden TEK yerde durur (CLAUDE §1 — ilk başta app-shell'in içindeydi, ikinci tüketici
  doğunca buraya taşındı).

  MATCHER TİPİ ELLE: expo-router 57'nin yayını `expect.d.ts`i BOŞ basıyor (`export {}`) — matcher
  çalışma zamanında kayıtlı ama tipte yok; bildirim burada, her tüketiciye import'la ulaşır.
*/
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toHavePathname(pathname: string): R;
    }
  }
}

/*
  RNTL v14 `render`ı ASYNC döndürür; `renderRouter` (57.0.11) bunu bilmez ve `getPathname` gibi
  metodları sözün (promise) üstüne iliştirir. Bu sarmalayıcı sözü bekler ama İLİŞTİRİLMİŞ nesneyi
  DÜZ DÖNDÜREMEZ: async fonksiyondan thenable dönerse `await` onu bir kez daha çözer ve elde
  metodsuz iç sonuç kalır. Nesneye sarmak (`{ app }`) o ikinci çözülmeyi keser — matcher'lar
  (`toHavePathname`) metodları `app`ten okur.
*/
export async function renderShell(initialUrl: string) {
  const app = renderRouter('./src/app', { initialUrl });
  await app;
  return { app };
}
