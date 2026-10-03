import { supabase } from './supabase'
import type { PostAttachment } from './mockData'

const DEFAULT_BUCKET = 'church-assets'

/**
 * 브라우저 Canvas를 이용해 이미지를 최대 너비 1600px, JPEG quality 0.82로 자동 리사이징 및 압축합니다.
 * 스마트폰 고용량 사진(10MB+)을 약 200~400KB로 줄여 업로드 속도를 극대화하고 용량을 절약합니다.
 */
export async function compressImage(file: File, maxWidth = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.src = url

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        } else {
          width = Math.round((width * maxWidth) / height)
          height = maxWidth
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          const newName = file.name.replace(/\.[^/.]+$/, '') + '.jpg'
          const compressedFile = new File([blob], newName, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          resolve(compressedFile)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
  })
}

/** 업로드를 허용할 이미지 확장자 */
const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']
/** 압축 후에도 이 크기를 넘으면 업로드하지 않습니다 (모바일 데이터 보호) */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // 8MB

/**
 * 단일 파일을 압축 후 Supabase Storage에 업로드하고 Public URL을 반환합니다.
 *
 * 🐛 과거 버그: 업로드가 실패하면 조용히 "이미지를 base64 글자로 바꿔서" 반환했습니다.
 * 그 글자 덩어리가 DB의 게시글/프로필 행에 그대로 저장되는데, 한 장에 400KB
 * (압축 실패 경로에서는 원본 그대로라 10MB 이상)입니다. 그러면 그 게시판을 여는
 * **모든 성도가 매번 그걸 내려받게 되고**, 나중에 정리할 방법도 없습니다
 * (파일 삭제 함수의 경로 추출 정규식이 base64에는 안 맞습니다).
 * 사용자는 업로드가 실패했다는 사실조차 알 수 없었습니다.
 *
 * → 이제 실패하면 예외를 던집니다. 호출부에서 "이미지 업로드에 실패했습니다"를
 *   보여주고 글 등록을 막아야 합니다.
 */
