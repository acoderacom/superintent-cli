import { createClient } from '@libsql/client';
import { loadConfig } from '../utils/config.js';
let client = null;
export async function getClient() {
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
export async function createClientWithConfig(url, authToken) {
    return createClient({
        url,
        ...(authToken && { authToken }),
    });
}
export function closeClient() {
    if (client) {
        client.close();
        client = null;
    }
}
