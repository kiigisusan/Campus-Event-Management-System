/**
 * Fire-and-forget work (mostly sending email) that must not delay the HTTP
 * response or fail the request it came from.
 *
 * Tasks are tracked so tests, and a graceful shutdown, can wait for them with
 * flushBackgroundTasks() instead of guessing with timeouts.
 */

/** @type {Set<Promise<void>>} */
const pending = new Set();

/**
 * Runs `task` after the current request finishes. Errors are logged, never thrown.
 * @param {string} label   Shown in the log if the task fails.
 * @param {() => Promise<unknown>} task
 */
export function runInBackground(label, task) {
  const promise = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (error) => console.error(`Background task "${label}" failed:`, error),
    )
    .finally(() => pending.delete(promise));
  pending.add(promise);
}

/** Resolves once every background task (including ones they start) has finished. */
export async function flushBackgroundTasks() {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
  }
}