export async function uploadImageToStorage(file: File, folder = 'uploads'): Promise<string> {
  // 1. 클라이언트 측에서 자동 압축 수행
  const processedFile = await compressImage(file)

  if (processedFile.size > MAX_UPLOAD_BYTES) {
    throw new Error(`이미지 용량이 너무 큽니다 (${Math.round(processedFile.size / 1024 / 1024)}MB). 8MB 이하로 줄여서 다시 시도해 주세요.`)
  }

  // 확장자가 없거나(카카오톡에서 받은 사진 등) 이미지가 아닌 경우 jpg로 처리.
  // (기존에는 확장자 없는 'photo' 같은 이름에서 '.photo'가 붙어 브라우저가 이미지로 인식 못 했습니다)
  const nameParts = processedFile.name.split('.')
  const rawExt = nameParts.length > 1 ? (nameParts.pop() || '').toLowerCase() : ''
  const fileExt = ALLOWED_EXTS.includes(rawExt) ? rawExt : 'jpg'
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`

  const { data, error } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(fileName, processedFile, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) {
    throw new Error(`이미지 업로드에 실패했습니다: ${error.message}`)
  }

  const { data: publicUrlData } = supabase.storage
    .from(DEFAULT_BUCKET)
    .getPublicUrl(data.path)

  return publicUrlData.publicUrl
}

/**
 * 여러 파일을 순차적으로 압축/업로드하면서 실시간 진행률(onProgress)을 콜백합니다.
 */
export async function uploadMultipleImagesToStorage(
  files: File[],
  folder = 'uploads',
  onProgress?: (completed: number, total: number) => void
): Promise<string[]> {
  const total = files.length
  const urls: string[] = []

  try {
    for (let i = 0; i < total; i++) {
      if (onProgress) onProgress(i, total)
      const url = await uploadImageToStorage(files[i], folder)
      urls.push(url)
      if (onProgress) onProgress(i + 1, total)
    }
  } catch (err) {
    // 중간에 실패하면 이미 올라간 파일들은 아무도 참조하지 않는 쓰레기가 되므로 정리합니다.
    if (urls.length > 0) await deleteImagesFromStorage(urls).catch(() => {})
    throw err
  }

  return urls
}

// ─────────────────────────────────────────────────────────────────────────────
// 글 첨부파일 (찬양/묵상나눔의 악보·음원·문서)
//
// 서버에 부담이 가지 않도록 세 가지로 막습니다.
//  ① 파일당 5MB 이하  ② 글 하나에 최대 3개  ③ 정해 둔 형식만
// 사진은 올리기 전에 기존처럼 1600px JPEG 로 줄이므로 보통 1MB 안팎이 됩니다.
// 음원은 줄일 방법이 없어 5MB(128kbps 기준 약 5분)가 사실상 상한입니다.
//
// ⚠️ 형식 목록(ATTACHMENT_TYPES)은 저장소 버킷의 allowed_mime_types 와 같아야 합니다.
//    둘이 어긋나면 앱은 통과시켰는데 서버가 거절합니다.
//    → supabase/migrations/20261003000000_post_attachments.sql
// ─────────────────────────────────────────────────────────────────────────────

/** 글 하나에 붙일 수 있는 첨부파일 개수 */
export const ATTACHMENT_MAX_FILES = 3
/** 첨부파일 하나의 최대 크기(압축 후 기준) */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024 // 5MB
/** 사진은 올리기 전에 줄어들므로, 고르는 시점에는 이 크기까지만 받아 둡니다(메모리 보호). */
const ATTACHMENT_MAX_RAW_IMAGE_BYTES = 30 * 1024 * 1024

/**
 * 확장자 → 서버에 알려 줄 형식.
 * 브라우저가 알려 주는 file.type 은 기기마다 다르고(hwp 는 거의 항상 빈 값) 믿을 수 없어서,
 * 확장자로 직접 정합니다. 이렇게 하면 서버의 형식 검사와도 항상 맞습니다.
 */
const ATTACHMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  hwp: 'application/x-hwp',
  hwpx: 'application/hwp+zip',
}

/** <input type="file" accept=...> 에 넣을 값 */
export const ATTACHMENT_ACCEPT = Object.keys(ATTACHMENT_TYPES).map(ext => `.${ext}`).join(',')
/** 안내 문구용 */
export const ATTACHMENT_HELP_TEXT = 'PDF(악보) · 음원(mp3, m4a) · 사진 · 문서(docx, pptx, hwp)'

/** 서버 버킷에 허용해 줘야 하는 형식 목록 (마이그레이션과 맞춰 둡니다) */
export const ATTACHMENT_MIME_TYPES = Array.from(new Set(Object.values(ATTACHMENT_TYPES)))

function extOf(fileName: string): string {
  const parts = fileName.split('.')
  return parts.length > 1 ? (parts.pop() || '').toLowerCase() : ''
}

/** 파일 이름(확장자)으로 형식을 알아냅니다. 허용하지 않는 형식이면 빈 문자열. */
export function attachmentTypeOfName(fileName: string): string {
  return ATTACHMENT_TYPES[extOf(fileName)] || ''
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export function isAudioAttachment(att: Pick<PostAttachment, 'type'>): boolean {
  return att.type.startsWith('audio/')
}

/**
 * 파일을 고르는 순간 바로 확인합니다(올리기 전에 알려 주려는 것).
 * 문제가 없으면 null, 있으면 사용자에게 보여 줄 문구를 돌려줍니다.
 */
export function validateAttachmentFile(file: File): string | null {
  const ext = extOf(file.name)
  const type = ATTACHMENT_TYPES[ext]
  if (!type) {
    return `'${file.name}' 은(는) 올릴 수 없는 형식입니다. (${ATTACHMENT_HELP_TEXT})`
  }
  const limit = type.startsWith('image/') ? ATTACHMENT_MAX_RAW_IMAGE_BYTES : ATTACHMENT_MAX_BYTES
  if (file.size > limit) {
    return `'${file.name}' 은(는) 용량이 너무 큽니다 (${formatFileSize(file.size)}). ${formatFileSize(limit)} 이하만 올릴 수 있어요.`
  }
  return null
}

/**
 * 첨부파일 하나를 올리고 글에 저장할 정보를 돌려줍니다. 실패하면 예외를 던집니다.
 * (이미지 업로드와 같은 이유로, 실패를 삼키고 넘어가지 않습니다)
 *
 * 저장소 안의 파일 경로에는 원래 파일명(한글·공백)을 쓰지 않습니다. 주소가 깨지거나 거절될 수 있어서
 * 영문/숫자 이름을 새로 만들고, 원래 이름은 글에 따로 저장해 화면에 보여 줍니다.
 */
export async function uploadAttachmentToStorage(file: File, folder = 'attachments'): Promise<PostAttachment> {
  const invalid = validateAttachmentFile(file)
  if (invalid) throw new Error(invalid)

  let ext = extOf(file.name)
  let displayName = file.name.trim().slice(0, 100)
  let body: File = file

  // 사진은 기존 사진 업로드와 똑같이 줄여서 올립니다(결과는 jpg).
  if (ATTACHMENT_TYPES[ext].startsWith('image/')) {
    body = await compressImage(file)
    if (body !== file) {
      ext = 'jpg'
      displayName = displayName.replace(/\.[^/.]+$/, '') + '.jpg'
    }
  }

  const type = ATTACHMENT_TYPES[ext]
  if (body.size > ATTACHMENT_MAX_BYTES) {
    throw new Error(`'${file.name}' 은(는) 용량이 너무 큽니다 (${formatFileSize(body.size)}). ${formatFileSize(ATTACHMENT_MAX_BYTES)} 이하만 올릴 수 있어요.`)
  }

  const path = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`
  const { data, error } = await supabase.storage
    .from(DEFAULT_BUCKET)
    .upload(path, body, { cacheControl: '3600', upsert: false, contentType: type })
  if (error) {
    throw new Error(`'${file.name}' 업로드에 실패했습니다: ${error.message}`)
  }

  const { data: publicUrlData } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(data.path)
  return { url: publicUrlData.publicUrl, name: displayName, size: body.size, type }
}

