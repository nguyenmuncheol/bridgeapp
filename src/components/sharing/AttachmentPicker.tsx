'use client'

import { X } from 'lucide-react'
import { PostAttachment } from '../../lib/mockData'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_HELP_TEXT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  attachmentTypeOfName,
  formatFileSize,
  validateAttachmentFile,
} from '../../lib/storage'
import { AttachmentIcon } from './AttachmentList'

interface AttachmentPickerProps {
  /** 라벨과 입력칸을 이어 주는 id */
  inputId: string
  /** 이미 글에 붙어 있는 파일(수정 창에서만 넘깁니다) */
  existing?: PostAttachment[]
  onRemoveExisting?: (url: string) => void
  /** 이번에 새로 고른 파일. 글을 저장할 때 비로소 올라갑니다. */
  files: File[]
  onFilesChange: (files: File[]) => void
  /** 형식·용량·개수 문제를 알릴 때 부릅니다. 문제가 없으면 빈 문자열로 불러 이전 안내를 지웁니다. */
  onMessage: (message: string) => void
  disabled?: boolean
}

// ── 첨부파일 고르기 (찬양/묵상나눔 작성·수정 공용) ──
// 파일은 고르는 즉시 올리지 않고 들고 있다가, 등록/저장 버튼을 누를 때 올립니다.
// (고르고 취소했는데 서버에 파일만 남는 일을 막기 위해서입니다)
export default function AttachmentPicker({
  inputId,
  existing = [],
  onRemoveExisting,
  files,
  onFilesChange,
  onMessage,
  disabled = false,
}: AttachmentPickerProps) {
  const total = existing.length + files.length
  const room = ATTACHMENT_MAX_FILES - total
  const isFull = room <= 0

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    // 같은 파일을 지웠다가 다시 고를 수 있도록 입력칸을 비웁니다.
    e.target.value = ''
    if (picked.length === 0 || room <= 0) return

    const accepted: File[] = []
    let message = ''
    for (const f of picked) {
      if (accepted.length >= room) {
        message = message || `첨부파일은 최대 ${ATTACHMENT_MAX_FILES}개까지입니다. 앞의 ${room}개만 담았어요.`
        break
      }
      const problem = validateAttachmentFile(f)
      if (problem) {
        message = message || problem
        continue
      }
      const duplicated = [...files, ...accepted].some(x => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)
      if (!duplicated) accepted.push(f)
    }
    if (accepted.length > 0) onFilesChange([...files, ...accepted])
    onMessage(message)
  }

  const removeNew = (index: number) => onFilesChange(files.filter((_, i) => i !== index))

  return (
    <div className="space-y-2 bg-gray-50/70 p-3 rounded-xl border border-gray-200/60">
      <label htmlFor={inputId} className="block text-2xs font-bold text-gray-600">📎 파일 첨부 (선택)</label>

      {(existing.length > 0 || files.length > 0) && (
        <ul className="space-y-1.5">
          {existing.map(a => (
            <li key={a.url} className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-2">
              <span className="text-brand shrink-0"><AttachmentIcon type={a.type} size={14} /></span>
              <span className="text-xs font-semibold text-gray-800 truncate flex-1 min-w-0">{a.name}</span>
              {a.size > 0 && <span className="text-2xs text-gray-500 shrink-0">{formatFileSize(a.size)}</span>}
              {onRemoveExisting && (
                <button
                  type="button"
                  onClick={() => onRemoveExisting(a.url)}
                  disabled={disabled}
                  aria-label={`${a.name} 빼기`}
                  className="tap-area relative p-1 text-gray-500 hover:text-rose-500 disabled:opacity-50 shrink-0"
                ><X size={14} /></button>
              )}
            </li>
          ))}
          {files.map((f, i) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="flex items-center gap-2 bg-white rounded-lg border border-brand-100 p-2">
              <span className="text-brand shrink-0"><AttachmentIcon type={attachmentTypeOfName(f.name)} size={14} /></span>
              <span className="text-xs font-semibold text-gray-800 truncate flex-1 min-w-0">{f.name}</span>
              <span className="text-2xs text-gray-500 shrink-0">{formatFileSize(f.size)}</span>
              <button
                type="button"
                onClick={() => removeNew(i)}
                disabled={disabled}
                aria-label={`${f.name} 빼기`}
                className="tap-area relative p-1 text-gray-500 hover:text-rose-500 disabled:opacity-50 shrink-0"
              ><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}

      {/* 실제 입력칸은 화면 낭독기·키보드용으로만 남기고, 눈에 보이는 버튼은 라벨이 맡습니다. */}
      <label
        htmlFor={inputId}
        className={`flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border border-dashed text-xs font-bold transition-colors focus-within:ring-2 focus-within:ring-brand/40 ${
          isFull || disabled
            ? 'border-gray-200 text-gray-400 cursor-not-allowed'
            : 'border-brand/40 text-brand bg-white hover:bg-brand-50 cursor-pointer'
        }`}
      >
        <input
          id={inputId}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          disabled={isFull || disabled}
          onChange={handlePick}
          className="sr-only"
        />
        {isFull ? `첨부파일은 최대 ${ATTACHMENT_MAX_FILES}개까지입니다` : `파일 추가하기 (${total}/${ATTACHMENT_MAX_FILES})`}
      </label>

      <p className="text-2xs text-gray-500 leading-relaxed px-0.5">
        {ATTACHMENT_HELP_TEXT}. 파일당 {formatFileSize(ATTACHMENT_MAX_BYTES)} 이하, 최대 {ATTACHMENT_MAX_FILES}개까지 올릴 수 있어요.
      </p>
    </div>
  )
}
