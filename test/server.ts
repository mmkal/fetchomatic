export type TestServerHelpers = {
  readonly previousRequests: Request[]
  readonly previousResponses: Response[]
}

export type TestServerFixture = AsyncDisposable & {
  baseUrl: string
}

export type ServerDefinition = {
  fetch(request: Request): Response | Promise<Response>
}

export type TestServer = TestServerFixture & {
  helpers: TestServerHelpers
}

export type CreateServer = (serverDefinition: ServerDefinition) => Promise<TestServer>

export const createCreateServer = (
  startServer: (fetch: (request: Request) => Promise<Response>) => TestServerFixture | Promise<TestServerFixture>,
): CreateServer => {
  return async function createServer(serverDefinition) {
    const previousRequests: Request[] = []
    const previousResponses: Response[] = []
    const helpers: TestServerHelpers = {
      get previousRequests() {
        return previousRequests.slice()
      },
      get previousResponses() {
        return previousResponses.slice()
      },
    }

    const server = await startServer(async request => {
      const requestSnapshot = request.clone()

      try {
        const response = await serverDefinition.fetch(request)
        const finalResponse = response || new Response('No response from server definition', {status: 404})
        previousResponses.push(finalResponse.clone())
        return finalResponse
      } finally {
        previousRequests.push(requestSnapshot)
      }
    })
    return {...server, helpers}
  }
}
