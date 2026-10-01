import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPooledSupabaseFetch, supabaseFetch } from './client';

const REMOTE = 'https://ornek.supabase.co';

describe('supabaseFetch — havuz yönlendirmesi', () => {
  afterEach(() => {
    setPooledSupabaseFetch(null);
    vi.unstubAllGlobals();
  });

  it("havuz takılıyken uzak veri ve oturum istekleri havuza, depolama ve yerel istekler yerleşik fetch'e gider", async () => {
    const pooled = vi.fn(async (_url: string) => new Response('havuz'));
    const builtIn = vi.fn(async () => new Response('yerleşik'));
    vi.stubGlobal('fetch', builtIn);
    setPooledSupabaseFetch(pooled);

    await supabaseFetch(`${REMOTE}/rest/v1/product?select=id`);
    await supabaseFetch(new URL(`${REMOTE}/auth/v1/user`));
    await supabaseFetch(`${REMOTE}/storage/v1/object/urun.jpg`);
    await supabaseFetch('http://127.0.0.1:54321/rest/v1/product');

    expect(pooled.mock.calls.map(([url]) => url)).toEqual([`${REMOTE}/rest/v1/product?select=id`, `${REMOTE}/auth/v1/user`]);
    expect(builtIn).toHaveBeenCalledTimes(2);
  });

  it("havuz takılmamışsa (edge, testler) istek yerleşik fetch'e gider", async () => {
    const builtIn = vi.fn(async () => new Response('yerleşik'));
    vi.stubGlobal('fetch', builtIn);

    await supabaseFetch(`${REMOTE}/rest/v1/product`);

    expect(builtIn).toHaveBeenCalledTimes(1);
  });
});
