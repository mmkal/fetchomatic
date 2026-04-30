import type {SimplifiedRequest} from './convert.js'
import {parseFetchArgs} from './convert.js'
import type {Awaitable, BaseFetch, Method} from './types.js'

export interface RejectParams {
  method: Method
  request: SimplifiedRequest
  response: Response
}

export type RejectDecision = {reject: true; error: Error; reason?: string} | {reject: false; reason?: string}
export type RejectPolicy = (params: RejectParams) => Awaitable<RejectDecision>

export interface RejectOptions {
  methods?: Method[]
  statuses?: number[]
}

export class FetchomaticResponseError extends Error {
  request: SimplifiedRequest
  response: Response

  constructor(params: RejectParams, options?: {reason?: string}) {
    const statusLabel = [params.response.status, params.response.statusText].filter(Boolean).join(' ')
    const reason = options?.reason || `Rejected response ${statusLabel}`
    super(reason)
    this.name = 'FetchomaticResponseError'
    this.request = params.request
    this.response = params.response
  }
}

type ResolvedRejectOptions = {
  methods: Set<Method> | null
  statuses: Set<number> | null
}

const normalizeRejectOptions = (options: RejectOptions): ResolvedRejectOptions => ({
  methods: options.methods ? new Set(options.methods) : null,
  statuses: options.statuses ? new Set(options.statuses) : null,
})

export const reject = (params: RejectParams, options: RejectOptions): RejectDecision => {
  const resolved = normalizeRejectOptions(options)
  if (resolved.methods && !resolved.methods.has(params.method)) {
    return {reject: false, reason: `Method ${params.method} did not match reject policy`}
  }

  const shouldReject = resolved.statuses ? resolved.statuses.has(params.response.status) : !params.response.ok
  if (!shouldReject) {
    return {reject: false, reason: 'Response did not match reject policy'}
  }

  const reason = `Rejected response status ${params.response.status}`
  return {reject: true, error: new FetchomaticResponseError(params, {reason}), reason}
}

const getRejectPolicy = (options: RejectOptions | RejectPolicy): RejectPolicy => {
  if (typeof options === 'function') return options
  return params => reject(params, options)
}

/** Get a new `fetch` instance which rejects final responses based on the reject policy */
export const withReject = (fetch: BaseFetch, options: RejectOptions | RejectPolicy): BaseFetch => {
  const rejectPolicy = getRejectPolicy(options)
  return async (input, init) => {
    const response = await fetch(input, init)
    const request = parseFetchArgs([input, init])
    const decision = await rejectPolicy({
      method: request.method,
      request,
      response,
    })

    if (decision.reject) {
      throw decision.error
    }

    return response
  }
}
