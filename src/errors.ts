import type {FetchErrorCode} from './types.ts'

const customErrorCodes = ['FETCHOMATIC_ABORTED', 'FETCHOMATIC_EUNKNOWN'] as const
export type CustomErrorCode = (typeof customErrorCodes)[number]
export type FetchomaticErrorCode = FetchErrorCode | CustomErrorCode
export class FetchomaticError extends Error {
  code: FetchomaticErrorCode

  private constructor(message: string, options: {code: FetchomaticErrorCode; cause?: unknown}) {
    super(message)
    this.code = options.code
    Object.assign(this, {cause: options?.cause})
  }

  static fromThrown(error: unknown) {
    return error instanceof FetchomaticError
      ? error
      : error && typeof (error as Record<string, unknown>).message === 'string'
      ? new FetchomaticError(`Unknown error thrown: ${(error as {message: string}).message}`, {
          code: 'FETCHOMATIC_EUNKNOWN',
          cause: error,
        })
      : new FetchomaticError(`Unknown error thrown`, {
          code: 'FETCHOMATIC_EUNKNOWN',
          cause: error,
        })
  }

  static throw = Object.fromEntries(
    customErrorCodes.map(code => [
      code,
      (message, options) => {
        throw new FetchomaticError(message || code, {...options, code})
      },
    ]),
  ) as {
    [K in CustomErrorCode]: (message?: string, options?: {cause?: unknown}) => never
  }

  static get = Object.fromEntries(
    customErrorCodes.map(code => [
      code,
      (message, options) => {
        return new FetchomaticError(message || code, {...options, code})
      },
    ]),
  ) as {
    [K in CustomErrorCode]: (message?: string, options?: {cause?: unknown}) => FetchomaticError
  }
}
