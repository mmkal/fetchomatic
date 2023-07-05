import {parseFetchArgs, parseHeaders} from '../convert.ts'
import type {BaseFetch} from '../types.ts'
import {CachePolicy, type CacheInfoRequest, type CacheInfoResponse} from './http-cache-semantics.ts'
import type {KeyvLike} from './keyv.ts'

export interface SerializeableResponseInit {
  status?: number
  statusText?: string
  headers?: Record<string, string>
}
export type SerializedResponseInfo = [body?: BodyInit | null, init?: SerializeableResponseInit]

export const responseToJson = async (response: Response): Promise<SerializedResponseInfo> => {
  return [
    await response.clone().text(),
    {
      headers: parseHeaders(response.headers),
      status: response.status,
      statusText: response.statusText,
    },
  ]
}

export const jsonToResponse = (serialized: SerializedResponseInfo): Response => {
  return new Response(...serialized)
}

const kvwrap = (keyv: KeyvLike<string>) => {
  return {
    async set(url: URL, {policy, response}: {policy: CachePolicy; response: Response}, ttl: number) {
      await keyv.set(
        url.toString(),
        JSON.stringify({
          policy: policy.toObject(),
          response: await responseToJson(response),
          expiresAt: Date.now() + ttl,
        }),
        ttl,
      )
    },
    async get(url: URL) {
      const json = await keyv.get(url.toString())
      if (!json) return null
      const {policy, response, expiresAt} = JSON.parse(json)
      if (expiresAt < Date.now()) {
        // todo: warn user they're not expiring old data?
        return null
      }

      return {
        policy: CachePolicy.fromObject(policy),
        /**
         * lazy response getter. stale-while-revalidate might lead to this being used by two parties in unknown order
         * so don't create the `Response` eagerly
         */
        getResponse: (headers: Record<string, string>) => new Response(response[0], {...response[1], headers}),
      }
    },
  }
}

/** a fetch `Response` has headers in the wrong format for `http-cache-semantics`. Convert with this */
const toCacheInfoResponse = (response: Response): CacheInfoResponse => ({
  status: response.status,
  headers: parseHeaders(response.headers),
})

export const withCache = (fetch: BaseFetch, params: {keyv: KeyvLike<string>}): BaseFetch => {
  const kv = kvwrap(params.keyv)
  return async (input, init) => {
    const {url, headers, method} = parseFetchArgs([input, init])
    const newRequest: CacheInfoRequest = {url: url.toString(), headers, method}
    const cacheEntry = await kv.get(url)
    if (cacheEntry) {
      const {policy: oldPolicy, getResponse: getOldResponse} = cacheEntry
      const revalidate = async () => {
        const newInit = {...init, headers: oldPolicy?.revalidationHeaders(newRequest)}
        const newResponse = await fetch(input, newInit)
        const {policy, modified} = oldPolicy.revalidatedPolicy(newRequest, toCacheInfoResponse(newResponse))
        const response = modified ? newResponse : getOldResponse(policy.responseHeaders())

        await kv.set(url, {policy, response}, policy.timeToLive())

        return response
      }

      if (oldPolicy.satisfiesWithoutRevalidation(newRequest)) {
        return getOldResponse(oldPolicy.responseHeaders())
      }

      if (oldPolicy.useStaleWhileRevalidate()) {
        // I think this is when to actually do this: https://github.com/kornelski/http-cache-semantics/issues/41
        // Based on https://web.dev/stale-while-revalidate / it generally making sense. It's not fresh-fresh, but it is marked as
        // usable as long as we kick off a background request
        void revalidate() // fire this off ✨in the background✨
        return getOldResponse(oldPolicy.responseHeaders())
      }

      return revalidate()
    }

    // no cache entry
    const newResponse = await fetch(input, init)

    const newPolicy = new CachePolicy(newRequest, toCacheInfoResponse(newResponse))
    if (newPolicy.storable()) {
      await kv.set(url, {policy: newPolicy, response: newResponse}, newPolicy.timeToLive())
    }

    return newResponse
  }
}
