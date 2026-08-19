'use client'

import { UserProfile, getSimpleUserName, KAKAO_OPEN_CHAT_URL } from '../../lib/mockData'

interface WelcomeModalProps {
  currentUser: UserProfile
  onClose: () => void
}

/**
 * 가입이 승인된 뒤 **처음 앱에 들어왔을 때 딱 한 번** 뜨는 환영 화면.
 *
 * "봤다"는 기록을 기기가 아니라 **계정에 남깁니다**(profiles.welcomed_at).
 * 기기에만 저장하면 폰을 바꾸거나 앱을 지웠을 때 또 뜹니다.
 */
export default function WelcomeModal({ currentUser, onClose }: WelcomeModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xs w-full p-6 text-center space-y-4 shadow-2xl animate-fade-in">
        <div className="text-5xl">🎉</div>

        <div className="space-y-1.5">
          <h2 className="font-black text-lg text-[#335f87]">
            환영합니다, {getSimpleUserName(currentUser)}!
          </h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            더브릿지교회 앱 가입이 승인되었습니다.<br />
            이제 <strong>소식 · 나눔 · 신청</strong>을 모두 이용하실 수 있습니다.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl p-3 text-left space-y-1.5">
          <p className="text-[11px] font-bold text-gray-700">이렇게 시작해 보세요</p>
          <ul className="text-[11px] text-gray-500 leading-relaxed space-y-0.5">
            <li>📅 <strong>우리소식</strong> — 교회 일정과 주소록</li>
            <li>🙏 <strong>나눔</strong> — 기도제목과 행사사진</li>
            <li>🍚 <strong>신청</strong> — 주일 식사 신청 (토요일 2시 마감)</li>
          </ul>
        </div>

        <div className="space-y-2">
          {/* 카카오 단톡방 — 앱 밖으로 나가므로 새 창에서 엽니다 */}
          <a
            href={KAKAO_OPEN_CHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-[#FEE500] hover:bg-[#FFDE00] text-[#3C1E1E] text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="#3C1E1E">
              <path d="M12 3C7.03 3 3 6.14 3 10.01c0 2.45 1.6 4.6 4.03 5.88l-.99 3.69c-.08.3.22.56.5.38L10.76 18c.4.04.81.06 1.24.06 4.97 0 9-3.14 9-7.01C21 6.14 16.97 3 12 3z" />
            </svg>
            카카오톡 단톡방 참여하기
          </a>

          <button
            onClick={onClose}
            className="w-full py-3 bg-[#335f87] hover:bg-[#2b5072] text-white text-xs font-bold rounded-2xl transition-all active:scale-[0.98]"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  )
}
