'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Check, Copy, ChevronRight, FileText, Megaphone, CreditCard, Church, Info } from 'lucide-react'
import { UserProfile, PostItem, getUserDisplayName } from '../../lib/mockData'
import { getUpcomingSundays, bulletinDateToSortable, formatBulletinDisplay, todayLocalDateStr } from '../../lib/dateUtils'
import { dbFetchLatestBulletin, dbUpsertBulletin, dbFetchPosts, dbCreatePost, dbDeletePost } from '../../lib/db'
import { useCachedQuery } from '../../lib/dataCache'
import { uploadMultipleImagesToStorage } from '../../lib/storage'
import ChurchGuideModal from './ChurchGuideModal'
import ImageSlider from '../ImageSlider'

interface HomeTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  isGuest: boolean
}

const CHURCH_INFO = {
  vision: '"진리를 알지니 진리가 너희를 자유롭게 하리라" (요한복음 8:32)',
  intro: '더브릿지 교회는 하노이에서 함께 예배하며 말씀 안에서 자라가는 교회 공동체입니다.',
  address: '미딩 골든펠리스 지하1층 달팽이카페(K-Mart안쪽)',
}

export default function HomeTab({ currentUser, allUsers, isGuest }: HomeTabProps) {
  const [showChurchGuideModal, setShowChurchGuideModal] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [copied, setCopied] = useState(false)

  // 향후 1~2주 일요일 날짜 동적 계산
  const upcomingSundays = useMemo(() => getUpcomingSundays(2), [])

  // 주보 상태 (imageUrls 배열 기반)
  // 🐛 과거 버그: 개발용 예시 데이터(INITIAL_BULLETIN)로 초기화되어 있었습니다.
  // 주보를 아직 한 번도 안 올렸거나 조회에 실패하면, 홈 화면에 실제로 존재하지 않는
  // "김목사" 목사님의 8/9 설교와 외국 스톡 사진이 떴습니다. 로그인 안 한 방문자에게도요.
  // → 데이터가 없으면 null로 두고 "아직 등록된 주보가 없습니다"를 보여줍니다.
  const [bulletin, setBulletin] = useState<{
    date: string; title: string; preacher: string; passage: string; summary: string; imageUrls: string[]
  } | null>(null)
  const [showBulletinModal, setShowBulletinModal] = useState(false)
  const [activeBulletinImgIdx, setActiveBulletinImgIdx] = useState(0)

  // 주보 편집 모달 상태
  const [showBulletinEditModal, setShowBulletinEditModal] = useState(false)
  // 주보 날짜는 이제 'YYYY-MM-DD'로 저장합니다(화면 표시는 formatBulletinDisplay 사용).
  const [editBulletinDate, setEditBulletinDate] = useState('')
  const [editBulletinTitle, setEditBulletinTitle] = useState('')
  const [editBulletinPassage, setEditBulletinPassage] = useState('')
  const [editBulletinPreacher, setEditBulletinPreacher] = useState('')
  const [editBulletinSummary, setEditBulletinSummary] = useState('')
  const [editBulletinImages, setEditBulletinImages] = useState<string[]>([])
  const [isSavingBulletin, setIsSavingBulletin] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 공지 상태
  const [notices, setNotices] = useState<PostItem[]>([])
  const [showNoticeCreateModal, setShowNoticeCreateModal] = useState(false)
  const [selectedNoticeModal, setSelectedNoticeModal] = useState<PostItem | null>(null)
  const [newNoticeTitle, setNewNoticeTitle] = useState('')
  const [newNoticeContent, setNewNoticeContent] = useState('')

  // Supabase DB 주보 및 공지사항 로드 (다른 탭 갔다 와도 반복 조회하지 않도록 캐시 사용)
  const { data: latestBulletin } = useCachedQuery('bulletin:latest', () => dbFetchLatestBulletin())
  const { data: noticePosts } = useCachedQuery('posts:NOTICE', () => dbFetchPosts('NOTICE'))

  useEffect(() => {
    if (!latestBulletin) return
    setBulletin({
      date: latestBulletin.date,
      title: latestBulletin.title,
      preacher: latestBulletin.preacher,
      passage: latestBulletin.passage,
      summary: latestBulletin.summary,
      imageUrls: latestBulletin.imageUrls
    })
    // 구버전("8/17(일)")으로 저장된 값도 신형('YYYY-MM-DD')으로 바꿔서 편집칸에 넣습니다.
    setEditBulletinDate(bulletinDateToSortable(latestBulletin.date) || latestBulletin.date)
    setEditBulletinTitle(latestBulletin.title)
    setEditBulletinPassage(latestBulletin.passage)
    setEditBulletinPreacher(latestBulletin.preacher)
    setEditBulletinSummary(latestBulletin.summary)
    setEditBulletinImages(latestBulletin.imageUrls)
  }, [latestBulletin])

  useEffect(() => {
    if (noticePosts && noticePosts.length > 0) setNotices(noticePosts)
  }, [noticePosts])

  const showToast = (msg: string, duration = 1000) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), duration)
  }

  // 주보 이미지 파일 선택 (2~4장) - Supabase Storage 자동 업로드
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const selectedFiles = Array.from(files).slice(0, 4)
    showToast(`⏳ 주보 이미지 ${selectedFiles.length}장 업로드 중...`, 30000)
    try {
      const uploadedUrls = await uploadMultipleImagesToStorage(selectedFiles, 'bulletins')
      setEditBulletinImages(uploadedUrls)
      showToast('✅ 주보 이미지가 업로드되었습니다!', 2500)
    } catch (err: any) {
      // 🐛 과거 버그: 업로드가 실패해도 조용히 "이미지를 글자로 바꿔" 넣어버려서
      // DB에 수 MB짜리 덩어리가 저장되고, 사용자는 실패 사실도 몰랐습니다.
      showToast(`⚠️ ${err?.message || '이미지 업로드에 실패했습니다.'}`, 4000)
    } finally {
      // 같은 파일을 다시 선택할 수 있도록 초기화
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveBulletin = async () => {
    if (isSavingBulletin) return
    if (!editBulletinDate) {
      showToast('⚠️ 주보 날짜(주일)를 선택해 주세요.', 3000)
      return
    }
    const newBul = {
      date: editBulletinDate, // 'YYYY-MM-DD'
      title: editBulletinTitle,
      passage: editBulletinPassage,
      preacher: editBulletinPreacher,
      summary: editBulletinSummary,
      imageUrls: editBulletinImages,
    }
    setIsSavingBulletin(true)
    const res = await dbUpsertBulletin(newBul)
    setIsSavingBulletin(false)

    // 🐛 과거 버그: 저장 결과를 확인하지 않아, 실패해도 화면만 바뀌고
    // "✅ 저장되었습니다"가 떴습니다. 새로고침하면 원래대로 돌아갑니다.
    if (res.error) {
      showToast(`⚠️ 저장하지 못했습니다: ${res.error.message || ''}`, 4000)
      return
    }

    setBulletin(newBul)
    setActiveBulletinImgIdx(0)
    setShowBulletinEditModal(false)
    showToast('✅ 주보가 저장되었습니다!', 2500)
  }

  const handleDeleteNotice = async (noticeId: string) => {
    const target = notices.find(n => n.id === noticeId)
    // 🐛 과거 버그: 확인 창 없이 곧바로 삭제됐고, 실패해도 화면에서는 사라졌습니다.
    if (!confirm(`'${target?.title || '이 공지'}' 를 삭제할까요?\n삭제하면 되돌릴 수 없습니다.`)) return

    const res = await dbDeletePost(noticeId)
    if (res.error) {
      showToast(`⚠️ 삭제하지 못했습니다: ${res.error.message || ''}`, 4000)
      return
    }
    setNotices(prev => prev.filter(n => n.id !== noticeId))
    setSelectedNoticeModal(null)
    showToast('공지가 삭제되었습니다.', 2500)
  }

  const handleCreateNotice = async () => {
    if (!newNoticeTitle.trim() || !newNoticeContent.trim()) {
      // 🐛 과거 버그: 제목/내용이 비면 아무 반응 없이 조용히 무시했습니다.
      showToast('⚠️ 제목과 내용을 모두 입력해 주세요.', 3000)
      return
    }
    const newNoticeData: Partial<PostItem> = {
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
      title: newNoticeTitle.trim(),
      content: newNoticeContent.trim(),
      category: 'NOTICE',
    }
    const res = await dbCreatePost(newNoticeData)

    // 🐛 과거 버그: 저장 실패를 확인하지 않고, 실패했을 때 임시 id(`n_...`)를 붙여
    // 목록에 얹었습니다. 관리자는 등록됐다고 믿지만 아무도 그 공지를 볼 수 없습니다.
    if (res.error || !res.data?.id) {
      showToast(`⚠️ 공지를 등록하지 못했습니다: ${res.error?.message || ''}`, 4000)
      return
    }

    const newNotice: PostItem = {
      id: res.data.id,
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
      title: newNoticeTitle.trim(),
      content: newNoticeContent.trim(),
      category: 'NOTICE',
      createdAt: todayLocalDateStr(),
      likes: 0,
    }
    setNotices(prev => [newNotice, ...prev])
    setNewNoticeTitle('')
    setNewNoticeContent('')
    setShowNoticeCreateModal(false)
    showToast('✅ 신규 공지사항이 등록되었습니다!', 2500)
  }

  // 헌금계좌 숫자만 복사 + 1초 소멸 토스트
  // 🐛 과거 버그: navigator.clipboard는 카카오톡/네이버 인앱 브라우저처럼 보안 조건이
  // 다른 환경에서는 아예 없거나 실패합니다. 그런데 실패를 대비하지 않아서, 오류가 나면
  // 그 아래 줄(성공 표시/토스트)이 실행되지 않아 **버튼을 눌러도 아무 반응이 없었습니다.**
  const ACCOUNT_DIGITS = '100100299503'
  const handleCopyAccount = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(ACCOUNT_DIGITS)
      setCopied(true)
      showToast('📋 계좌번호가 복사되었습니다!', 2500)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast('복사가 지원되지 않는 브라우저입니다. 계좌번호를 길게 눌러 복사해 주세요.', 4000)
    }
  }

  return (
    <div className="space-y-5 pb-6">
      {/* 1초 소멸 토스트 */}
      {toastMsg && (
        <div className="fixed top-[88px] left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg z-50 pointer-events-none">
          {toastMsg}
        </div>
      )}

      {/* ─── 1. 교회소개 / 환영 섹션 ─── */}
      <section className="rounded-2xl overflow-hidden shadow-sm border border-blue-100 bg-white">
        {isGuest ? (
          <div className="bg-gradient-to-br from-[#335f87] to-[#1e3d5a] text-white p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Church size={20} className="text-blue-200" />
              <span className="text-xs font-bold text-blue-200 tracking-widest uppercase">The Bridge Church</span>
            </div>
            <h1 className="text-lg font-black leading-snug">더브릿지 교회에 오신 것을 환영합니다</h1>
            <p className="text-xs text-blue-100 leading-relaxed italic whitespace-pre-line">{CHURCH_INFO.vision}</p>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-[#335f87] via-[#2c5378] to-[#1d3a54] text-white p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Church size={18} className="text-blue-200" />
              <span className="text-[11px] font-bold text-blue-200 tracking-wider">더브릿지 공동체</span>
            </div>
            <h1 className="text-base font-black leading-snug">
              {getUserDisplayName(currentUser)} 환영합니다! 🙏
            </h1>
            <p className="text-xs text-blue-100 leading-relaxed">
              오늘도 주님의 평안과 은혜가 가득하시길 기도합니다.
            </p>
          </div>
        )}

        {/* 비로그인 전용: 교회 소개 + 주소 카드 */}
        {isGuest && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-line">{CHURCH_INFO.intro}</p>
            
            {/* 3번 요청사항: 주소 텍스트 아래에 지도/카톡 버튼을 별도 가로줄로 분리 배치 */}
            <div className="bg-[#f7f9ff] p-3.5 rounded-xl border border-blue-50 space-y-2.5">
              <div className="flex items-start gap-1.5">
                <span className="text-sm shrink-0">📍</span>
                <span className="text-xs font-bold text-gray-800 leading-relaxed whitespace-pre-line">
                  {CHURCH_INFO.address}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-blue-100/60">
                <a
                  href="https://maps.app.goo.gl/QmPUonpPZnpMxyum7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1 shadow-2xs transition-all"
                >
                  🗺️ 지도 보기
                </a>
                <a
                  href="https://open.kakao.com/o/sZaUR1Ii"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2 bg-[#fee500] hover:bg-[#fada0a] text-[#191919] text-xs font-bold rounded-lg flex items-center justify-center gap-1 shadow-2xs transition-all"
                >
                  💬 카톡 오픈채팅
                </a>
              </div>
            </div>

            <button onClick={() => setShowChurchGuideModal(true)}
              className="w-full py-2.5 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all">
              <Info size={14} /> 교회 안내 보기 <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* 로그인 성도 전용: 교회 안내 버튼만 노출 */}
        {!isGuest && (
          <div className="p-3 bg-gray-50">
            <button onClick={() => setShowChurchGuideModal(true)}
              className="w-full py-2 bg-white border border-gray-200 text-[#335f87] text-xs font-bold rounded-xl hover:bg-gray-100 flex items-center justify-center gap-1.5">
              <Info size={14} /> 더브릿지 교회 안내 (비전 · 연혁 · 예배시간) <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>

      {/* ─── 2. 공지사항 (세로 스크롤 + 자동 스크롤) ─── */}
      <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Megaphone size={18} /></span>
            <h2 className="font-bold text-gray-900 text-sm">교회 공지사항</h2>
          </div>
          {currentUser.role === 'ADMIN' && (
            <button onClick={() => setShowNoticeCreateModal(true)}
              className="text-[11px] bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-lg hover:bg-indigo-100">
              + 공지 작성
            </button>
          )}
        </div>
        {/* 자동 세로 스크롤 영역 */}
        <div className="max-h-52 overflow-y-auto space-y-2 pr-1 scroll-smooth">
          {notices.map((notice) => (
            <div key={notice.id} onClick={() => setSelectedNoticeModal(notice)}
              className="bg-gradient-to-br from-[#f7f9ff] to-white p-3.5 rounded-xl border border-blue-50 cursor-pointer hover:border-blue-200 transition-all flex items-center justify-between">
              <div className="space-y-0.5 flex-1 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#335f87] bg-blue-50 px-2 py-0.5 rounded-md">공지</span>
                  <h3 className="font-bold text-xs text-gray-800 line-clamp-1">{notice.title}</h3>
                </div>
                <p className="text-[11px] text-gray-400 line-clamp-2 whitespace-pre-line leading-relaxed mt-0.5">{notice.content}</p>
              </div>
              <span className="text-[10px] text-gray-400 font-mono shrink-0">{notice.createdAt}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 3. 이번 주 주보 ─── */}
      <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-amber-700 rounded-xl"><FileText size={18} /></span>
            <h2 className="font-bold text-gray-900 text-sm">이번 주 주보</h2>
          </div>
          <div className="flex items-center gap-2">
            {currentUser.role === 'ADMIN' && (
              <button onClick={() => {
                setEditBulletinDate(bulletinDateToSortable(bulletin?.date) || '')
                setEditBulletinTitle(bulletin?.title || '')
                setEditBulletinPassage(bulletin?.passage || '')
                setEditBulletinPreacher(bulletin?.preacher || '')
                setEditBulletinSummary(bulletin?.summary || '')
                setEditBulletinImages(bulletin?.imageUrls || [])
                setShowBulletinEditModal(true)
              }}
                className="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-lg hover:bg-amber-200">
                ✏️ {bulletin ? '주보 수정' : '주보 등록'}
              </button>
            )}
            {bulletin && (
              <span className="text-[11px] text-gray-400">{formatBulletinDisplay(bulletin.date)}</span>
            )}
          </div>
        </div>

        {bulletin ? (
          <>
            <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-gray-900 text-sm leading-snug">{bulletin.title}</h3>
                {bulletin.preacher && (
                  <span className="text-[11px] text-[#335f87] bg-blue-50 font-semibold px-2.5 py-0.5 rounded-full shrink-0">{bulletin.preacher}</span>
                )}
              </div>
              {bulletin.passage && <p className="text-xs text-amber-800 font-semibold">{bulletin.passage}</p>}
              {bulletin.summary && (
                <p className="text-xs text-gray-600 leading-relaxed pt-1 border-t border-gray-200/50 whitespace-pre-wrap">{bulletin.summary}</p>
              )}
            </div>

            <button onClick={() => { setActiveBulletinImgIdx(0); setShowBulletinModal(true) }}
              className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 flex items-center justify-center gap-1">
              주보 전체보기 <ChevronRight size={14} />
            </button>
          </>
        ) : (
          <div className="py-8 text-center text-xs text-gray-400">
            아직 등록된 주보가 없습니다.
          </div>
        )}
      </section>

      {/* ─── 4. 온라인 헌금 계좌 (로그인 성도 전용) ─── */}
      {!isGuest && (
        <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-2xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><CreditCard size={18} /></span>
            <h2 className="font-bold text-gray-900 text-sm">온라인 헌금 안내</h2>
          </div>
          <div className="flex items-center justify-between bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl">
            <span className="font-mono text-xs font-bold text-gray-800">우리은행 100-100-299503(예금주:임혜영)</span>
            <button onClick={handleCopyAccount}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${copied ? 'bg-emerald-600 text-white' : 'bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20'}`}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
        </section>
      )}

      {showChurchGuideModal && <ChurchGuideModal onClose={() => setShowChurchGuideModal(false)} />}

      {/* ─── 주보 전체보기 모달 (다중 이미지 슬라이드) ─── */}
      {showBulletinModal && bulletin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900">이번 주 주보</h3>
                <p className="text-xs text-gray-400">{formatBulletinDisplay(bulletin.date)}</p>
              </div>
              <button onClick={() => setShowBulletinModal(false)} className="text-gray-400 font-bold text-lg px-1">✕</button>
            </div>

            {/* 다중 이미지 슬라이드 */}
            {bulletin.imageUrls && bulletin.imageUrls.length > 0 && (
              <div className="space-y-2">
                {/* 주보 원본을 새 탭에서 열 수 있게 링크로 감쌌습니다.
                    작은 화면에서는 광고/헌금/일정 글씨를 읽을 수 없다는 지적을 반영 —
                    탭하면 브라우저 기본 확대 기능으로 크게 볼 수 있습니다. */}
                {/* 행사사진과 같은 부품(ImageSlider)을 씁니다 — 좌우로 밀거나 화살표로 넘길 수 있습니다.
                    예전에는 아래 "1면/2면" 버튼을 정확히 눌러야만 넘어갔습니다. */}
                <ImageSlider
                  images={bulletin.imageUrls}
                  index={activeBulletinImgIdx}
                  onIndexChange={setActiveBulletinImgIdx}
                  onImageClick={() => window.open(bulletin.imageUrls[activeBulletinImgIdx], '_blank', 'noopener,noreferrer')}
                  alt="주보"
                  maxHeightClass="max-h-[360px]"
                  bgClass="bg-gray-50"
                />
                <p className="text-[11px] text-center text-gray-400">사진을 탭하면 원본 크기로 크게 볼 수 있습니다</p>
                {bulletin.imageUrls.length > 1 && (
                  <div className="flex justify-center gap-1.5">
                    {bulletin.imageUrls.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveBulletinImgIdx(idx)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                          activeBulletinImgIdx === idx
                            ? 'bg-[#335f87] text-white shadow-xs'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {idx + 1}면
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}



            <button onClick={() => setShowBulletinModal(false)}
              className="w-full py-2.5 bg-[#335f87] text-white text-xs font-bold rounded-xl">닫기</button>
          </div>
        </div>
      )}

      {/* ─── 관리자 주보 편집 모달 (날짜 픽커 + 파일 업로드 2~4장) ─── */}
      {showBulletinEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-900">✏️ 주보 수정 (관리자)</h3>

            <div className="space-y-3 text-xs">
              {/* 주보 날짜: 향후 1~2주 일요일 버튼 선택 */}
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1.5">
                  주보 날짜 선택 (향후 1~2주 일요일)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {upcomingSundays.map((s) => (
                    <button
                      key={s.dateStr}
                      type="button"
                      onClick={() => setEditBulletinDate(s.dateStr)}
                      className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                        editBulletinDate === s.dateStr
                          ? 'bg-[#335f87] text-white border-[#335f87] shadow-sm'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {s.displayStr}
                    </button>
                  ))}
                </div>
              </div>

              {/* 주보 이미지 파일 업로드 (2~4장) */}
              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-1">
                  주보 이미지 업로드 (2~4장, 휴대폰 사진 직접 선택)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageFileChange}
                  className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
                />
                {editBulletinImages.length > 0 && (
                  <div className="flex gap-1.5 mt-2 overflow-x-auto">
                    {editBulletinImages.map((url, idx) => (
                      <div key={idx} className="relative shrink-0">
                        <img src={url} alt={`미리보기 ${idx+1}`} className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                        <button
                          type="button"
                          onClick={() => setEditBulletinImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold"
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-gray-400 mt-1">선택된 이미지: {editBulletinImages.length}장</p>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold">설교 제목</label>
                <input type="text" value={editBulletinTitle}
                  onChange={e => setEditBulletinTitle(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">성경 구절</label>
                <input type="text" value={editBulletinPassage}
                  onChange={e => setEditBulletinPassage(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">설교자</label>
                <input type="text" value={editBulletinPreacher}
                  onChange={e => setEditBulletinPreacher(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] text-gray-900 font-medium" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">설교 요약</label>
                <textarea rows={3} value={editBulletinSummary}
                  onChange={e => setEditBulletinSummary(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] resize-none text-gray-900 font-medium" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowBulletinEditModal(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleSaveBulletin}
                className="flex-1 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 공지 작성 모달 ─── */}
      {showNoticeCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-gray-900">📣 신규 공지 작성 (관리자)</h3>
            <div className="space-y-2 text-xs">
              <input type="text" placeholder="공지 제목 입력" value={newNoticeTitle}
                onChange={e => setNewNoticeTitle(e.target.value)}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none text-gray-900 font-medium" />
              <textarea rows={4} placeholder="공지 상세 내용 입력..." value={newNoticeContent}
                onChange={e => setNewNoticeContent(e.target.value)}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none text-gray-900 font-medium" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNoticeCreateModal(false)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded-xl">취소</button>
              <button onClick={handleCreateNotice}
                className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">공지 등록</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 공지 상세 모달 (관리자: 삭제 버튼 포함) ─── */}
      {selectedNoticeModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-sm text-gray-900">{selectedNoticeModal.title}</h3>
                <p className="text-[11px] text-gray-400">{selectedNoticeModal.createdAt}</p>
              </div>
              {currentUser.role === 'ADMIN' && (
                <button onClick={() => handleDeleteNotice(selectedNoticeModal.id)}
                  className="px-2 py-1 bg-rose-50 text-rose-600 text-[10px] font-bold rounded-lg hover:bg-rose-100">
                  🗑️ 삭제
                </button>
              )}
            </div>
            <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-700 leading-relaxed border border-gray-100 whitespace-pre-wrap">
              {selectedNoticeModal.content}
            </div>
            <button onClick={() => setSelectedNoticeModal(null)}
              className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-xl">닫기</button>
          </div>
        </div>
      )}
    </div>
  )
}
