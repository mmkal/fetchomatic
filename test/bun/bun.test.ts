// @ts-ignore
import { test, expect } from 'bun:test';
import {createTestSuite} from '../suite'

createTestSuite({
    test: (title, fn) => {
        if (title === 'timeout') return // AbortSignal doesn't work: https://github.com/oven-sh/bun/issues/2489
        test(title, fn)
    },
    expect,
    fetch
})
