/* eslint-disable @typescript-eslint/no-explicit-any */
import type {Client, ClientOptions} from './exports.js'
import * as xports from './exports.js'
import {client} from './exports.js'
import type {ResponseParser} from './parse.js'
import {withParser} from './parse.js'
import {withRetry} from './retry.js'
import type {BaseFetch} from './types.js'

export * from './exports.js'

export const fetchWrapper = (...options: Array<Parameters<typeof withRetry>[1] | Parameters<typeof withParser>[1]>) => {
  return (fetch: BaseFetch) => {
    return options.reduce((f, op) => {
      return 'shouldRetry' in op ? withRetry(f, op) : withParser(f, op)
    }, fetch)
  }
}

type FetchomaticMethods = {
  [K in keyof typeof xports]: K extends `with${string}`
    ? NonNullable<(typeof xports)[K]> extends (fetch: BaseFetch, options?: infer Options) => any
      ? (options?: Options) => Fetchomatic
      : NonNullable<(typeof xports)[K]> extends (fetch: BaseFetch, options: infer Options) => any
        ? (options: Options) => Fetchomatic
        : never
    : K extends 'client'
      ? <Parsers extends Record<string, ResponseParser<any>> = Record<string, ResponseParser<unknown>>>(
          options?: ClientOptions<Parsers>,
        ) => Client<Parsers>
      : never
}

type Chainable = {
  [K in keyof typeof xports]: K extends `with${string}` ? K : never
}[keyof FetchomaticMethods]

type Fetchomatic = Pick<FetchomaticMethods, Chainable | 'client'> & {
  fetch: BaseFetch
}

export const fetchomatic = (fetch: BaseFetch): Fetchomatic =>
  Object.assign(
    Object.fromEntries(
      Object.entries(xports).flatMap(([name]): Array<[string, Function]> => {
        const isWithMethod = name.startsWith('with')
        if (!isWithMethod) return []
        return [
          [
            name,
            (options?: any) => {
              const newFetch = xports[name as Chainable](fetch, options as never)
              return fetchomatic(newFetch)
            },
          ],
        ]
      }),
    ),
    {
      client: (options?: any) => client(fetch, options as never),
      fetch,
    },
  ) as any as Fetchomatic

export * as retry from './retry.js'
