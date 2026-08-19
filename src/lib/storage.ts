import { supabase } from './supabase'

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
