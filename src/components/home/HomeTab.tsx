'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Check, Copy, ChevronRight, FileText, Megaphone, CreditCard, Church, Info } from 'lucide-react'
import { INITIAL_BULLETIN, INITIAL_NOTICES, UserProfile, PostItem, getUserDisplayName } from '../../lib/mockData'
import { getUpcomingSundays } from '../../lib/dateUtils'
import { dbFetchLatestBulletin, dbUpsertBulletin, dbFetchPosts, dbCreatePost, dbDeletePost } from '../../lib/db'
import { uploadMultipleImagesToStorage } from '../../lib/storage'
import ChurchGuideModal from './ChurchGuideModal'

interface HomeTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
  isGuest: boolean
}

const CHURCH_INFO = {
  vision: '"진리를 알지니 진리가 너희를 자유롭게 하리라" (요한복음 8:32)',
  intro: '더브릿지 교회는 하노이에서 함께 예배하며 말씀 안에서 자라가는 교회 공동체입니다.',
  address: '하노이 미딩 골든펠리스 지하1층 달팽이카페(K-Mart안쪽)',
}

export default function HomeTab({ currentUser, allUsers, isGuest }: HomeTabProps) {
  const [showChurchGuideModal, setShowChurchGuideModal] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [copied, setCopied] = useState(false)

  // 향후 1~2주 일요일 날짜 동적 계산
  const upcomingSundays = useMemo(() => getUpcomingSundays(2), [])

  // 주보 상태 (imageUrls 배열 기반)
  const [bulletin, setBulletin] = useState({
    ...INITIAL_BULLETIN,
    imageUrls: INITIAL_BULLETIN.imageUrls || [],
  })
  const [showBulletinModal, setShowBulletinModal] = useState(false)
  const [activeBulletinImgIdx, setActiveBulletinImgIdx] = useState(0)

  // 주보 편집 모달 상태
  const [showBulletinEditModal, setShowBulletinEditModal] = useState(false)
  const [editBulletinDate, setEditBulletinDate] = useState(bulletin.date)
  const [editBulletinTitle, setEditBulletinTitle] = useState(bulletin.title)
  const [editBulletinPassage, setEditBulletinPassage] = useState(bulletin.passage)
  const [editBulletinPreacher, setEditBulletinPreacher] = useState(bulletin.preacher)
  const [editBulletinSummary, setEditBulletinSummary] = useState(bulletin.summary)
  const [editBulletinImages, setEditBulletinImages] = useState<string[]>(bulletin.imageUrls)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 공지 상태
  const [notices, setNotices] = useState<PostItem[]>([])
  const [showNoticeCreateModal, setShowNoticeCreateModal] = useState(false)
  const [selectedNoticeModal, setSelectedNoticeModal] = useState<PostItem | null>(null)
  const [newNoticeTitle, setNewNoticeTitle] = useState('')
  const [newNoticeContent, setNewNoticeContent] = useState('')

  // Supabase DB 주보 및 공지사항 로드
  useEffect(() => {
    dbFetchLatestBulletin().then(dbBul => {
      if (dbBul) {
        setBulletin({
          date: dbBul.date,
          title: dbBul.title,
          preacher: dbBul.preacher,
          passage: dbBul.passage,
          summary: dbBul.summary,
          imageUrls: dbBul.imageUrls
        })
        setEditBulletinDate(dbBul.date)
        setEditBulletinTitle(dbBul.title)
        setEditBulletinPassage(dbBul.passage)
        setEditBulletinPreacher(dbBul.preacher)
        setEditBulletinSummary(dbBul.summary)
        setEditBulletinImages(dbBul.imageUrls)
      }
    })

    dbFetchPosts('NOTICE').then(dbNotices => {
      if (dbNotices && dbNotices.length > 0) {
        setNotices(dbNotices)
      }
    })
  }, [])

  const showToast = (msg: string, duration = 1000) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), duration)
  }

  // 주보 이미지 파일 선택 (2~4장) - Supabase Storage 자동 업로드
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    showToast('⏳ 주보 이미지 업로드 중...', 2000)
    const selectedFiles = Array.from(files).slice(0, 4)
    const uploadedUrls = await uploadMultipleImagesToStorage(selectedFiles, 'bulletins')
    setEditBulletinImages(uploadedUrls)
    showToast('✅ 주보 이미지가 성공적으로 업로드되었습니다!')
  }

  const handleSaveBulletin = async () => {
    const newBul = {
      date: editBulletinDate,
      title: editBulletinTitle,
      passage: editBulletinPassage,
      preacher: editBulletinPreacher,
      summary: editBulletinSummary,
      imageUrls: editBulletinImages,
    }
    await dbUpsertBulletin(newBul)
    setBulletin(newBul)
    setActiveBulletinImgIdx(0)
    setShowBulletinEditModal(false)
    showToast('✅ 주보 내용 및 이미지가 저장되었습니다!')
  }

  const handleDeleteNotice = async (noticeId: string) => {
    await dbDeletePost(noticeId)
    setNotices(prev => prev.filter(n => n.id !== noticeId))
    setSelectedNoticeModal(null)
    showToast('공지가 삭제되었습니다.')
  }

  const handleCreateNotice = async () => {
    if (!newNoticeTitle.trim() || !newNoticeContent.trim()) return
    const newNoticeData: Partial<PostItem> = {
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
      title: newNoticeTitle.trim(),
      content: newNoticeContent.trim(),
      category: 'NOTICE',
    }
    const res = await dbCreatePost(newNoticeData)
    const newNotice: PostItem = {
      id: res.data?.id || `n_${Date.now()}`,
      authorId: currentUser.id,
      authorName: getUserDisplayName(currentUser),
      title: newNoticeTitle.trim(),
      content: newNoticeContent.trim(),
      category: 'NOTICE',
      createdAt: new Date().toISOString().slice(0, 10),
      likes: 0,
    }
    setNotices(prev => [newNotice, ...prev])
    setNewNoticeTitle('')
    setNewNoticeContent('')
    setShowNoticeCreateModal(false)
    showToast('✅ 신규 공지사항이 등록되었습니다!')
  }

  // 헌금계좌 숫자만 복사 + 1초 소멸 토스트
  const handleCopyAccount = () => {
    navigator.clipboard.writeText('100100299503')
    setCopied(true)
    showToast('📋 계좌번호가 복사되었습니다!')
    setTimeout(() => setCopied(false), 1000)
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
                setEditBulletinDate(bulletin.date)
                setEditBulletinTitle(bulletin.title)
                setEditBulletinPassage(bulletin.passage)
                setEditBulletinPreacher(bulletin.preacher)
                setEditBulletinSummary(bulletin.summary)
                setEditBulletinImages(bulletin.imageUrls)
                setShowBulletinEditModal(true)
              }}
                className="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-lg hover:bg-amber-200">
                ✏️ 주보 수정
              </button>
            )}
            <span className="text-[11px] text-gray-400">{bulletin.date}</span>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-100">
          <div className="flex items-start justify-between">
            <h3 className="font-bold text-gray-900 text-sm leading-snug">{bulletin.title}</h3>
            <span className="text-[11px] text-[#335f87] bg-blue-50 font-semibold px-2.5 py-0.5 rounded-full shrink-0">{bulletin.preacher}</span>
          </div>
          <p className="text-xs text-amber-800 font-semibold">{bulletin.passage}</p>
          <p className="text-xs text-gray-600 leading-relaxed pt-1 border-t border-gray-200/50 whitespace-pre-wrap">{bulletin.summary}</p>
        </div>

        <button onClick={() => { setActiveBulletinImgIdx(0); setShowBulletinModal(true) }}
          className="w-full py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-xl hover:bg-gray-200 flex items-center justify-center gap-1">
          주보 전체보기 <ChevronRight size={14} />
        </button>
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
      {showBulletinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900">이번 주 주보</h3>
                <p className="text-xs text-gray-400">{bulletin.date}</p>
              </div>
              <button onClick={() => setShowBulletinModal(false)} className="text-gray-400 font-bold text-lg px-1">✕</button>
            </div>

            {/* 다중 이미지 슬라이드 */}
            {bulletin.imageUrls && bulletin.imageUrls.length > 0 && (
              <div className="space-y-2">
                <div className="rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center min-h-[200px]">
                  <img
                    src={bulletin.imageUrls[activeBulletinImgIdx]}
                    alt={`주보 ${activeBulletinImgIdx + 1}면`}
                    className="w-full h-auto object-contain max-h-[360px]"
                  />
                </div>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                      onClick={() => setEditBulletinDate(s.displayStr)}
                      className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                        editBulletinDate === s.displayStr
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
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87]" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">성경 구절</label>
                <input type="text" value={editBulletinPassage}
                  onChange={e => setEditBulletinPassage(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87]" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">설교자</label>
                <input type="text" value={editBulletinPreacher}
                  onChange={e => setEditBulletinPreacher(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87]" />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 font-bold">설교 요약</label>
                <textarea rows={3} value={editBulletinSummary}
                  onChange={e => setEditBulletinSummary(e.target.value)}
                  className="w-full mt-1 p-2 bg-gray-50 rounded-lg border border-gray-200 focus:outline-none focus:border-[#335f87] resize-none" />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl">
            <h3 className="font-bold text-sm text-gray-900">📣 신규 공지 작성 (관리자)</h3>
            <div className="space-y-2 text-xs">
              <input type="text" placeholder="공지 제목 입력" value={newNoticeTitle}
                onChange={e => setNewNoticeTitle(e.target.value)}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none" />
              <textarea rows={4} placeholder="공지 상세 내용 입력..." value={newNoticeContent}
                onChange={e => setNewNoticeContent(e.target.value)}
                className="w-full p-2.5 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none resize-none" />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
