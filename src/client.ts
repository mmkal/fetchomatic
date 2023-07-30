import {mergeRequestInits, parseHeaders} from './convert.js'
import {withParser, type JsonType, type ResponseParser} from './parse.js'
import {Methods, type BaseFetch, type Method} from './types.js'

export interface JsonResponse<T> {
  status: number
  data: T
  headers: Record<string, string>
  response: () => Response
}

export type FetchomaticClientRequestInit = Omit<RequestInit, 'body'> & {
  body?: any
  query?: Record<string, string>
}

export type Client<Parsers extends Record<string, ResponseParser<any>>> = {
  [K in Lowercase<Method>]: {
    json: <Url extends keyof Parsers>(
      url: Url,
      init?: FetchomaticClientRequestInit,
    ) => Promise<JsonResponse<JsonType<Parsers[Url]>>>
    text: <Url extends keyof Parsers>(url: Url, init?: FetchomaticClientRequestInit) => Promise<JsonResponse<string>>
  }
} & {
  fetch: BaseFetch
  parsers: Parsers
}

export type ClientOptions<Parsers extends Record<`/${string}`, ResponseParser<any>>> = {
  baseUrl?: string
  parsers?: Parsers
}

export const client = <Parsers extends Record<string, ResponseParser<any>> = Record<string, ResponseParser<unknown>>>(
  fetch: BaseFetch,
  options?: ClientOptions<Parsers>,
): Client<Parsers> => {
  const methods = Object.fromEntries(
    Methods.map((methodUppercase: Method) => {
      const method = methodUppercase.toLowerCase() as Lowercase<Method>
      const getClientFunction =
        (getData: (res: Response) => Promise<any>) =>
        async (url: string, {query, body, ...input}: FetchomaticClientRequestInit = {}) => {
          const existingQuery = Object.fromEntries(new URLSearchParams(url.split('?')[1] || ''))
          const parser = options?.parsers?.[url]
          fetch = parser ? withParser(fetch, {parser}) : fetch
          const res = await fetch(
            [(options?.baseUrl || '') + url, new URLSearchParams({...existingQuery, ...query}).toString()]
              .filter(Boolean)
              .join('?'),
            mergeRequestInits(
              {method},
              body ? {body: JSON.stringify(body)} : {}, // null check: GET/OPTIONS/DELETE don't support body,
              {headers: {'content-type': 'application/json'}},
              input,
            ),
          )
          return {
            status: res.status,
            data: await getData(res),
            headers: parseHeaders(res.headers),
            response: () => res,
          }
        }

      return [
        method,
        {
          json: getClientFunction(async res => res.json()),
          text: getClientFunction(async res => res.text()),
        },
      ]
    }),
  ) as any as {
    [K in Lowercase<Method>]: {
      json: <Url extends keyof Parsers>(
        url: Url,
        init?: FetchomaticClientRequestInit,
      ) => Promise<JsonResponse<JsonType<Parsers[Url]>>>
      text: <Url extends keyof Parsers>(url: Url, init?: FetchomaticClientRequestInit) => Promise<JsonResponse<string>>
    }
  }

  return {...methods, fetch, parsers: options?.parsers || ({} as Client<Parsers>['parsers'])}
}
