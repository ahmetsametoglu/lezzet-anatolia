import { registerSignInEffect, runSignInEffects } from './sign-in-effects';

describe('giriş sonrası işler (21.310)', () => {
  it('kayıtlı işlerin hepsini bekler; bırakılan kayıt koşmaz', async () => {
    const done: string[] = [];
    const releaseA = registerSignInEffect(async () => {
      done.push('a');
    });
    const releaseB = registerSignInEffect(async () => {
      await Promise.resolve();
      done.push('b');
    });
    registerSignInEffect(async () => {
      done.push('bırakılan');
    })();

    await runSignInEffects();

    expect([...done].sort()).toEqual(['a', 'b']);
    releaseA();
    releaseB();
  });

  it('kayıt yoksa hiçbir şey yapmadan döner', async () => {
    await expect(runSignInEffects()).resolves.toBeUndefined();
  });
});
