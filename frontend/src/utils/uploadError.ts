import { ApiError } from '../api'

/**
 * A file rejected for being too large surfaces very differently depending on
 * where it's rejected: nginx (client_max_body_size) and PHP itself
 * (post_max_size) reject the request before Laravel ever sees it -- no JSON
 * body, just a bare 413 -- while Laravel's own `max:` validation rule
 * rejects it with a 422 and a technical message ("The photo field must not
 * be greater than 10240 kilobytes."). An agent on a job site doesn't need
 * either of those; they need to know their photo was too big and what to
 * do about it.
 */
export function friendlyUploadErrorMessage(err: unknown, messages: { tooLarge: string; generic: string }): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return messages.tooLarge
    const fieldErrors = err.errors ? Object.values(err.errors).flat() : []
    const sizeRelated = [err.message, ...fieldErrors].some((m) =>
      /greater than|kilobytes|too large|volumineux|failed to upload|trop lourd/i.test(m),
    )
    return sizeRelated ? messages.tooLarge : err.message
  }

  return err instanceof Error ? err.message : messages.generic
}
