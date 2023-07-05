export type BaseFetch = typeof global.fetch

export const Methods = ['GET', 'POST', 'PUT', 'HEAD', 'DELETE', 'OPTIONS', 'TRACE'] as const
export type Method = (typeof Methods)[number]

export const FetchErrorCodes = [
  'ETIMEDOUT',
  'ECONNRESET',
  'EADDRINUSE',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
] as const
export type FetchErrorCode = (typeof FetchErrorCodes)[number]

export type Awaitable<T> = T | Promise<T>
