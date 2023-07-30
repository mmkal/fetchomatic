import {simplifyResponse} from './convert.js'
import {withAfterResponse, withBeforeError, withBeforeRequest} from './hooks.js'
import type {BaseFetch} from './types.js'

export type Log<Args extends any[] = any[]> = (...args: Args) => void
export type LogMethod = 'info' | 'warn' | 'error'
export type Logger<Args extends any[] = any[]> = Record<LogMethod, Log<Args>>

type LogHookOptions = {
  logger?: Logger
  message?: string
}

export const withBeforeRequestLogger = (
  fetch: BaseFetch,
  {logger = console, message = 'beforeRequest'}: LogHookOptions = {},
) => {
  return withBeforeRequest(fetch, params => {
    const {headers, ...options} = params.args[1] || {}
    logger.info(message, {
      ...params.parsed,
      url: params.parsed.url.toJSON(),
      options,
    })
  })
}

export const withBeforeErrorLogger = (
  fetch: BaseFetch,
  {logger = console, message = 'beforeError'}: LogHookOptions = {},
) => {
  return withBeforeError(fetch, params => {
    logger.error(message, params)
    return params.error
  })
}

export const withAfterResponseLogger = (
  fetch: BaseFetch,
  {logger = console, message = 'afterResponse'}: LogHookOptions = {},
) => {
  return withAfterResponse(fetch, params => {
    logger.info(message, {...params, response: simplifyResponse(params.response)})
    return params.response
  })
}

// add some opinionated loggers here? opinionated about what's worth logging, not the logger implementation
