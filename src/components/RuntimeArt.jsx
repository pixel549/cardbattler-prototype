import React, { useEffect, useState } from 'react';

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
  const [loadFailed, setLoadFailed] = useState(!src);

  useEffect(() => {
    setLoadFailed(!src);
  }, [src]);

  if (!src || loadFailed) {
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
    <img
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      draggable={draggable}
      onError={() => setLoadFailed(true)}
      style={{
        ...style,
        ...imageStyle,
      }}
    />
  );
}
