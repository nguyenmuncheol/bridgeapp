'use client'

import { Download, ExternalLink, FileText, Music, Image as ImageIcon, File as FileIcon } from 'lucide-react'
import { PostAttachment } from '../../lib/mockData'
import { formatFileSize, isAudioAttachment } from '../../lib/storage'
import { toDownloadUrl } from '../../lib/download'

/** 파일 종류에 맞는 아이콘. 형식은 올릴 때 정해 둔 MIME 값을 씁니다. */
export function AttachmentIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type.startsWith('audio/')) return <Music size={size} />
  if (type.startsWith('image/')) return <ImageIcon size={size} />
  if (type === 'application/pdf') return <FileText size={size} />
  return <FileIcon size={size} />
}

/**
 * 저장할 때 쓸 파일명. 한글 파일명은 일부 기기에서 깨지므로(download.ts 참고)
 * 영문/숫자만 남기고, 하나도 안 남으면 번호로 대신합니다. 화면에는 원래 이름이 그대로 보입니다.
 */
function safeDownloadName(name: string, index: number): string {
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
  return `${base || `attachment_${index + 1}`}${ext ? `.${ext}` : ''}`
}

interface AttachmentListProps {
  attachments: PostAttachment[]
}

// ── 글에 붙은 파일 목록 (보기 전용) ──
// 음원은 바로 들을 수 있게 재생기를 붙이되, 눌러서 재생하기 전에는 내려받지 않습니다(preload="none").
// 그래야 글 상세를 열기만 해도 파일이 통째로 전송되는 일이 없습니다.
export default function AttachmentList({ attachments }: AttachmentListProps) {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-2xs font-bold text-gray-500">📎 첨부파일 {attachments.length}개</p>
      <ul className="space-y-2">
        {attachments.map((a, i) => {
          const canOpen = a.type === 'application/pdf' || a.type.startsWith('image/')
          return (
            <li key={a.url} className="rounded-xl border border-gray-200 bg-white p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand flex items-center justify-center shrink-0">
                  <AttachmentIcon type={a.type} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-900 truncate">{a.name}</p>
                  {a.size > 0 && <p className="text-2xs text-gray-500">{formatFileSize(a.size)}</p>}
                </div>
                {canOpen && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${a.name} 열기`}
                    title="열기"
                    className="tap-area relative p-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <a
                  href={toDownloadUrl(a.url, safeDownloadName(a.name, i))}
                  rel="noopener"
                  aria-label={`${a.name} 저장`}
                  title="저장"
                  className="tap-area relative p-2 bg-brand/10 text-brand rounded-lg hover:bg-brand/15"
                >
                  <Download size={14} />
                </a>
              </div>
              {isAudioAttachment(a) && (
                <audio controls preload="none" src={a.url} className="w-full h-9">
                  이 기기에서는 음원을 재생할 수 없습니다. 저장 버튼으로 내려받아 주세요.
                </audio>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
