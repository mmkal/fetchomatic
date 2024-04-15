import type {SimplifiedRequest} from './convert.js'
import {parseFetchArgs, simplifyResponse} from './convert.js'
import type {LogMethod, Logger} from './logging.js'
import type {Method, FetchErrorCode, BaseFetch} from './types.js'

export interface ShouldRetryOptions {
  attemptsMade: number
  method: Method
  errorCode: FetchErrorCode | null
  request: SimplifiedRequest
  response: Response | null
  basis: ShouldRetry
  fetch: BaseFetch
}
/* eslint-disable @typescript-eslint/no-loop-func */
export type ShouldRetry = (options: ShouldRetryOptions) => RetryInstruction

export interface RetryInstruction {
  retryAfterMs: number | null
  previous: RetryInstruction | null
  reason: string
  request?: (parsed: Pick<SimplifiedRequest, 'headers'>) => Pick<SimplifiedRequest, 'headers'>
}

export interface RetryInfo {
  options: ShouldRetryOptions
  instruction: RetryInstruction
}

export const noRetry: ShouldRetry = () => ({
  retryAfterMs: null,
  previous: null,
  reason: 'noRetry',
})

export type FetchResultSuccess = {ok: true; response: Response}
export type FetchResultFailure = {ok: false; error: {cause?: {code?: string}} | undefined | null}
export type FetchResult = FetchResultSuccess | FetchResultFailure
interface RetryConditions {
  methods: Method[]
  statuses: number[]
  errorCodes: FetchErrorCode[]
}
export const defaultRetryConditions: RetryConditions = {
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

export const retryOnFailure = ({conditions = defaultRetryConditions} = {}): ShouldRetry => {
  const methods = new Set(conditions.methods)
  const statuses = new Set(conditions.statuses)
  const errorCodes = new Set(conditions.errorCodes)
  return opts => {
    const isRetryableErrorCode = opts.errorCode && errorCodes.has(opts.errorCode)
    const isRetryableStatus = opts.response?.status && statuses.has(opts.response.status)
    const shouldRetry = methods.has(opts.method) && (isRetryableErrorCode || isRetryableStatus)
    const common = {previous: null, reason: 'retryOnFailure'}
    return shouldRetry ? {retryAfterMs: 0, ...common} : {retryAfterMs: null, ...common}
  }
}

export const delayRetry =
  ({ms}: {ms: number}): ShouldRetry =>
  opts => {
    const previous = opts.basis(opts)
    if (typeof previous.retryAfterMs !== 'number') {
      return previous
    }

    return {
      retryAfterMs: ms,
      previous,
      reason: `Retry delay set to ${ms}ms`,
    }
  }

export type ShouldRetryExtender<T extends {}> = (params: T) => ShouldRetry

type Jitter = (delay: number) => number
export const fullJitter: Jitter = delay => Math.random() * delay
export const noJitter: Jitter = delay => delay
export const expBackoff: ShouldRetryExtender<{power: number; jitter?: Jitter}> =
  ({power, jitter = fullJitter}) =>
  opts => {
    // Full jitter is pretty good at preventing thundering herds: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter
    const previous = opts.basis(opts)
    if (typeof previous.retryAfterMs !== 'number') {
      return previous
    }

    const exp = opts.attemptsMade
    const adjustedRetryAfterMs = previous.retryAfterMs * power ** exp
    const jitteredRetryAfterMs = jitter(adjustedRetryAfterMs)
    return {
      retryAfterMs: jitteredRetryAfterMs,
      previous,
      reason: `Attempt ${opts.attemptsMade} failed, delaying ${previous.retryAfterMs}*${power}^${exp}=${adjustedRetryAfterMs}, jittered to ${jitteredRetryAfterMs}`,
    }
  }

export const capRetryTimeout: ShouldRetryExtender<{ms: number; behavior: 'limit' | 'disable-retry'}> =
  ({ms: upperLimit, behavior}) =>
  opts => {
    const previous = opts.basis(opts)
    if (typeof previous.retryAfterMs !== 'number' || previous.retryAfterMs <= upperLimit) {
      return previous
    }

    if (behavior === 'disable-retry') {
      return {
        retryAfterMs: null,
        previous,
        reason: `Retry disabled, cap ${upperLimit}ms exceeded`,
      }
    }

    return {
      retryAfterMs: upperLimit,
      previous,
      reason: `Retry delay capped to ${upperLimit}ms`,
    }
  }

export const capRetryAttempts: ShouldRetryExtender<{attempts: number}> =
  ({attempts}) =>
  opts => {
    const previous = opts.basis(opts)
    if (opts.attemptsMade > attempts) {
      return {
        retryAfterMs: null,
        previous,
        reason: `Retry disabled, ${attempts} attempts reached`,
      }
    }

    return previous
  }

export const respectRateLimitHeaders = (): ShouldRetry => opts => {
  const previous = opts.basis(opts)
  const retryAfterHeader = opts.response?.headers.get('retry-after')

  if (retryAfterHeader) {
    return {
      retryAfterMs: /\D/.test(retryAfterHeader)
        ? new Date(retryAfterHeader).getTime() - Date.now()
        : Number(retryAfterHeader) * 1000,
      previous,
      reason: `retry-after response header instructed waiting for ${retryAfterHeader}s`,
    }
  }

  const rateLimitResetEpochSeconds = opts.response?.headers.get('x-ratelimit-reset')
  if (rateLimitResetEpochSeconds) {
    const date = new Date(rateLimitResetEpochSeconds).toISOString()
    return {
      retryAfterMs: Number(rateLimitResetEpochSeconds) * 1000 - Date.now(),
      previous,
      reason: `x-ratelimit-reset header instructed waiting until epoch ${rateLimitResetEpochSeconds} (=${date})`,
    }
  }

  return previous
}

type GetLogMethod = (params: {options: ShouldRetryOptions; result: RetryInstruction}) => LogMethod | null

export const failureOrRetrySuccessLogMethod: GetLogMethod = ({options, result}) => {
  if (typeof result.retryAfterMs === 'number') return 'error'
  if (options.attemptsMade > 0) return 'warn'
  return null
}

export const logRetry: ShouldRetryExtender<{
  message?: string
  logger?: Logger
  getLogMethod?: GetLogMethod
}> =
  ({message = 'retry', logger = console, getLogMethod = failureOrRetrySuccessLogMethod}) =>
  options => {
    const result = options.basis(options)
    const logMethod = getLogMethod({options, result})
    if (logMethod) {
      logger[logMethod]({
        message,
        options: {...options, response: options.response && simplifyResponse(options.response)},
        result,
      })
    }

    return result
  }

export const createShouldRetry = (...list: ShouldRetry[]) => {
  return list.slice(1).reduce((basis, next) => {
    return opts => next({...opts, basis})
  }, list[0] || noRetry)
}

export interface MegaRetryOptions {
  failureConditions?: RetryConditions
  firstRetryTimeoutMs?: number
  power?: number
  maxRetries?: number
  jitter?: Jitter
  capTimeout?: {
    ms: number
    behavior: 'limit' | 'disable-retry'
  }
}

export const megaRetry = ({
  failureConditions = defaultRetryConditions,
  firstRetryTimeoutMs = 100,
  power = 2,
  maxRetries = Number.POSITIVE_INFINITY,
  jitter = fullJitter,
  capTimeout = {ms: Number.POSITIVE_INFINITY, behavior: 'limit'},
}: MegaRetryOptions): ShouldRetry =>
  createShouldRetry(
    retryOnFailure({conditions: failureConditions}),
    delayRetry({ms: firstRetryTimeoutMs}),
    expBackoff({power, jitter}),
    capRetryTimeout(capTimeout),
    capRetryAttempts({attempts: maxRetries}),
  )

/** Get a new `fetch` instance which retries based on the `shouldRetry` function */
export const withRetry = (fetch: BaseFetch, options: {shouldRetry: ShouldRetry}): BaseFetch & typeof options => {
  const wrapped: BaseFetch = async (input, init) => {
    let attemptsMade = 0
    let shouldRetry!: ReturnType<ShouldRetry>
    let result!: FetchResult
    if (typeof shouldRetry?.retryAfterMs === 'number') {
      await new Promise(r => setTimeout(r, shouldRetry.retryAfterMs!))
    }

    do {
      const resolvedFetch = fetch
      const parsedArgs = parseFetchArgs([input, init])
      const {headers} = shouldRetry?.request?.(parsedArgs) || parsedArgs
      init = {...init, headers}
      result = await resolvedFetch(input, init)
        .then((response): typeof result => ({ok: true, response}))
        .catch((error: unknown): typeof result => ({ok: false, error: error as never}))

      const method = (init?.method as Method) || 'GET'

      shouldRetry = options.shouldRetry({
        attemptsMade,
        method,
        basis: noRetry,
        request: parseFetchArgs([input, init]),
        ...(result.ok
          ? {errorCode: null, response: result.response}
          : {errorCode: (result.error?.cause?.code as FetchErrorCode) || null, response: null}),
        fetch: resolvedFetch,
      })

      attemptsMade++
    } while (typeof shouldRetry.retryAfterMs === 'number')

    if (!result.ok) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw result.error
    }

    return result.response
  }

  return Object.assign(wrapped, options)
}

export const awsRetryConfig = createShouldRetry(
  retryOnFailure(),
  delayRetry({ms: 100}),
  expBackoff({power: 2}),
  capRetryAttempts({attempts: 4}),
  logRetry({logger: console}),
)

export const aws2 = megaRetry({
  failureConditions: defaultRetryConditions,
  firstRetryTimeoutMs: 100,
  jitter: fullJitter,
  power: 2,
  maxRetries: 10,
})

export const githubRetryConfig = createShouldRetry(
  retryOnFailure(),
  delayRetry({ms: 100}),
  expBackoff({power: 2}),
  capRetryAttempts({attempts: 4}),
  logRetry({logger: console}),
  respectRateLimitHeaders(),
  capRetryTimeout({ms: 120_000, behavior: 'disable-retry'}),
)

export const sometimesAwsSometimesGithub = createShouldRetry(opts =>
  opts.response?.headers.get('host')?.includes('github') ? githubRetryConfig(opts) : awsRetryConfig(opts),
)
