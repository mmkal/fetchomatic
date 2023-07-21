import {mergeRequestInits, parseFetchArgs} from './convert.ts'
import type {Awaitable, BaseFetch} from './types.ts'

export type BeforeRequestHandler = (params: {
  parsed: ReturnType<typeof parseFetchArgs>
  args: Parameters<BaseFetch>
}) => Awaitable<void | null | Parameters<BaseFetch>>

export const withBeforeRequest = (fetch: BaseFetch, handler: BeforeRequestHandler): BaseFetch => {
  return async (...args) => {
    const parsed = parseFetchArgs(args)
    args = (await handler({parsed, args})) || args
    return fetch(...args)
  }
}

export type ErrorWrapper = (params: {
  parsed: ReturnType<typeof parseFetchArgs>
  args: Parameters<BaseFetch>
  error: unknown
}) => Awaitable<unknown>

/**
 * Change an error thrown by the fetch function before it's thrown. You can wrap it, or log to an error logger as a side-effect, or both.
 * You must return an error, but if you don't want to change it, just return the error that's passed in.
 *
 * @example
 * withBeforeError(fetch, async params => {
 *   await MyErrorService.logError(params.error, {extraStuff: {args: params.parsed}})
 *   return params.error
 * })
 *
 * @example
 * withBeforeError(fetch, params => {
 *   return new MyError(`Fetch failed`, {cause: params.error})
 * })
 */
export const withBeforeError = (fetch: BaseFetch, wrap: ErrorWrapper): BaseFetch => {
  return async (...args) => {
    const parsed = parseFetchArgs(args)
    return fetch(...args).catch(error => {
      throw wrap({parsed, args, error})
    })
  }
}

export type ResponseWrapper = (params: {
  parsed: ReturnType<typeof parseFetchArgs>
  args: Parameters<BaseFetch>
  response: Response
}) => Awaitable<Response>

export const withAfterResponse = (fetch: BaseFetch, handler: ResponseWrapper): BaseFetch => {
  return async (...args) => {
    const parsed = parseFetchArgs(args)
    return fetch(...args).then(async response => {
      return handler({parsed, args, response})
    })
  }
}

export const withDefaults = (fetch: BaseFetch, defaults: RequestInit) => {
  return withBeforeRequest(fetch, ({args: [url, init]}) => [url, mergeRequestInits(defaults, init || {})])
}

export const withHeaders = (fetch: BaseFetch, headers: Record<string, string>) => {
  return withDefaults(fetch, {headers})
}

export const withUserAgent = (fetch: BaseFetch, userAgent: string) => {
  return withHeaders(fetch, {'user-agent': userAgent})
}

/**
 * @example
 * const authedFetch = withAuthorization(..., `Bearer ${await getToken()}`)
 */
export const withAuthorization = (fetch: BaseFetch, authorization: string) => {
  return withHeaders(fetch, {authorization})
}
