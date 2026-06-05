'use client';

import { useEffect, useState } from 'react';

type ShareButtonsProps = {
  shareUrl: string;
  grade: string;
  score: number;
};

export default function ShareButtons({ shareUrl, grade, score }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(shareUrl);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentUrl(window.location.href);
      if (typeof navigator.share === 'function') {
        setCanNativeShare(true);
      }
    }
  }, []);

  const shareText = `I scored ${score}/100 (Grade ${grade}) on crypto execution quality. How well do you execute? 📊`;
  const encodedText = encodeURIComponent(shareText);
  const encodedUrl = encodeURIComponent(currentUrl);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: `FillScore: Grade ${grade} (${score}/100)`,
        text: shareText,
        url: currentUrl,
      });
    } catch (err) {
      console.log('Share canceled or failed');
    }
  };

  const buttonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.5rem 1rem',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    color: '#ede8e0',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.65rem',
    letterSpacing: '0.05em',
    textDecoration: 'none',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  };

  return (
    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '2rem' }}>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        X / TWITTER
      </a>

      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        LINKEDIN
      </a>

      <a
        href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        WHATSAPP
      </a>

      <a
        href={`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`}
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        TELEGRAM
      </a>

      <a
        href={`https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`}
        target="_blank"
        rel="noopener noreferrer"
        style={buttonStyle}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        REDDIT
      </a>

      <button
        onClick={handleCopy}
        style={buttonStyle}
        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
      >
        {copied ? '✓ COPIED!' : 'COPY LINK'}
      </button>

      {canNativeShare && (
        <button
          onClick={handleNativeShare}
          style={buttonStyle}
          onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseOut={e => e.currentTarget.style.background = 'transparent'}
        >
          SHARE...
        </button>
      )}
    </div>
  );
}
