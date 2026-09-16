'use client'

/**
 * 주보 인쇄 화면 (관리자 전용) — /bulletin/print?date=YYYY-MM-DD
 *
 * date 를 생략하면 가장 최근 주보를 가져옵니다.
 * 인쇄하면 A4 가로 2장이 나옵니다. 앞면 [4|1] · 뒷면 [2|3] → 반으로 접으면 A5 4쪽.
 *
 * 인쇄 설정: 용지 A4 / 방향 가로 / 배율 100% / 여백 없음 / 배경 그래픽 켜기
 *            양면은 "긴 쪽으로 넘기기(long edge)"
 */

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Lock, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../../../src/lib/supabase'
import { dbFetchBulletinByDate, dbFetchLatestBulletin, BulletinData } from '../../../src/lib/db'
import { normalizeBulletinContent } from '../../../src/lib/bulletinContent'
import BulletinView from '../../../src/components/bulletin/BulletinView'

type Gate = 'checking' | 'denied' | 'ok'

function BulletinPrintScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dateParam = searchParams.get('date') || ''

  const [gate, setGate] = useState<Gate>('checking')
  const [bulletin, setBulletin] = useState<BulletinData | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // 관리자 확인 → 주보 조회. 상태 변경은 모두 첫 await 뒤에만 일어납니다
    // (/analytics 의 verifyAuth 와 같은 이유 — 렌더 직후 동기 setState 방지).
    const run = async () => {
      const session = await supabase.auth.getSession()
        .then(r => r.data.session ?? null)
        .catch(() => null)

      if (!session?.user) {
        if (!cancelled) { setGate('denied'); setIsLoading(false) }
        return
      }

      const role = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()
        .then(r => r.data?.role ?? null, () => null)

      if (role !== 'ADMIN') {
        if (!cancelled) { setGate('denied'); setIsLoading(false) }
        return
      }
      if (cancelled) return
      setGate('ok')

      try {
        const row = dateParam
          ? await dbFetchBulletinByDate(dateParam)
          : await dbFetchLatestBulletin()
        if (cancelled) return
        setBulletin(row)
        if (!row) setLoadError(dateParam ? `${dateParam} 주보를 찾지 못했습니다.` : '아직 등록된 주보가 없습니다.')
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err ?? ''))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [dateParam])

  if (gate === 'checking' || isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3 text-slate-600">
        <RefreshCw size={26} className="animate-spin text-blue-500" />
        <p className="text-xs font-semibold">주보를 불러오는 중...</p>
      </div>
    )
  }

  if (gate === 'denied') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 w-full max-w-sm p-7 rounded-3xl shadow-lg text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto text-amber-600">
            <Lock size={26} />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">관리자 전용 화면</h1>
            <p className="text-xs text-slate-500 mt-1">
              주보 인쇄는 관리자(ADMIN) 권한으로 로그인해야 열 수 있습니다.
            </p>
          </div>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    )
  }

  // 구조화된 본문이 없는 주보(과거 스캔 이미지 방식)는 이 화면으로 인쇄할 수 없습니다.
  if (!bulletin?.content) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 w-full max-w-sm p-7 rounded-3xl shadow-lg text-center space-y-4">
          <h1 className="text-base font-bold text-slate-900">인쇄할 본문이 없습니다</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            {loadError || '이 주보는 사진으로 올린 주보입니다. 인쇄본은 앱에서 작성한 주보만 만들 수 있습니다.'}
          </p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
          >
            홈으로 이동
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bl-print-screen min-h-screen bg-slate-300">
      {/* 인쇄할 때는 사라지는 도구 막대 */}
      <div className="bl-toolbar sticky top-0 z-50 flex items-center gap-3 px-4 py-2.5 bg-slate-900 text-white">
        <button
          onClick={() => router.push('/')}
          className="p-1.5 bg-slate-800 rounded-lg hover:bg-slate-700 text-slate-300 cursor-pointer"
          aria-label="홈으로"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-bold truncate">주보 인쇄 · {bulletin.date}</p>
          <p className="text-2xs text-slate-400 truncate">
            A4 가로 / 여백 없음 / 배경 그래픽 켜기 / 양면 긴 쪽으로 넘기기
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-1.5 bg-white text-slate-900 text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-200 cursor-pointer"
        >
          <Printer size={14} />
          <span>인쇄</span>
        </button>
      </div>

      <div className="py-6 flex justify-center">
        <BulletinView content={normalizeBulletinContent(bulletin.content)} mode="print" />
      </div>

      {/* 도구 막대와 화면 배경은 종이에 찍히면 안 됩니다 */}
      <style>{`
        @media print {
          .bl-toolbar{display:none !important}
          .bl-print-screen{background:#fff !important;min-height:0 !important}
          .bl-print-screen > div{padding:0 !important}
        }
      `}</style>
    </div>
  )
}

export default function BulletinPrintPage() {
  // useSearchParams 를 쓰는 컴포넌트는 Suspense 로 감싸야 합니다 (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-500 text-xs">
          불러오는 중...
        </div>
      }
    >
      <BulletinPrintScreen />
    </Suspense>
  )
}
