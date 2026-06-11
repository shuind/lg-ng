import { AsyncLocalStorage } from "node:async_hooks"

export type RequestContext = {
  userId: string
}

const requestContext = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T | Promise<T>,
): T | Promise<T> {
  return requestContext.run(context, callback)
}

export function getCurrentUserId(): string | null {
  return requestContext.getStore()?.userId ?? null
}

export function requireCurrentUserId(): string {
  const userId = getCurrentUserId()
  if (!userId) throw new Error("missing request user context")
  return userId
}
