/**
 * Shared CLI response utilities.
 * Provides consistent response formatting for CLI commands.
 */
/**
 * Create an error response object.
 */
export function errorResponse(message) {
    return { success: false, error: message };
}
/**
 * Create a success response object with optional data.
 */
export function successResponse(data) {
    return data !== undefined
        ? { success: true, data }
        : { success: true };
}
/**
 * Output an error response and exit with code 1.
 */
export function exitWithError(message) {
    console.log(JSON.stringify(errorResponse(message)));
    process.exit(1);
}
/**
 * Output a success response and optionally exit.
 */
export function outputSuccess(data) {
    console.log(JSON.stringify(successResponse(data)));
}
