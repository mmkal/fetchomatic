import {FetchomaticError} from './errors.js'
import {withBeforeError} from './hooks.js'
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
  const abortSignal = AbortSignal.timeout(options.ms)
  const wrapped = withBeforeError(
    async (init, input) => fetch(init, {...input, signal: abortSignal}),
    params => wrapAbortDOMException(params.error),
  )
  return Object.assign(wrapped, options)
}
