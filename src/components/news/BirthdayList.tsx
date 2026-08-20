'use client'

import { useMemo } from 'react'
import { UserProfile } from '../../lib/mockData'
import { getBirthdayMonthDay } from '../../lib/dateUtils'
import Avatar from './Avatar'

interface BirthdayListProps {
  addressBookEntries: UserProfile[]
  allUsers: UserProfile[]
  calMonth: number // 0-indexed (Date.getMonth())
}

// ── 이달의 생일 성도 리스트 ──
export default function BirthdayList({ addressBookEntries, allUsers, calMonth }: BirthdayListProps) {
  const monthBirthdays = useMemo(() => {
    const targetMonth = calMonth + 1
    return addressBookEntries
      .map(u => ({ u, mmdd: getBirthdayMonthDay(u.birthday) }))
      .filter(({ mmdd }) => mmdd !== null && parseInt(mmdd.slice(0, 2), 10) === targetMonth)
      .sort((a, b) => parseInt(a.mmdd!.slice(3, 5), 10) - parseInt(b.mmdd!.slice(3, 5), 10))
      .map(({ u }) => u)
  }, [addressBookEntries, calMonth])

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-2xs p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
          <span>🎂</span> {calMonth + 1}월 생일 성도
        </h3>
        <span className="text-2xs bg-pink-50 text-pink-600 font-bold px-2 py-0.5 rounded-full">
          총 {monthBirthdays.length}명
        </span>
      </div>

      {monthBirthdays.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {monthBirthdays.map(m => {
            const mmdd = getBirthdayMonthDay(m.birthday)
            const dayStr = mmdd ? `${parseInt(mmdd.slice(0, 2), 10)}월 ${parseInt(mmdd.slice(3, 5), 10)}일` : ''
            return (
              <div key={m.id} className="p-2.5 bg-pink-50/40 border border-pink-100 rounded-xl flex items-center gap-2.5">
                <Avatar allUsers={allUsers} authorId={m.id} authorName={m.name} size="w-10 h-8 text-xs" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-xs text-gray-900 truncate">{m.name}</span>
                    <span className="text-2xs text-gray-400 shrink-0">{m.duty}</span>
                  </div>
                  <p className="text-2xs font-bold text-pink-600 mt-0.5">🎉 {dayStr}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
          {calMonth + 1}월에는 등록된 생일 성도가 없습니다.
        </p>
      )}
    </div>
  )
}
