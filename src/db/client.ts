import { createClient, Client } from '@libsql/client';
import { loadConfig } from '../utils/config.js';

let client: Client | null = null;

export async function getClient(): Promise<Client> {
  if (client) {
    return client;
  }

  const config = loadConfig();
  client = createClient({
    url: config.url,
    ...(config.authToken && { authToken: config.authToken }),
  });

  return client;
}

export async function createClientWithConfig(url: string, authToken?: string): Promise<Client> {
  return createClient({
    url,
    ...(authToken && { authToken }),
  });
}

export function closeClient(): void {
  if (client) {
    client.close();
    client = null;
  }
}
