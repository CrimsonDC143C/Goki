export type BreadcrumbLevel = 'info' | 'warn' | 'error' | 'action';

export interface Breadcrumb {
  timestamp: number;
  level: BreadcrumbLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

const SENSITIVE_KEY_REGEX = /(password|passwd|token|jwt|auth|secret|bearer|private_key|authorization|apikey|api_key)/i;
const JWT_STRING_REGEX = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g;
const BEARER_STRING_REGEX = /Bearer\s+[a-zA-Z0-9._-]+/gi;

/**
 * Recursively sanitizes diagnostic data payloads, redacting sensitive tokens,
 * passwords, and credentials to protect user privacy.
 */
export function sanitizeDiagnosticData(input: unknown, depth = 0): unknown {
  if (depth > 6 || input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    let sanitized = input;
    if (JWT_STRING_REGEX.test(sanitized)) {
      sanitized = sanitized.replace(JWT_STRING_REGEX, '[REDACTED_JWT]');
    }
    if (BEARER_STRING_REGEX.test(sanitized)) {
      sanitized = sanitized.replace(BEARER_STRING_REGEX, 'Bearer [REDACTED_TOKEN]');
    }
    return sanitized;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeDiagnosticData(item, depth + 1));
  }

  if (typeof input === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = sanitizeDiagnosticData(value, depth + 1);
      }
    }
    return copy;
  }

  return input;
}

/**
 * Fixed-capacity rolling ring buffer for diagnostic breadcrumbs.
 * Automatically evicts the oldest items when capacity (default 100) is exceeded.
 */
export class BreadcrumbRingBuffer {
  private buffer: Breadcrumb[] = [];
  private readonly maxCapacity: number;

  constructor(maxCapacity = 100) {
    this.maxCapacity = Math.max(1, maxCapacity);
  }

  public add(entry: Breadcrumb): void {
    const sanitizedEntry: Breadcrumb = {
      ...entry,
      data: entry.data
        ? (sanitizeDiagnosticData(entry.data) as Record<string, unknown>)
        : undefined,
    };

    this.buffer.push(sanitizedEntry);
    if (this.buffer.length > this.maxCapacity) {
      this.buffer.shift();
    }
  }

  public addBreadcrumb(
    level: BreadcrumbLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    this.add({
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
    });
  }

  public getAll(): Breadcrumb[] {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer = [];
  }

  public get length(): number {
    return this.buffer.length;
  }
}
