"use client"

import { useCallback, useLayoutEffect, useRef } from "react"

export function useStableCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const callbackRef = useRef(callback)
  useLayoutEffect(() => {
    callbackRef.current = callback
  })
  return useCallback((...args: TArgs) => callbackRef.current(...args), [])
}
