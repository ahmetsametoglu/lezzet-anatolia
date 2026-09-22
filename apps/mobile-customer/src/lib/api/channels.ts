import type { z } from 'zod';
import { MeChannelLinkCodeSchema, MeChannelsSchema } from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

export function fetchChannels(): Promise<ApiResult<z.infer<typeof MeChannelsSchema>>> {
  return authorizedFetch('/api/v1/me/channels', MeChannelsSchema);
}

/** Her çağrı yeni kod üretir ve öncekini geçersizler. */
export function requestChannelLinkCode(): Promise<ApiResult<z.infer<typeof MeChannelLinkCodeSchema>>> {
  return authorizedFetch('/api/v1/me/channels/code', MeChannelLinkCodeSchema, { method: 'POST' });
}
