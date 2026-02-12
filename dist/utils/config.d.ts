export interface TursoConfig {
    url: string;
    authToken?: string;
}
export declare function loadConfig(): TursoConfig;
export declare function saveConfig(config: TursoConfig): void;
export declare function configExists(): boolean;
/**
 * Get project namespace from CLAUDE.md "- Namespace:" line.
 * Falls back to current directory basename.
 */
export declare function getProjectNamespace(): string;
