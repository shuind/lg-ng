const queues = new Map<string, Promise<void>>()

export async function withBookMutationQueue<T>(
  bookId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(bookId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const current = previous.catch(() => {}).then(() => gate)
  queues.set(bookId, current)

  await previous.catch(() => {})
  try {
    return await operation()
  } finally {
    release()
    if (queues.get(bookId) === current) {
      queues.delete(bookId)
    }
  }
}
