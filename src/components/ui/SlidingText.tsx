'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

interface SlidingTextProps {
  text: string
  className?: string
}

/**
 * 한 줄로만 표시하되, 칸보다 텍스트가 길면 자동으로 좌우로 슬라이딩해서
 * 잘린 뒷부분까지 볼 수 있게 합니다. 칸에 다 들어가면 그냥 고정 표시됩니다.
 */
export default function SlidingText({ text, className = '' }: SlidingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState<number>(0)

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current
      const span = textRef.current
      if (!container || !span) return
      const diff = span.scrollWidth - container.clientWidth
      setOverflow(diff > 0 ? diff : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [text])

  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap ${className}`}>
      <span
        ref={textRef}
        className="inline-block"
        style={
          overflow > 0
            ? ({
                animation: `sliding-text-scroll ${Math.max(4, overflow / 25)}s ease-in-out infinite`,
                // 슬라이딩 폭은 실제로 넘치는 만큼만 움직입니다.
                '--sliding-text-overflow': `-${overflow}px`,
              } as CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  )
}
