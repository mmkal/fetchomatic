import type {Awaitable} from '../types.ts'

export interface DeserializedData<Value> {
  value: Value
  expires: number | undefined
}

export interface KeyvLike<Value> {
  get(key: Value): Awaitable<Value | undefined>
  set(key: Value, value: Value, expiryMs?: number): Awaitable<boolean | KeyvLike<Value>>
  delete(key: Value): Awaitable<boolean>
  clear(): Awaitable<void>
}
