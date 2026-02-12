import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
const CONFIG_DIR = '.superintent';
const ENV_FILE = '.env';
function getEnvPath() {
    return join(process.cwd(), CONFIG_DIR, ENV_FILE);
}
function parseEnvFile(content) {
    const result = {};
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1)
            continue;
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}
function isLocalUrl(url) {
    return url.startsWith('file:');
}
export function loadConfig() {
    // Check environment variables first (highest priority)
    if (process.env.TURSO_URL) {
        const url = process.env.TURSO_URL;
        // Local file URLs don't require auth token
        if (isLocalUrl(url)) {
            return { url };
        }
        if (process.env.TURSO_AUTH_TOKEN) {
            return { url, authToken: process.env.TURSO_AUTH_TOKEN };
        }
    }
    // Check .superintent/.env file
    const envPath = getEnvPath();
    if (existsSync(envPath)) {
        const content = readFileSync(envPath, 'utf-8');
        const env = parseEnvFile(content);
        if (env.TURSO_URL) {
            const url = env.TURSO_URL;
            // Local file URLs don't require auth token
            if (isLocalUrl(url)) {
                return { url };
            }
            if (env.TURSO_AUTH_TOKEN) {
                return { url, authToken: env.TURSO_AUTH_TOKEN };
            }
        }
    }
    throw new Error('Turso config not found. Create .superintent/.env with TURSO_URL (and TURSO_AUTH_TOKEN for cloud)');
}
export function saveConfig(config) {
    const envPath = getEnvPath();
    const configDir = dirname(envPath);
    if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
    }
    let content = `# Superintent Configuration
TURSO_URL="${config.url}"
`;
    // Only include auth token for cloud URLs
    if (config.authToken) {
        content += `TURSO_AUTH_TOKEN="${config.authToken}"
`;
    }
    writeFileSync(envPath, content);
}
export function configExists() {
    // Check environment variables
    if (process.env.TURSO_URL) {
        // Local URLs don't need auth token
        if (isLocalUrl(process.env.TURSO_URL)) {
            return true;
        }
        return !!process.env.TURSO_AUTH_TOKEN;
    }
    // Check .superintent/.env file
    const envPath = getEnvPath();
    if (existsSync(envPath)) {
        const content = readFileSync(envPath, 'utf-8');
        const env = parseEnvFile(content);
        if (env.TURSO_URL) {
            // Local URLs don't need auth token
            if (isLocalUrl(env.TURSO_URL)) {
                return true;
            }
            return !!env.TURSO_AUTH_TOKEN;
        }
    }
    return false;
}
/**
 * Get project namespace from CLAUDE.md "- Namespace:" line.
 * Falls back to current directory basename.
 */
export function getProjectNamespace() {
    const claudeMdPath = join(process.cwd(), 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
        const content = readFileSync(claudeMdPath, 'utf-8');
        const match = content.match(/- Namespace:\s*(.+)/);
        if (match) {
            return match[1].trim();
        }
    }
    return process.cwd().split('/').pop() || 'global';
}
