import type {Awaitable} from '../types.js'

export interface DeserializedData<Value> {
  value: Value
  expires: number | undefined
}

export interface MapLike<Key, Value> {
  get(key: Key): Awaitable<Value | undefined>
  set(key: Key, value: Value): Awaitable<unknown>
  delete(key: Key): Awaitable<boolean>
  clear(): Awaitable<void>
}

export interface KeyvLike<Value> {
  get(key: Value): Awaitable<Value | undefined>
  set(key: Value, value: Value, expiryMs?: number): Awaitable<boolean | KeyvLike<Value>>
  delete(key: Value): Awaitable<boolean>
  clear(): Awaitable<void>
}