/** 첨부파일 여러 개를 순서대로 올립니다. 중간에 실패하면 이미 올라간 것은 지우고 예외를 던집니다. */
export async function uploadMultipleAttachments(
  files: File[],
  onProgress?: (completed: number, total: number) => void
): Promise<PostAttachment[]> {
  const total = files.length
  const done: PostAttachment[] = []
  try {
    for (let i = 0; i < total; i++) {
      onProgress?.(i, total)
      done.push(await uploadAttachmentToStorage(files[i]))
      onProgress?.(i + 1, total)
    }
  } catch (err) {
    if (done.length > 0) await deleteFilesFromStorage(done.map(a => a.url)).catch(() => {})
    throw err
  }
  return done
}

/**
 * Supabase Storage에서 Public URL 목록에 해당하는 파일들을 삭제합니다.
 * URL에서 버킷 내부 경로를 추출하여 일괄 삭제합니다.
 */
export async function deleteImagesFromStorage(publicUrls: string[]): Promise<void> {
  if (!publicUrls || publicUrls.length === 0) return

  // Public URL에서 스토리지 경로(버킷 이후 부분)만 추출
  const paths = publicUrls
    .map(url => {
      try {
        // URL 형식: .../storage/v1/object/public/{bucket}/{path}
        const match = url.match(/\/object\/public\/[^/]+\/(.+)/)
        return match ? match[1] : null
      } catch {
        return null
      }
    })
    .filter((p): p is string => p !== null)

  if (paths.length === 0) return

  const { error } = await supabase.storage.from(DEFAULT_BUCKET).remove(paths)
  if (error) {
    console.warn('Storage 파일 삭제 실패:', error.message)
  }
}

/** 사진이 아닌 파일(첨부파일)에도 쓰는 같은 함수입니다. 공개 주소에서 경로를 뽑아 지웁니다. */
export const deleteFilesFromStorage = deleteImagesFromStorage

/**
 * 카카오 프로필 사진을 **우리 저장소로 한 번 복사**합니다.
 *
 * 🐛 왜 필요한가: 지금까지는 카톡 서버 주소(k.kakaocdn.net/...)를 그대로 저장했습니다.
 * 그런데 그건 사진 파일이 아니라 **주소**라서, 성도님이 카톡에서 프로필을 바꾸면
 * 옛 주소가 사라져 앱에서 사진이 깨집니다. 게다가 주소가 http(보안 없음)라
 * 브라우저가 막을 여지도 있습니다.
 * → 가입 직후 한 번만 우리 저장소로 옮겨두면 이후로는 절대 안 깨집니다.
 *
 * 실패해도 앱이 멈추면 안 되므로, 못 가져오면 조용히 null 을 돌려줍니다.
 */
export async function copyExternalImageToStorage(url: string, folder = 'avatars'): Promise<string | null> {
  try {
    if (!url) return null
    // https 로 바꿔서 시도합니다 (카카오는 https도 지원합니다)
    const secure = url.startsWith('http://') ? 'https://' + url.slice(7) : url
    const res = await fetch(secure)
    if (!res.ok) return null
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) return null
    const file = new File([blob], 'profile.jpg', { type: blob.type || 'image/jpeg' })
    return await uploadImageToStorage(file, folder)
  } catch {
    return null
  }
}
