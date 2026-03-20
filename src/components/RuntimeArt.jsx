import React, { useEffect, useMemo, useState } from 'react';
import { getRuntimeArtPreviewUrl } from '../data/runtimeArtCatalog.js';

function buildDefaultFallbackContent(label, accent) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 12,
        background: `
          radial-gradient(circle at 22% 16%, ${accent}24 0%, transparent 32%),
          linear-gradient(145deg, ${accent}18 0%, rgba(10,12,18,0.96) 52%, rgba(10,12,18,1) 100%)
        `,
      }}
    >
      <div
        style={{
          alignSelf: 'flex-start',
          padding: '4px 8px',
          borderRadius: 999,
          border: `1px solid ${accent}40`,
          background: `${accent}14`,
          color: accent,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        Runtime Art
      </div>
      <div
        style={{
          color: 'rgba(224, 224, 224, 0.94)',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          fontSize: 12,
          lineHeight: 1.5,
          textShadow: '0 1px 8px rgba(0,0,0,0.42)',
          maxWidth: '85%',
        }}
      >
        {label || 'Art temporarily unavailable'}
      </div>
    </div>
  );
}

export default function RuntimeArt({
  src,
  previewSrc = null,
  alt = '',
  style = {},
  imageStyle = {},
  fallbackStyle = {},
  fallbackContent = null,
  accent = '#00f0ff',
  label = '',
  className,
  loading = 'lazy',
  draggable = false,
}) {
  const resolvedPreviewSrc = useMemo(
    () => previewSrc || getRuntimeArtPreviewUrl(src),
    [previewSrc, src]
  );
  const [loadFailed, setLoadFailed] = useState(!src);
  const [previewFailed, setPreviewFailed] = useState(!resolvedPreviewSrc);
  const [fullLoaded, setFullLoaded] = useState(!src || src === resolvedPreviewSrc);

  useEffect(() => {
    setLoadFailed(!src);
    setPreviewFailed(!resolvedPreviewSrc);
    setFullLoaded(!src || src === resolvedPreviewSrc);
  }, [resolvedPreviewSrc, src]);

  const hasPreview = Boolean(resolvedPreviewSrc) && !previewFailed;
  if ((!src && !hasPreview) || (loadFailed && !hasPreview)) {
    return (
      <div
        aria-label={alt || label || 'Missing art'}
        className={className}
        style={{
          ...style,
          overflow: style.overflow ?? 'hidden',
          background: fallbackStyle.background ?? `
            radial-gradient(circle at 22% 16%, ${accent}24 0%, transparent 32%),
            linear-gradient(145deg, ${accent}18 0%, rgba(10,12,18,0.96) 52%, rgba(10,12,18,1) 100%)
          `,
          ...fallbackStyle,
        }}
      >
        {fallbackContent ?? buildDefaultFallbackContent(label, accent)}
      </div>
    );
  }

  return (
    <div
      className={className}
      aria-label={alt || label || 'Runtime art'}
      style={{
        ...style,
        display: style.display ?? 'block',
        overflow: style.overflow ?? 'hidden',
        position: style.position ?? 'relative',
      }}
    >
      {hasPreview ? (
        <img
          src={resolvedPreviewSrc}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          draggable={false}
          fetchPriority="high"
          onError={() => setPreviewFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            ...imageStyle,
          }}
        />
      ) : null}
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={draggable}
          fetchPriority={loading === 'eager' ? 'high' : 'auto'}
          onLoad={() => {
            setLoadFailed(false);
            setFullLoaded(true);
          }}
          onError={() => setLoadFailed(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: hasPreview ? (fullLoaded ? 1 : 0) : 1,
            transition: hasPreview ? 'opacity 140ms ease-out' : undefined,
            ...imageStyle,
          }}
        />
      ) : null}
    </div>
  );
}
