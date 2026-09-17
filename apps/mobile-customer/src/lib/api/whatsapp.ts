import type { z } from 'zod';
import { MeWhatsappLinkSchema, MeWhatsappSchema } from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

export function fetchWhatsapp(): Promise<ApiResult<z.infer<typeof MeWhatsappSchema>>> {
  return authorizedFetch('/api/v1/me/whatsapp', MeWhatsappSchema);
}

/** Her çağrı yeni kod üretir ve öncekini geçersizler. */
export function requestWhatsappLink(): Promise<ApiResult<z.infer<typeof MeWhatsappLinkSchema>>> {
  return authorizedFetch('/api/v1/me/whatsapp', MeWhatsappLinkSchema, { method: 'POST' });
}
