import { describe, expect, it } from 'vitest';
import { ownerAction, SUITE_KIND } from './test-lock-owner.mjs';

// Test kilidinin sahibine göre koşucunun kararı (bkz. modül künyesi). Asıl iddia ikinci test:
// e2e/entegrasyon koşusu "süren tam paket" sayılmamalı — sayılınca `pnpm test` hiçbir şey
// koşmadan bir önceki paketin sonucunu basıyordu (10.09).
const NOW = 10_000_000;
const STALE_MS = 15 * 60 * 1000;
const env = (alive = true) => ({ now: NOW, staleMs: STALE_MS, isAlive: () => alive });
const owner = (kind?: string, ageMs = 1_000) =>
  kind === undefined ? { pid: 4242, at: NOW - ageMs } : { pid: 4242, at: NOW - ageMs, kind };

describe('ownerAction', () => {
  it('canlı tam paket koşusuna katılır', () => {
    expect(ownerAction(owner(SUITE_KIND), env())).toBe('join');
  });

  it("e2e/entegrasyon koşusuna ('test' türü) katılmaz, bekler", () => {
    expect(ownerAction(owner('test'), env())).toBe('wait');
  });

  it('şema işine (ddl) katılmaz, bekler', () => {
    expect(ownerAction(owner('ddl'), env())).toBe('wait');
  });

  it('türü yazılmamış (eski sürüm) sahibe katılmaz, bekler', () => {
    expect(ownerAction(owner(), env())).toBe('wait');
  });

  it('sahibi ölmüş kilidi türünden bağımsız devralır', () => {
    expect(ownerAction(owner(SUITE_KIND), env(false))).toBe('takeover');
    expect(ownerAction(owner('test'), env(false))).toBe('takeover');
  });

  it('bayatlamış kilidi devralır', () => {
    expect(ownerAction(owner('test', STALE_MS + 1), env())).toBe('takeover');
  });

  it('sahip dosyası okunamadıysa devralır', () => {
    expect(ownerAction(null, env())).toBe('takeover');
  });
});
