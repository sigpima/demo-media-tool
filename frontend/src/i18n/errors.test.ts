import { describe, expect, it } from 'vitest'
import { ApiError } from '../services/api'
import { describeError } from './errors'
import { translate, type TFn } from './index'

const tEn: TFn = (k, p) => translate('en', k, p)
const tVi: TFn = (k, p) => translate('vi', k, p)

describe('describeError', () => {
  it('translates client-generated API errors', () => {
    expect(describeError(new ApiError(0, 'Cannot reach the server.', 'network'), tEn)).toBe(tEn('error.network'))
    expect(describeError(new ApiError(401, 'x', 'expired'), tVi)).toBe(tVi('error.expired'))
    expect(tVi('error.expired')).not.toBe(tEn('error.expired'))
  })
  it('puts the status into "request failed" and "upload failed"', () => {
    expect(describeError(new ApiError(502, 'x', 'failed'), tEn)).toContain('502')
    expect(describeError(new ApiError(413, 'x', 'upload'), tEn)).toContain('413')
  })
  it('shows server-provided text as it is', () => {
    expect(describeError(new ApiError(400, 'Could not read this image.'), tVi)).toBe('Could not read this image.')
  })
  it('shows the message of a plain Error', () => expect(describeError(new Error('boom'), tEn)).toBe('boom'))
  it('falls back to a generic message for anything else', () => {
    expect(describeError(42, tEn)).toBe(tEn('error.unknown'))
    expect(describeError(new Error(''), tEn)).toBe(tEn('error.unknown'))
  })
})
