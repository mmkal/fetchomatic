import {FetchomaticError} from './errors.js'
import type {BaseFetch} from './types.js'

export interface TimeoutOptions {
  ms: number
  wrapError?: (e: unknown) => unknown
}

export const wrapAbortDOMException = (error: unknown) => {
  // Abstract away weird nodejs behaviour https://github.com/nodejs/node/issues/40692
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return FetchomaticError.create.FETCHOMATIC_ABORTED(`Aborted after timeout`, {cause: error})
  }

  return error
}

export const withTimeout = (fetch: BaseFetch, options: TimeoutOptions): BaseFetch & typeof options => {
  // It would be nice to have granular options like lookup/connect/secureConnect/socket/send/response à la got:
  // https://github.com/sindresorhus/got/blob/main/documentation/6-timeout.md
  // but I don't know if that's possible with `fetch`
  const wrapped: BaseFetch = async (input, init) => {
    try {
      return await fetch(input, {...init, signal: AbortSignal.timeout(options.ms)})
    } catch (error) {
      throw wrapAbortDOMException(error)
    }
  }
  return Object.assign(wrapped, options)
}
