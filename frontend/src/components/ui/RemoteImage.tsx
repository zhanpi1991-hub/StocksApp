import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** A host that is blocked or black-holed hangs instead of erroring, so each attempt gets a deadline. */
export const IMAGE_TIMEOUT_MS = 6000

/**
 * Image from an external provider. Tries `src`, then each of `alternates` (same asset on another host of
 * the same provider), and renders `fallback` - never a broken-image icon - when none load in time, or when a
 * URL is missing / not http(s). URLs are only ever ones the provider returned (or its documented mirror host).
 */
export function RemoteImage({
  src, alternates = [], alt = '', className, style, fallback, timeoutMs = IMAGE_TIMEOUT_MS,
}: { src?: string | null; alternates?: string[]; alt?: string; className?: string; style?: CSSProperties; fallback: ReactNode; timeoutMs?: number }) {
  const [attempt, setAttempt] = useState(0)
  const loaded = useRef(false)
  const candidates = [src, ...alternates].filter((u): u is string => !!u && /^https?:\/\//i.test(u))
  const url = candidates[attempt]

  useEffect(() => {
    setAttempt(0)
  }, [src])

  useEffect(() => {
    loaded.current = false
    if (!url) return
    const t = setTimeout(() => {
      if (!loaded.current) setAttempt((a) => a + 1)
    }, timeoutMs)
    return () => clearTimeout(t)
  }, [url, timeoutMs])

  if (!url) return <>{fallback}</>
  return (
    <img
      key={url}
      src={url}
      alt={alt}
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      style={style}
      onLoad={() => { loaded.current = true }}
      onError={() => setAttempt((a) => a + 1)}
    />
  )
}
