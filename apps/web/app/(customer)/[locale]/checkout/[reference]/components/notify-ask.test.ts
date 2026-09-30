import { describe, expect, it } from 'vitest';
import { notifyAskState } from './notify-ask';

const base = { placed: true, mode: 'ready' as const, on: false, asked: false, failed: false };

describe('notifyAskState', () => {
  it('kesinleşmiş siparişte bildirimi açık olmayan müşteriye sorar', () => {
    expect(notifyAskState(base)).toBe('ask');
  });

  it('bildirimi zaten açık olana, izni reddedene ve kesinleşmemiş siparişe sormaz', () => {
    expect(notifyAskState({ ...base, on: true })).toBe('hidden');
    expect(notifyAskState({ ...base, mode: 'denied' })).toBe('hidden');
    expect(notifyAskState({ ...base, placed: false })).toBe('hidden');
  });

  it('bu sayfada açılınca teşekkür eder, düşerse yeniden denetir', () => {
    expect(notifyAskState({ ...base, on: true, asked: true })).toBe('done');
    expect(notifyAskState({ ...base, asked: true, failed: true })).toBe('failed');
  });
});
