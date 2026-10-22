import { MASTRA_RESOURCE_ID_KEY, RequestContext } from '@mastra/core/request-context';

/** RequestContext key holding the current (logged-in) user's id. */
export const USER_ID_KEY = 'userId';

/** Used until auth lands, and when no user id was passed. */
export const DEFAULT_USER_ID = 'default-user';

/** Build the per-request context passed to `agent.stream(msg, { requestContext })`. */
export function userRequestContext(userId: string) {
  const rc = new RequestContext();
  rc.set(USER_ID_KEY, userId);
  return rc;
}

/**
 * Resolve the current user id inside a tool or dynamic instructions.
 * Order: explicit `userId` key -> Mastra resource id -> DEFAULT_USER_ID.
 */
export function getUserId(rc?: { get(key: string): unknown } | null): string {
  const fromKey = rc?.get(USER_ID_KEY);
  if (typeof fromKey === 'string' && fromKey) return fromKey;
  const fromResource = rc?.get(MASTRA_RESOURCE_ID_KEY);
  if (typeof fromResource === 'string' && fromResource) return fromResource;
  return DEFAULT_USER_ID;
}
