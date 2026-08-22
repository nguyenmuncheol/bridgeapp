'use client'

import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react'

// ────────────────────────────────────────────────────────────────────────
// 아주 가벼운 클라이언트 데이터 캐싱 레이어 (React Query/SWR 미설치 환경 대응)
//
// 문제: 홈/우리소식/나눔/신청/마이페이지 탭은 각자 독립적으로 dbFetch*()를
// 호출합니다. 최상위 탭(app/page.tsx)은 조건부 렌더링으로 탭을 전환하므로
// 다른 탭으로 갔다 돌아오면 컴포넌트가 매번 새로 마운트되며, 같은 데이터를
// (예: 기도제목 PRAYER 게시글은 나눔 탭과 마이페이지 탭에서 각각, 식권 현황은
// 마이페이지와 관리자 CouponsTab에서 각각) 서버에 다시 요청하게 됩니다.
//
// 해결: 모듈 스코프의 공유 캐시(Map)에 키별로 최신 데이터를 보관합니다.
// - 같은 키를 요청하는 여러 컴포넌트가 동시에 마운트되면 네트워크 요청은
//   1번만 나갑니다(진행 중인 Promise 공유).
// - staleMs 이내에 재요청되면 캐시를 즉시 반환하고 네트워크 요청을 생략합니다.
// - 글쓰기/수정/삭제 등 뮤테이션 성공 후에는 invalidateCache(key)를 호출해
//   해당 키를 stale로 표시합니다. 다음에 그 데이터를 필요로 하는 컴포넌트가
//   마운트될 때(예: 다른 탭에서 돌아왔을 때) 최신 데이터를 다시 가져옵니다.
// ────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T | undefined
  error: unknown
  timestamp: number
  promise: Promise<T> | null
  subscribers: Set<() => void>
  /** 한 번이라도 조회를 시도했는지. 최초 로딩 상태를 정확히 판단하기 위해 필요합니다. */
  started: boolean
  /**
   * 무효화 및 스냅샷 버전 번호. notify/invalidateCache가 호출되면 1 증가합니다.
   * useSyncExternalStore가 이 버전을 감지해 화면을 안전하게 다시 그립니다.
   */
  version: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const DEFAULT_STALE_MS = 15_000 // 15초 이내 재방문은 네트워크 요청 없이 캐시 재사용

function getEntry<T>(key: string): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined
  if (!entry) {
    entry = { data: undefined, error: null, timestamp: 0, promise: null, subscribers: new Set(), started: false, version: 0 }
    cache.set(key, entry as CacheEntry<unknown>)
  }
  return entry
}

function notify(key: string) {
  const entry = cache.get(key)
  if (entry) {
    entry.version += 1
    entry.subscribers.forEach(fn => fn())
  }
}

/**
 * 로그아웃 시 호출합니다.
 *
 * 🔒 가족이 함께 쓰는 휴대폰에서 어머니가 로그아웃하고 아들이 로그인했을 때,
 * 화면이 새로 그려지기 전까지 어머니 세션에서 받아온 기도제목/식권 정보가
 * 잠깐 보일 수 있었습니다. 로그아웃 시 캐시를 통째로 비웁니다.
 */
export function clearCache() {
  cache.forEach(entry => {
    entry.data = undefined
    entry.error = null
    entry.timestamp = 0
    entry.started = false
    entry.version += 1
    entry.subscribers.forEach(fn => fn())
  })
  cache.clear()
}

// 캐시를 무시하고 강제로 다시 가져옵니다. 이미 진행 중인 요청이 있으면 그걸 재사용합니다.
function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = getEntry<T>(key)
  if (entry.promise) return entry.promise

  entry.started = true
  const startedVersion = entry.version

  const promise = fetcher()
    .then(data => {
      // 요청 도중 invalidateCache가 불렸다면 이 응답은 이미 낡은 것입니다.
      // 데이터는 반영하되 "최신"으로 표시하지 않아, 다음 마운트에서 다시 가져오게 합니다.
      const isStaleResponse = entry.version !== startedVersion
      entry.data = data
      entry.error = null
      entry.timestamp = isStaleResponse ? 0 : Date.now()
      entry.promise = null
      notify(key)
      return data
    })
    .catch(err => {
      entry.error = err
      entry.promise = null
      notify(key)
      throw err
    })
  entry.promise = promise
  // 요청 시작 사실을 알려 화면이 로딩 상태로 다시 그려지게 합니다.
  notify(key)
  return promise
}

/**
 * 다른 화면에서 데이터를 생성/수정/삭제한 뒤 호출합니다.
 * 정확한 키를 알면 그 키만, prefix만 알면(예: 'posts:') 해당 prefix로
 * 시작하는 모든 키를 stale 처리합니다. 실제 재요청은 다음 마운트 시 일어납니다.
 */
export function invalidateCache(keyOrPrefix: string, opts: { exact?: boolean } = {}) {
  if (opts.exact) {
    const entry = cache.get(keyOrPrefix)
    if (entry) {
      entry.timestamp = 0
      entry.version += 1
      entry.subscribers.forEach(fn => fn())
    }
    return
  }
  cache.forEach((entry, key) => {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      entry.timestamp = 0
      entry.version += 1
      entry.subscribers.forEach(fn => fn())
    }
  })
}

export interface UseCachedQueryResult<T> {
  data: T | undefined
  error: unknown
  isLoading: boolean
  refetch: () => Promise<T>
}

/**
 * dbFetch* 계열 함수를 감싸는 캐시 hook.
 * React 18/19 공식 useSyncExternalStore 패턴을 사용합니다.
 */
export function useCachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { staleMs?: number; enabled?: boolean } = {}
): UseCachedQueryResult<T> {
  const { staleMs = DEFAULT_STALE_MS, enabled = true } = opts
  const entry = getEntry<T>(key)
  const fetcherRef = useRef(fetcher)

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!enabled) return () => {}
      entry.subscribers.add(onStoreChange)
      return () => {
        entry.subscribers.delete(onStoreChange)
      }
    },
    [entry, enabled]
  )

  const getSnapshot = useCallback(() => entry.version, [entry])
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!enabled) return
    const isStale = Date.now() - entry.timestamp > staleMs
    if ((isStale || entry.data === undefined) && !entry.promise) {
      revalidate(key, fetcherRef.current)
    }
  }, [key, enabled, entry, staleMs])

  const isLoading = enabled && entry.data === undefined && entry.error === null && (!!entry.promise || !entry.started)

  return {
    data: entry.data,
    error: entry.error,
    isLoading,
    refetch: () => {
      const e = getEntry<T>(key)
      e.timestamp = 0
      e.version += 1
      e.promise = null
      return revalidate(key, fetcherRef.current)
    },
  }
}
