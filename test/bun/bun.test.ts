// @ts-ignore
import { test, expect } from 'bun:test';
import {createTestSuite} from '../suite'
import {fetchomatic, retry} from '../../src'
import {testServerFetch} from '../server'

const createServer = async () => {
    const server = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        fetch: testServerFetch,
    })

    return {
        baseUrl: `http://127.0.0.1:${server.port}`,
        async [Symbol.asyncDispose]() {
            await server.stop()
        },
    }
}

createTestSuite({
    test: (title, fn) => {
        if (title === 'timeout') return // AbortSignal doesn't work: https://github.com/oven-sh/bun/issues/2489
        test(title, fn)
    },
    expect,
    fetch,
    fetchomatic,
    retry,
    createServer,
})
