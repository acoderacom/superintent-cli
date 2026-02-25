type IdPrefix = 'TICKET' | 'SPEC' | 'KNOWLEDGE' | 'COMMENT' | 'WPAGE' | 'WCITE';

let lastTimestamp = 0;
let counter = 0;

/**
 * Generate a timestamp-based ID in format: PREFIX-YYYYMMDD-HHMMSSMMM
 * Uses a monotonic counter to avoid collisions within the same millisecond.
 */
export function generateId(prefix: IdPrefix): string {
  const now = Date.now();
  if (now === lastTimestamp) {
    counter++;
  } else {
    lastTimestamp = now;
    counter = 0;
  }

  const d = new Date(now);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const millis = String(d.getMilliseconds()).padStart(3, '0');
  const suffix = counter > 0 ? `-${counter}` : '';
  return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}${millis}${suffix}`;
}
