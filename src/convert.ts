// todo: do own module augmentation/use a different type then the default `RequestInit`
// import 'next'
import type {BaseFetch, Method} from './types.js'

// interface RequestInit {
//   next?: NextFetchRequestConfig | undefined
// }

export interface SimplifiedRequest {
  url: URL
  method: Method
  json?: any
  text?: string
  headers: Record<string, string>
}

export const parseFetchArgs = ([init, input]: Parameters<BaseFetch>): SimplifiedRequest => {
  if (typeof init !== 'string' && !(init instanceof URL)) {
    throw new TypeError(`RequestInfo form of \`init\` param not supported`)
  }

  return {
    get url() {
      return new URL(init)
    },
    get method() {
      return (input?.method?.toUpperCase() || 'GET') as Method
    },
    get json() {
      const json = input?.body?.toString()
      return json ? JSON.parse(json) : null
    },
    get text() {
      return input?.body?.toString()
    },
    /** dictionary-format headers */
    get headers() {
      return parseHeaders(input?.headers || {})
    },
  }
}

export const simplifiedRequestToFetchArgs = (request: SimplifiedRequest): Parameters<BaseFetch> => [
  request.url.toString(),
  {method: request.method, headers: request.headers, body: request.json ? JSON.stringify(request.json) : request.text},
]

export const simplifyResponse = (response: Response) => ({
  status: response.status,
  headers: parseHeaders(response.headers),
})

/** Parse a headers object into a string-string dictionary. If you need multi-value headers, don't use this. */
export const parseHeaders = (
  headers: Array<[string, string]> | Record<string, string> | Headers,
): Record<string, string> => {
  return Array.isArray(headers) || 'entries' in (headers || {})
    ? Object.fromEntries(headers as Array<[string, string]>)
    : (headers as Record<string, string>) || {}
}

export const jsonFetchArgs = <T>(url: string | URL, params: {json: T}): Parameters<BaseFetch> => {
  return [
    url,
    {
      body: JSON.stringify(params.json),
      headers: {
        'content-type': 'application/json',
      },
    },
  ]
}

type RequestInitN = RequestInit & {next?: {tags: string[]}}
/** Merges two request init objects, deep-merging headers and `next`-specific stuff */
export const mergeTwoRequestInit = (left: RequestInitN, right: RequestInitN): RequestInitN => {
  return {
    ...left,
    ...right,
    headers: {
      ...left?.headers,
      ...right?.headers,
    },
    ...((left.next || right.next) && {
      next: {...left.next, tags: [...(left.next?.tags || []), ...(right.next?.tags || [])]},
    }),
  }
}

export const mergeRequestInits = (...[head, ...tail]: RequestInit[]) =>
  tail.reduce((acc, next) => mergeTwoRequestInit(acc, next), head)
