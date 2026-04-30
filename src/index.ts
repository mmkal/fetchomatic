import type {WithCacheOptions} from './cache/index.js'
import {withCache} from './cache/index.js'
import {mergeRequestInits} from './convert.js'
export type {WithCacheOptions} from './cache/index.js'
export {FetchomaticError, type FetchomaticErrorCode, type CustomErrorCode} from './errors.js'
export {ParseError, type Parser, type ResponseParser, type JsonType} from './parse.js'
export type {RetryOptions, ShouldRetry, ShouldRetryOptions, RetryInstruction} from './retry.js'
export type {TimeoutOptions} from './timeout.js'
export {FetchErrorCodes, Methods, type BaseFetch, type FetchErrorCode, type Method} from './types.js'
import {withParser} from './parse.js'
import {withRetry} from './retry.js'
import {withTimeout} from './timeout.js'
import type {BaseFetch} from './types.js'

export interface FetchomaticOptions {
  defaults?: RequestInit
  headers?: Record<string, string>
  userAgent?: string
  authorization?: string
  cache?: WithCacheOptions
  retry?: Parameters<typeof withRetry>[1]
  timeout?: Parameters<typeof withTimeout>[1]
  parser?: Parameters<typeof withParser>[1]['parser']
}

const applyDefaults = (fetch: BaseFetch, defaults: RequestInit): BaseFetch => {
  return async (input, init) => fetch(input, mergeRequestInits(defaults, init || {}))
}

const applyHeaders = (fetch: BaseFetch, headers: Record<string, string>): BaseFetch => {
  return applyDefaults(fetch, {headers})
}

export const fetchomatic = (fetch: BaseFetch, options: FetchomaticOptions = {}): BaseFetch => {
  let wrapped = fetch

  if (options.timeout) wrapped = withTimeout(wrapped, options.timeout)
  if (options.retry) wrapped = withRetry(wrapped, options.retry)
  if (options.cache) wrapped = withCache(wrapped, options.cache)
  if (options.parser) wrapped = withParser(wrapped, {parser: options.parser})
  if (options.defaults) wrapped = applyDefaults(wrapped, options.defaults)
  if (options.headers) wrapped = applyHeaders(wrapped, options.headers)
  if (options.userAgent) wrapped = applyHeaders(wrapped, {'user-agent': options.userAgent})
  if (options.authorization) wrapped = applyHeaders(wrapped, {authorization: options.authorization})

  return wrapped
}
