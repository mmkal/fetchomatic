import type {SimplifiedRequest} from './convert.js'
import {parseFetchArgs} from './convert.js'
import {FetchomaticError} from './errors.js'
import type {Awaitable, BaseFetch, FetchErrorCode, Method} from './types.js'

export interface RetryParams {
  attemptsMade: number
  method: Method
  errorCode: FetchErrorCode | null
  request: SimplifiedRequest
  response: Response | null
  error: unknown
}

export type RetryDecision = {retry: true; delayMs: number; reason?: string} | {retry: false; reason?: string}
export type RetryPolicy = (params: RetryParams) => Awaitable<RetryDecision>

export interface RetryOptions {
  methods?: Method[]
  statuses?: number[]
  errorCodes?: FetchErrorCode[]
  maxRetries?: number
  delays?: number[]
  backoffMultiplier?: number
  jitter?: 'none' | 'full'
  maxDelayMs?: number | null
  respectRetryAfter?: boolean
  respectRateLimitReset?: boolean
}

type FetchResult = {ok: true; response: Response} | {ok: false; error: unknown}

type RetryConditions = {
  methods: Method[]
  statuses: number[]
  errorCodes: FetchErrorCode[]
}

const defaultRetryConditions: RetryConditions = {
  methods: ['GET', 'PUT', 'HEAD', 'OPTIONS', 'TRACE'],
  statuses: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
  errorCodes: [
    'ETIMEDOUT',
    'ECONNRESET',
    'EADDRINUSE',
    'ECONNREFUSED',
    'EPIPE',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
  ],
}

type Jitter = (delay: number) => number

const fullJitter: Jitter = delay => Math.random() * delay
const noJitter: Jitter = delay => delay

type ResolvedRetryOptions = {
  methods: Set<Method>
  statuses: Set<number>
  errorCodes: Set<FetchErrorCode>
  maxRetries: number
  delays: number[]
  backoffMultiplier: number
  jitter: Jitter
  maxDelayMs: number | null
  respectRetryAfter: boolean
  respectRateLimitReset: boolean
}

const resolveRetryAfterMs = (header: string) => {
  const rawMs = /\D/.test(header) ? new Date(header).getTime() - Date.now() : Number(header) * 1000
  return Math.max(0, rawMs)
}

const resolveRateLimitResetMs = (header: string) => {
  const rawMs = Number(header) * 1000 - Date.now()
  return Math.max(0, rawMs)
}

const getErrorCode = (error: unknown): FetchErrorCode | null => {
  if (!error || typeof error !== 'object') return null

  if ('code' in error && typeof error.code === 'string') return error.code as FetchErrorCode
  if (!('cause' in error)) return null

  const {cause} = error
  if (!cause || typeof cause !== 'object') return null
  if ('code' in cause && typeof cause.code === 'string') return cause.code as FetchErrorCode
  return null
}

const getMaxDelayMs = (options: RetryOptions): number | null => {
  if (typeof options.maxDelayMs === 'number') return options.maxDelayMs
  return null
}

const normalizeRetryOptions = (options: RetryOptions): ResolvedRetryOptions => ({
  methods: new Set(options.methods || defaultRetryConditions.methods),
  statuses: new Set(options.statuses || defaultRetryConditions.statuses),
  errorCodes: new Set(options.errorCodes || defaultRetryConditions.errorCodes),
  maxRetries: typeof options.maxRetries === 'number' ? options.maxRetries : 10,
  delays: options.delays && options.delays.length > 0 ? options.delays : [0],
  backoffMultiplier: typeof options.backoffMultiplier === 'number' ? options.backoffMultiplier : 1,
  jitter: options.jitter === 'full' ? fullJitter : noJitter,
  maxDelayMs: getMaxDelayMs(options),
  respectRetryAfter: options.respectRetryAfter === true,
  respectRateLimitReset: options.respectRateLimitReset === true,
})

const calculateRetryDelayMs = (options: ResolvedRetryOptions, attemptsMade: number) => {
  const retriesMade = Math.max(0, attemptsMade - 1)
  const explicitDelay = options.delays[retriesMade]
  const baseDelay =
    typeof explicitDelay === 'number'
      ? explicitDelay
      : options.delays[options.delays.length - 1] *
        options.backoffMultiplier ** (retriesMade - options.delays.length + 1)

  const cappedDelay = typeof options.maxDelayMs === 'number' ? Math.min(baseDelay, options.maxDelayMs) : baseDelay

  return options.jitter(cappedDelay)
}

const retryableFailureReason = (params: RetryParams, options: ResolvedRetryOptions): string | null => {
  if (!options.methods.has(params.method)) return null

  if (params.response && options.statuses.has(params.response.status)) {
    return `Retryable response status ${params.response.status}`
  }

  if (params.errorCode && options.errorCodes.has(params.errorCode)) {
    return `Retryable error code ${params.errorCode}`
  }

  return null
}

export const retry = (params: RetryParams, options: RetryOptions): RetryDecision => {
  const resolved = normalizeRetryOptions(options)
  const failureReason = retryableFailureReason(params, resolved)
  if (!failureReason) {
    return {retry: false, reason: 'Response/error did not match retry policy'}
  }

  if (params.attemptsMade > resolved.maxRetries) {
    return {retry: false, reason: `Retry disabled, ${resolved.maxRetries} retries reached`}
  }

  const retryAfterHeader = resolved.respectRetryAfter && params.response?.headers.get('retry-after')
  const rateLimitResetHeader = resolved.respectRateLimitReset && params.response?.headers.get('x-ratelimit-reset')
  const headerDelayMs = retryAfterHeader
    ? resolveRetryAfterMs(retryAfterHeader)
    : rateLimitResetHeader
      ? resolveRateLimitResetMs(rateLimitResetHeader)
      : null
  const delayMs =
    typeof headerDelayMs === 'number' ? headerDelayMs : calculateRetryDelayMs(resolved, params.attemptsMade)

  return {
    retry: true,
    delayMs,
    reason: retryAfterHeader
      ? `retry-after response header instructed waiting for ${retryAfterHeader}`
      : rateLimitResetHeader
        ? `x-ratelimit-reset header instructed waiting until epoch ${rateLimitResetHeader}`
        : failureReason,
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getRetryPolicy = (options: RetryOptions | RetryPolicy): RetryPolicy => {
  if (typeof options === 'function') return options
  return params => retry(params, options)
}

/** Get a new `fetch` instance which retries based on the retry policy */
export const withRetry = (fetch: BaseFetch, options: RetryOptions | RetryPolicy): BaseFetch => {
  const retryPolicy = getRetryPolicy(options)
  const wrapped: BaseFetch = async (input, init) => {
    let attemptsMade = 0

    while (true) {
      const request = parseFetchArgs([input, init])
      const result: FetchResult = await fetch(input, init)
        .then(response => ({ok: true, response}) as const)
        .catch((error: unknown) => ({ok: false, error}) as const)

      attemptsMade++

      const decision = await retryPolicy({
        attemptsMade,
        method: request.method,
        request,
        ...(result.ok
          ? {error: null, errorCode: null, response: result.response}
          : {error: result.error, errorCode: getErrorCode(result.error), response: null}),
      })

      if (!decision.retry) {
        if (result.ok) return result.response
        throw FetchomaticError.fromThrown(result.error)
      }

      await sleep(decision.delayMs)
    }
  }

  return wrapped
}
