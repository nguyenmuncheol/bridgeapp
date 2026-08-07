'use client'

import { useState } from 'react'
import { Users, CheckCircle2, Phone, Plus, Lock, Calendar, Search, MapPin, Heart, ChevronLeft, ChevronRight, MessageSquare, Send, Check } from 'lucide-react'
import { UserProfile, INITIAL_USERS } from '../../lib/mockData'

interface LabriTabProps {
  currentUser: UserProfile
  allUsers: UserProfile[]
}

export default function LabriTab({ currentUser, allUsers }: LabriTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'attendance' | 'members'>('feed')

  // 라브리 권한 (가입 승인된 사람은 라브리 미정이어도 팀원/소통 열람 허용)
  const isLeader = currentUser.role === 'LEADER'
  const isAdmin = currentUser.role === 'ADMIN'
  const isLeaderOrAdmin = isLeader || isAdmin

  // 소통 게시판 피드 및 댓글 데이터
  const [posts, setPosts] = useState([
    {
      id: 'lp1',
      author: '이리더',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      content: '이번 주 주일 라브리 모임은 예배 후 2층 비전홀에서 진행됩니다! 늦지 않게 모여주세요. 😊',
      createdAt: '2026-08-05 14:00',
      comments: [
        { id: 'lc1', author: '박성도', content: '네, 준비해서 2층에서 뵙겠습니다!', createdAt: '2026-08-05 14:30' }
      ]
    }
  ])
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [newPostContent, setNewPostContent] = useState('')
  const [showWriteModal, setShowWriteModal] = useState(false)

  // 피드 댓글 등록
  const handleAddComment = (postId: string) => {
    const text = commentInputs[postId]
    if (!text || !text.trim()) return

    setPosts(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [
            ...p.comments,
            {
              id: `lc_${Date.now()}`,
              author: currentUser.name,
              content: text,
              createdAt: '방금 전'
            }
          ]
        }
      }
      return p
    }))

    setCommentInputs(prev => ({ ...prev, [postId]: '' }))
  }

  // 피드 새 글 작성
  const handleAddPost = () => {
    if (!newPostContent.trim()) return
    setPosts(prev => [
      {
        id: `lp_${Date.now()}`,
        author: currentUser.name,
        authorAvatar: currentUser.avatarUrl || '',
        content: newPostContent,
        createdAt: '방금 전',
        comments: []
      },
      ...prev
    ])
    setNewPostContent('')
    setShowWriteModal(false)
  }

  // -------------------------------------------------------------
  // 2. 출석 관리 (과거 달력 확인 + 리더/관리자 모드)
  // -------------------------------------------------------------
  const [selectedCalendarDate, setSelectedCalendarDate] = useState('2026-08-02')
  
  // 리더/관리자 출석 체크 전용 선택 상태 (기본선택 없음 -> null)
  const [adminLabriFilter, setAdminLabriFilter] = useState<string>(currentUser.labriId || '1라브리')
  const [attendanceSelections, setAttendanceSelections] = useState<Record<string, 'ATTEND' | 'ABSENT' | null>>({})
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({})
  const [isAttendanceSubmitted, setIsAttendanceSubmitted] = useState(false)

  // 리더/관리자 출석체크 대상 성도
  const targetMembers = allUsers.filter(u => 
    u.role !== 'PENDING' && 
    (isAdmin ? (adminLabriFilter === '전체' || u.labriId === adminLabriFilter) : u.labriId === currentUser.labriId)
  )

  // 버튼 클릭 핸들러
  const handleSelectStatus = (userId: string, status: 'ATTEND' | 'ABSENT') => {
    setAttendanceSelections(prev => ({ ...prev, [userId]: status }))
  }

  // 모든 대상 성도의 출석체크 버튼 선택 완료 여부
  const isAllChecked = targetMembers.length > 0 && targetMembers.every(u => attendanceSelections[u.id] != null)

  const handleSubmitAttendance = () => {
    if (!isAllChecked) return
    setIsAttendanceSubmitted(true)
    alert(`${selectedCalendarDate} 주일 출석체크 제출이 완료되었습니다!`)
  }

  // -------------------------------------------------------------
  // 3. 주소록 (내 라브리 vs 전체 필터 + 주소 + 가족현황)
  // -------------------------------------------------------------
  const [memberFilter, setMemberFilter] = useState<'my' | 'all'>('my')
  const [searchTerm, setSearchTerm] = useState('')

  const displayedMembers = allUsers.filter(u => {
    if (u.role === 'PENDING') return false
    if (memberFilter === 'my' && currentUser.labriId && u.labriId !== currentUser.labriId) return false
    if (searchTerm) {
      return (
        u.name.includes(searchTerm) ||
        u.duty.includes(searchTerm) ||
        (u.labriId && u.labriId.includes(searchTerm)) ||
        (u.address && u.address.includes(searchTerm))
      )
    }
    return true
  })

  return (
    <div className="space-y-4 pb-6">
      {/* 라브리 상단 헤더 */}
      <div className="bg-gradient-to-r from-[#335f87] to-[#4e78a1] text-white p-5 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold bg-white/20 px-2.5 py-0.5 rounded-full text-white/90">
              소속 공동체
            </span>
            <h1 className="text-xl font-bold mt-1">{currentUser.labriId || '라브리 미정'}</h1>
          </div>
          <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-xs">
            <Users size={20} />
          </div>
        </div>
      </div>

      {/* 탭 메뉴: [소통 게시판] | [주일 출석 (리더/관리자만)] | [우리 팀원] */}
      <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('feed')}
          className={`flex-1 py-2 rounded-lg transition-all ${
            activeSubTab === 'feed' ? 'bg-[#335f87] text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          소통 게시판
        </button>
        
        {/* 주일 출석 탭은 리더 및 관리자에게만 노출 */}
        {isLeaderOrAdmin && (
          <button
            onClick={() => setActiveSubTab('attendance')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              activeSubTab === 'attendance' ? 'bg-[#335f87] text-white' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            주일 출석체크
          </button>
        )}

        <button
          onClick={() => setActiveSubTab('members')}
          className={`flex-1 py-2 rounded-lg transition-all ${
            activeSubTab === 'members' ? 'bg-[#335f87] text-white' : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          우리 팀원 (주소록)
        </button>
      </div>

      {/* 1. 소통 게시판 탭 */}
      {activeSubTab === 'feed' && (
        <div className="space-y-3 relative min-h-[250px]">
          {posts.map((post) => (
            <div key={post.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#335f87] font-bold flex items-center justify-center text-xs">
                  {post.author.slice(0, 1)}
                </div>
                <div>
                  <span className="font-bold text-xs text-gray-900">{post.author}</span>
                  <p className="text-[10px] text-gray-400">{post.createdAt}</p>
                </div>
              </div>

              <p className="text-xs text-gray-700 leading-relaxed bg-gray-50/60 p-3 rounded-xl">
                {post.content}
              </p>

              {/* 댓글 목록 */}
              <div className="pt-2 border-t border-gray-100 space-y-2 text-xs">
                {post.comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 p-2 rounded-lg space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className="font-bold text-gray-800">{c.author}</span>
                      <span className="text-gray-400">{c.createdAt}</span>
                    </div>
                    <p className="text-gray-600 text-[11px]">{c.content}</p>
                  </div>
                ))}

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="댓글 작성..."
                    value={commentInputs[post.id] || ''}
                    onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                    className="flex-1 text-xs px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none"
                  />
                  <button
                    onClick={() => handleAddComment(post.id)}
                    className="px-3 py-1.5 bg-[#335f87] text-white text-xs font-bold rounded-xl shrink-0"
                  >
                    작성
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 우측 하단 플로팅 글쓰기 버튼 */}
          <button
            onClick={() => setShowWriteModal(true)}
            className="fixed bottom-20 right-6 sm:right-[calc(50%-200px)] bg-[#914c24] text-white p-3.5 rounded-full shadow-lg hover:bg-[#763710] transition-all z-40"
          >
            <Plus size={22} />
          </button>
        </div>
      )}

      {/* 2. 주일 출석 탭 (리더/관리자 모드 + 본인 출석 히스토리) */}
      {activeSubTab === 'attendance' && isLeaderOrAdmin && (
        <div className="space-y-4">
          {/* 과거 출석 기록 날짜 선택 */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-xs text-gray-900">주일 출석체크 작성 및 조회</h2>
              <select
                value={selectedCalendarDate}
                onChange={(e) => setSelectedCalendarDate(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 p-1.5 rounded-lg font-bold text-[#335f87]"
              >
                <option value="2026-08-09">2026년 8월 9일 (금주)</option>
                <option value="2026-08-02">2026년 8월 2일 (전주)</option>
                <option value="2026-07-26">2026년 7월 26일</option>
              </select>
            </div>

            {/* 관리자 권한 시 라브리 드롭박스 필터 제공 */}
            {isAdmin && (
              <div className="p-2.5 bg-slate-900 text-white rounded-xl flex items-center justify-between text-xs">
                <span className="font-bold">관리자 라브리 선택:</span>
                <select
                  value={adminLabriFilter}
                  onChange={(e) => setAdminLabriFilter(e.target.value)}
                  className="bg-slate-800 text-amber-300 font-bold p-1 rounded-lg border border-slate-700"
                >
                  <option value="1라브리">1라브리</option>
                  <option value="2라브리">2라브리</option>
                  <option value="3라브리">3라브리</option>
                  <option value="전체">전체 라브리 성도</option>
                </select>
              </div>
            )}

            {/* 성도별 출석체크 선택 리스트 (기본 선택 없음 -> 버튼 눌러야 함) */}
            <div className="space-y-2.5 pt-2">
              {targetMembers.map((member) => {
                const selectedStatus = attendanceSelections[member.id]
                return (
                  <div key={member.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-gray-900">{member.name}</span>
                        <span className="text-[10px] text-gray-400">{member.duty}</span>
                      </div>

                      {/* 버튼 선택 (초기값 null) */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleSelectStatus(member.id, 'ATTEND')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            selectedStatus === 'ATTEND'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-white border border-gray-200 text-gray-500 hover:bg-emerald-50'
                          }`}
                        >
                          출석
                        </button>
                        <button
                          onClick={() => handleSelectStatus(member.id, 'ABSENT')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                            selectedStatus === 'ABSENT'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-white border border-gray-200 text-gray-500 hover:bg-rose-50'
                          }`}
                        >
                          결석
                        </button>
                      </div>
                    </div>

                    {selectedStatus === 'ABSENT' && (
                      <input
                        type="text"
                        placeholder="결석 사유 입력 (예: 출장, 병가 등)"
                        value={attendanceNotes[member.id] || ''}
                        onChange={(e) => setAttendanceNotes({ ...attendanceNotes, [member.id]: e.target.value })}
                        className="w-full text-xs p-2 bg-white rounded-lg border border-rose-200 focus:outline-none"
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* 리스트 하단 제출 버튼 */}
            <button
              disabled={!isAllChecked}
              onClick={handleSubmitAttendance}
              className={`w-full py-3 rounded-xl text-xs font-bold transition-all shadow-sm ${
                isAllChecked
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isAllChecked ? '출석체크 제출하기' : '모든 성도의 출석/결석을 선택해주세요'}
            </button>
          </div>
        </div>
      )}

      {/* 3. 우리 팀원 (주소록 - 주소 & 가족현황 연동) */}
      {activeSubTab === 'members' && (
        <div className="space-y-3">
          {/* 드롭박스 또는 선택 스위치 (내 라브리 | 전체 라브리) */}
          <div className="flex bg-white p-1 rounded-xl border border-gray-100 text-xs font-medium">
            <button
              onClick={() => setMemberFilter('my')}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                memberFilter === 'my' ? 'bg-gray-100 text-[#335f87] font-bold' : 'text-gray-400'
              }`}
            >
              내 소속 라브리 ({currentUser.labriId || '미정'})
            </button>
            <button
              onClick={() => setMemberFilter('all')}
              className={`flex-1 py-1.5 rounded-lg transition-all ${
                memberFilter === 'all' ? 'bg-gray-100 text-[#335f87] font-bold' : 'text-gray-400'
              }`}
            >
              전체 성도 주소록
            </button>
          </div>

          {/* 검색창 */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="이름, 직분, 주소 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none"
            />
          </div>

          {/* 성도 카드 리스트 */}
          <div className="space-y-2.5">
            {displayedMembers.map((member) => (
              <div key={member.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900">{member.name}</span>
                      <span className="text-[10px] bg-blue-50 text-[#335f87] font-semibold px-2 py-0.5 rounded-full">
                        {member.duty}
                      </span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {member.labriId || '라브리미정'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-1">{member.phone}</p>
                  </div>

                  <a
                    href={`tel:${member.phone}`}
                    className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-all text-xs font-bold flex items-center gap-1"
                  >
                    <Phone size={14} /> 전화
                  </a>
                </div>

                {/* 주소 및 가족현황 표시 */}
                <div className="pt-2 border-t border-gray-50 grid grid-cols-1 gap-1 text-[11px] text-gray-600">
                  {member.address && (
                    <div className="flex items-center gap-1 text-gray-500">
                      <MapPin size={12} className="text-[#335f87] shrink-0" />
                      <span>{member.address}</span>
                    </div>
                  )}
                  {member.familyInfo && (
                    <div className="flex items-center gap-1 text-amber-800 bg-amber-50/60 px-2 py-1 rounded-lg">
                      <Users size={12} className="text-amber-600 shrink-0" />
                      <span>가족현황: <strong>{member.familyInfo}</strong></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 글쓰기 모달 */}
      {showWriteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-sm text-gray-900">라브리 소통 글쓰기</h3>
            <textarea
              rows={4}
              placeholder="라브리 식구들과 나누고 싶은 소식을 적어주세요."
              value={newPostContent}
              onChange={(e) => setNewPostContent(e.target.value)}
              className="w-full text-xs p-3 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowWriteModal(false)} className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl">취소</button>
              <button onClick={handleAddPost} className="flex-1 py-2 bg-[#335f87] text-white text-xs font-bold rounded-xl">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
