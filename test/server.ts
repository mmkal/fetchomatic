import {createHash} from 'node:crypto'

export const testServerFetch = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const headers = headersToObject(request.headers)

  if (url.pathname === '/health') {
    return json({ok: true})
  }

  if (url.pathname === '/redirect') {
    const times = Number(url.searchParams.get('times') || 0)
    const redirects = Number(url.searchParams.get('redirects') || 0)
    const currentQuery = Object.fromEntries(url.searchParams)
    const query = new URLSearchParams({
      original: `${url.pathname}${url.search}`,
      ...currentQuery,
      redirects: String(redirects + 1),
      times: String(times - 1),
    })

    const pathname = times === 1 ? (url.searchParams.get('to') || '/') : '/redirect'
    return Response.redirect(new URL(`${pathname}?${query.toString()}`, url.origin).toString(), 302)
  }

  if (!/^\/(get|post|put)(\/|$)/.test(url.pathname)) {
    return new Response('Not found', {status: 404})
  }

  const failureTarget = Number(headers.request_failures)
  const retryNumber = Number(headers.retry_number || 1)
  if (retryNumber <= failureTarget) {
    return json(
      {message: `Failed ${retryNumber} times`},
      {status: Number(url.searchParams.get('request_failure_status')) || 500},
    )
  }

  await sleep(Number(headers.delay_ms) || 0)

  const body = await parseRequestBody(request)
  const responseStatus = Number(headers.response_status) || 200
  const responseEntries: Array<[string, unknown]> = [
    ['url', `${stripPrefix(url.pathname)}${url.search}`],
    ['query', Object.fromEntries(url.searchParams)],
    ['body', body],
    ['headers', {...headers, date: undefined, etag: undefined}],
  ]
  const response = Object.fromEntries(
    responseEntries.filter(([name]) => (typeof headers.echo === 'string' ? headers.echo.split(',').includes(name) : true)),
  )

  const responseHeaders = new Headers({
    'cache-control': 'immutable',
    now: new Date().toISOString(),
  })
  const extraResponseHeaders = new URLSearchParams(headers['set-response-headers'] || '')
  extraResponseHeaders.forEach((value, name) => {
    responseHeaders.set(name, value)
  })

  return json(response, {
    status: responseStatus,
    headers: responseHeaders,
  })
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const headersToObject = (headers: Headers) => {
  const entries: Record<string, string> = {}
  headers.forEach((value, key) => {
    entries[key] = value
  })
  return entries
}

const json = (body: unknown, init?: ResponseInit) => {
  const text = JSON.stringify(body)
  const etag = createHash('sha1').update(text).digest('hex')
  return new Response(text, {
    ...init,
    headers: {
      'content-type': 'application/json',
      etag,
      ...headersToObject(new Headers(init?.headers)),
    },
  })
}

const parseRequestBody = async (request: Request) => {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined
  const text = await request.text()
  if (!text) return undefined

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return JSON.parse(text) as unknown
  }

  return text
}

const stripPrefix = (pathname: string) => {
  for (const prefix of ['/get', '/post', '/put']) {
    if (pathname === prefix) return '/'
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length)
  }

  return pathname
}
