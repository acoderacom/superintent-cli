import { Client } from '@libsql/client';
export declare function getClient(): Promise<Client>;
export declare function createClientWithConfig(url: string, authToken?: string): Promise<Client>;
export declare function closeClient(): void;
