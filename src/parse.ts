import {parseHeaders} from './convert.ts'
import type {BaseFetch} from './types.ts'

/** zod-like parser */
export type Parser<T> = {
  parse: (input: unknown) => T
}

export interface ResponseParser<T> {
  headers?: Parser<Record<string, string>>
  status?: Parser<number>
  text?: Parser<string>
  json?: Parser<T>
}

export type JsonType<P extends ResponseParser<any>> = P extends {json: Parser<infer X>} ? X : never

export const withParser = <T>(fetch: BaseFetch, options: {parser: ResponseParser<T>}): BaseFetch & typeof options => {
  const wrapped: BaseFetch = async (...args) => {
    const original = await fetch(...args)
    const clone = original.clone()
    if (options.parser.status) {
      const {parse} = options.parser.status
      Object.defineProperty(clone, 'status', {
        get: () => parse(original.status),
      })
    }

    if (options.parser.headers) {
      const {parse} = options.parser.headers
      Object.defineProperty(clone, 'headers', {
        get: () => parse(parseHeaders(original.headers)),
      })
    }

    if (options.parser.json) {
      const {parse} = options.parser.json
      clone.json = async () => parse(await original.json())
    }

    if (options.parser.text) {
      const {parse} = options.parser.text
      clone.text = async () => parse(await original.text())
    }

    return clone
  }

  return Object.assign(wrapped, options)
}
