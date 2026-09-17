import { z } from 'zod';

/** `GET /me/whatsapp`: hesaba bağlı, doğrulanmış WhatsApp numaraları; boş dizi hiç bağ olmadığını söyler. */
export const MeWhatsappSchema = z.object({ numbers: z.array(z.string()) });

/**
 * `POST /me/whatsapp`: bağlama kodu. İstemci kodu hazır mesaja ekleyip işletmenin hattını açar; kod `expiresAt`e kadar ve tek kez
 * geçerli, bu yüzden istemci dönüşte bağın kurulup kurulmadığını yalnız bu süre içinde yeniden okur.
 */
export const MeWhatsappLinkSchema = z.object({ code: z.string(), expiresAt: z.string() });
