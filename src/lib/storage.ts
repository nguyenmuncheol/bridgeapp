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

/**
 * 단일 파일을 압축 후 Supabase Storage에 업로드하고 Public URL을 반환합니다.
 */
export async function uploadImageToStorage(file: File, folder = 'uploads'): Promise<string> {
  try {
    // 1. 클라이언트 측에서 자동 압축 수행
    const processedFile = await compressImage(file)

    const fileExt = processedFile.name.split('.').pop() || 'jpg'
    const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`

    const { data, error } = await supabase.storage
      .from(DEFAULT_BUCKET)
      .upload(fileName, processedFile, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.warn('Supabase storage upload fallback to data URL:', error.message)
      return await fileToDataUrl(processedFile)
    }

    const { data: publicUrlData } = supabase.storage
      .from(DEFAULT_BUCKET)
      .getPublicUrl(data.path)

    return publicUrlData.publicUrl
  } catch (err) {
    console.error('Storage upload error:', err)
    return await fileToDataUrl(file)
  }
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

  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i, total)
    const url = await uploadImageToStorage(files[i], folder)
    urls.push(url)
    if (onProgress) onProgress(i + 1, total)
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(file)
  })
}
