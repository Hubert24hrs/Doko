import { vi } from "vitest";

/**
 * `server-only` throws when imported outside a React Server Component. Tests
 * import modules that carry that guard, so it is stubbed to a no-op here.
 * This does not weaken the real build: Next.js still enforces the boundary at
 * compile time.
 */
vi.mock("server-only", () => ({}));
