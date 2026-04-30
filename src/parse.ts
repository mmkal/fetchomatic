import {parseHeaders} from './convert.js'
import {
  looksLikeStandardSchemaFailure,
  prettifyStandardSchemaError,
  StandardSchemaV1Error,
  type StandardSchemaV1,
} from './standard-schema.js'
import type {BaseFetch} from './types.js'

export type ZodV3LikeParser<T> = {parse: (input: unknown) => T}
export type Parser<T> = StandardSchemaV1<unknown, T> | ZodV3LikeParser<T>

export interface ResponseParser<T> {
  headers?: Parser<Record<string, string>>
  status?: Parser<number>
  text?: Parser<string>
  json?: Parser<T>
}

const parseUnsafe = async <T>(parser: Parser<T>, input: unknown) => {
  if (!('~standard' in parser)) {
    return parser.parse(input)
  }
  const result = await parser['~standard'].validate(input)
  if (looksLikeStandardSchemaFailure(result)) {
    throw new ParseError(prettifyStandardSchemaError(result)!, {
      cause: new StandardSchemaV1Error(result),
    })
  }

  return result.value
}

export class ParseError extends Error {
  constructor(message: string, options?: {cause?: Error}) {
    super(message, options)
  }
}

const noPromise = <T>(result: T | Promise<T>, reason: string) => {
  if (typeof (result as Promise<unknown>)?.then === 'function') {
    throw new Error(`Async validators aren't supported here: ${reason}`)
  }
  return result as T
}

export type JsonType<P extends ResponseParser<unknown>> = P extends {json: Parser<infer X>} ? X : never

export const withParser = <T>(
  fetch: BaseFetch,
  options: {parser: ResponseParser<T>},
): BaseFetch & typeof options => {
  const wrapped: BaseFetch = async (...args) => {
    const original = await fetch(...args)
    const clone = original.clone()
    if (options.parser.status) {
      const parser = options.parser.status
      Object.defineProperty(clone, 'status', {
        get: () => noPromise(parseUnsafe(parser, original.status), 'status getter is synchronous'),
      })
    }

    if (options.parser.headers) {
      const parser = options.parser.headers
      Object.defineProperty(clone, 'headers', {
        get: () => noPromise(parseUnsafe(parser, parseHeaders(original.headers)), 'headers getter is synchronous'),
      })
    }

    if (options.parser.json) {
      const parser = options.parser.json
      clone.json = async () => parseUnsafe(parser, await original.json())
    }

    if (options.parser.text) {
      const parser = options.parser.text
      clone.text = async () => parseUnsafe(parser, await original.text())
    }

    return clone
  }

  return Object.assign(wrapped, options)
}
