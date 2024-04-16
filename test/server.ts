import express from 'express'
import * as url from 'node:url'

export const runServer = async () => {
  const app = express()

  app.get('/health', (req, res) => res.status(200).send({ok: true}))

  app.use('/redirect', (req, res) => {
    const times = Number(req.query.times || 0)
    const redirects = Number(req.query.redirects || 0)
    const query = {
      original: req.originalUrl,
      ...req.query,
      redirects: String(redirects + 1),
      times: String(times - 1),
    }
    const pathname = times === 1 ? (req.query.to as string) : req.baseUrl
    res.redirect(`${pathname}?${new URLSearchParams(query).toString()}`)
  })

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.use(/\/(get|post|put)/, async (req, res) => {
    const failureTarget = Number(req.headers.request_failures)
    const retryNumber = Number(req.headers.retry_number || 1) // todo: figure out if there's a standardized header for this
    if (retryNumber <= failureTarget) {
      res.status(Number(req.query.request_failure_status) || 500).send({
        message: `Failed ${retryNumber} times`,
      })
      return
    }

    await new Promise(r => setTimeout(r, Number(req.headers.delay_ms) || 0))

    const status = Number(typeof req.headers.response_status) || 200

    const props = [
      ['url', req.url],
      ['query', req.query],
      ['body', req.body],
      ['headers', {...req.headers, date: undefined, etag: undefined}],
    ]
    const response = Object.fromEntries(
      props.filter(([name]) =>
        typeof req.headers.echo === 'string' ? req.headers.echo.split(',').includes(name) : true,
      ),
    )
    res.setHeader('now', new Date().toISOString())
    res.setHeader('cache-control', 'immutable')

    const resHeadersToSet = new URLSearchParams(req.headers['set-response-headers']?.toString())
    for (const [name, value] of resHeadersToSet) {
      res.setHeader(name, value)
    }

    res.status(status).send(response)
  })

  app.listen(7001, () => {
    // eslint-disable-next-line no-console
    console.log('server listening on 7001')
  })
}

if (import.meta.url.startsWith('file:')) {
  const modulePath = url.fileURLToPath(import.meta.url)
  if (process.argv[1] === modulePath) {
    void runServer()
  }
}
