import type { SupabaseClient } from '@supabase/supabase-js';
import {
  OauthClientSchema,
  OauthClientInsertSchema,
  OauthClientUpdateSchema,
  type OauthClient,
  type OauthClientInsert,
  type OauthClientUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Dinamik kayıtla doğan MCP istemcileri — `/oauth/register` yazar, `/oauth/authorize` okur. */
export class OauthClientService extends BaseDbService<OauthClient, OauthClientInsert, OauthClientUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'oauth_client', OauthClientSchema, OauthClientInsertSchema, OauthClientUpdateSchema);
  }

  async findByClientId(clientId: string): Promise<OauthClient | null> {
    return this.getOneBy({ clientId });
  }
}
