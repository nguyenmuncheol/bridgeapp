'use client'

import { useEffect, useRef, useState } from 'react'
import { PostItem } from './mockData'
import { dbFetchPostsPage } from './db'

export interface UsePaginatedPostsResult {
  items: PostItem[]
  // 좋아요/댓글/수정/삭제 등 화면에서 바로 목록을 갱신해야 할 때(낙관적 UI) 그대로 사용
  setItems: React.Dispatch<React.SetStateAction<PostItem[]>>
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  /** 불러오기에 실패했을 때의 메시지. 화면은 빈 목록과 반드시 구분해서 보여줘야 합니다. */
  error: string | null
  loadMore: () => void
  /** 실패 후 "다시 시도" 버튼용 */
  retry: () => void
}

/**
 * "더보기" 버튼으로 게시글을 20개씩 끊어 불러오는 훅.
 * 게시글이 많이 쌓이는 화면(교우소식/기도제목/행사사진 등)에서, 카테고리 전체를 한 번에
 * 불러오던 기존 방식(dbFetchPosts) 대신 사용합니다.
 */
export function usePaginatedPosts(
  category: string,
  opts: { limit?: number; tag?: string | null } = {}
): UsePaginatedPostsResult {
  const limit = opts.limit ?? 20
  // 태그가 바뀌면 서버에 다시 물어봅니다('전체'는 필터 없음).
  const tag = opts.tag && opts.tag !== '전체' ? opts.tag : null
  const [items, setItems] = useState<PostItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  // 🐛 예전엔 effect 가 시작하자마자 setIsLoading(true)/setError(null) 을 불렀습니다.
  //    React 는 effect 안의 즉시 setState 를 "한 번 그린 뒤 곧바로 다시 그리는" 낭비로 보고
  //    경고합니다. 실제로도 카테고리를 바꾸면 옛 목록이 한 프레임 비쳤습니다.
  // → 지금 보여주는 목록이 "어느 요청의 결과인지"를 키로 들고 있다가, 요청 키가 달라지면
  //   그 자체로 로딩 중이라고 판단합니다. 카테고리를 바꾸는 순간 바로 로딩 상태가 됩니다.
  const requestKey = `${category}|${limit}|${tag ?? ''}|${reloadToken}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null)

  const isLoading = loadedKey !== requestKey
  // 오류도 요청 키와 함께 들고 있어야, 다른 카테고리로 옮겼을 때 남의 오류가 따라오지 않습니다.
  const error = errorState && errorState.key === requestKey ? errorState.message : null

  const cursorRef = useRef<string | null>(null)
  // 상태(state)가 아니라 ref로 막아야 같은 순간에 두 번 눌려도 확실히 걸러집니다.
  const inFlightRef = useRef(false)

  // 이미 목록에 있는 글은 다시 넣지 않습니다.
  const appendUnique = (prev: PostItem[], incoming: PostItem[]) => {
    const seen = new Set(prev.map(p => p.id))
    return [...prev, ...incoming.filter(p => !seen.has(p.id))]
  }

  useEffect(() => {
    let cancelled = false
    cursorRef.current = null

    dbFetchPostsPage(category, { limit, tag })
      .then(res => {
        if (cancelled) return
        setItems(res.items)
        cursorRef.current = res.nextCursor
        setHasMore(!!res.nextCursor)
        setLoadedKey(requestKey)
      })
      .catch(err => {
        if (cancelled) return
        setErrorState({ key: requestKey, message: err?.message || '목록을 불러오지 못했습니다.' })
        // 실패도 "이 요청은 끝났다"로 쳐야 로딩 표시가 멈추고 오류 화면이 보입니다.
        setLoadedKey(requestKey)
      })

    return () => { cancelled = true }
  }, [category, limit, tag, requestKey])

  const loadMore = () => {
    if (inFlightRef.current || !cursorRef.current) return
    inFlightRef.current = true
    setIsLoadingMore(true)
    setErrorState(null)

    dbFetchPostsPage(category, { limit, tag, cursor: cursorRef.current })
      .then(res => {
        setItems(prev => appendUnique(prev, res.items))
        cursorRef.current = res.nextCursor
        setHasMore(!!res.nextCursor)
      })
      .catch(err => {
        setErrorState({ key: requestKey, message: err?.message || '더 불러오지 못했습니다.' })
      })
      .finally(() => {
        inFlightRef.current = false
        setIsLoadingMore(false)
      })
  }

  const retry = () => {
    // reloadToken 이 바뀌면 requestKey 가 바뀌고, 그것만으로 로딩 상태가 됩니다.
    setErrorState(null)
    setReloadToken(t => t + 1)
  }

  return { items, setItems, isLoading, isLoadingMore, hasMore, error, loadMore, retry }
}
