import { describe, expect, it } from 'vitest';
import { channelLinkRecheckDue, linkedChannelsKey } from './channel-link';

const now = 1_000_000;
const unlinked = [
  { source: 'whatsapp', linked: false, numbers: [] },
  { source: 'messenger', linked: false, numbers: [] },
];
const empty = linkedChannelsKey(unlinked);

describe('channelLinkRecheckDue', () => {
  it('basılmamış bağlamada dönüş sunucuya gitmez', () => {
    expect(channelLinkRecheckDue(null, empty, now)).toBe(false);
  });

  it('kodun ömrü içinde ve bağ değişmemişken dönüş yeniden okur', () => {
    expect(channelLinkRecheckDue({ expiresAt: now + 1, startedWith: empty }, empty, now)).toBe(true);
  });

  it('kodun ömrü bitince dönüş okumaz', () => {
    expect(channelLinkRecheckDue({ expiresAt: now - 1, startedWith: empty }, empty, now)).toBe(false);
  });

  it('WhatsApp numarası geldiyse bağ görülmüştür, dönüş okumaz', () => {
    const linked = linkedChannelsKey([{ source: 'whatsapp', linked: true, numbers: ['+33600000000'] }, unlinked[1]!]);
    expect(channelLinkRecheckDue({ expiresAt: now + 1, startedWith: empty }, linked, now)).toBe(false);
  });

  it('numarasız bir sohbet bağlandıysa da bağ görülmüştür, dönüş okumaz', () => {
    const linked = linkedChannelsKey([unlinked[0]!, { source: 'messenger', linked: true, numbers: [] }]);
    expect(channelLinkRecheckDue({ expiresAt: now + 1, startedWith: empty }, linked, now)).toBe(false);
  });

  it('basıldığı anda bağ bilinmiyorsa ömür boyunca okur', () => {
    expect(channelLinkRecheckDue({ expiresAt: now + 1, startedWith: null }, empty, now)).toBe(true);
  });
});
