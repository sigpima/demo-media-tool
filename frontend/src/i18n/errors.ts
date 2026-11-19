import { ApiError } from '../services/api'
import type { TFn } from './index'

/**
 * Text for an error shown to the user. Messages the client generated (carrying a `code`) are translated;
 * text that came from the server is shown as received (it is English only for now).
 */
export function describeError(e: unknown, t: TFn): string {
  if (e instanceof ApiError && e.code) return t(`error.${e.code}`, { status: e.status })
  if (e instanceof Error && e.message) return e.message
  return t('error.unknown')
}
