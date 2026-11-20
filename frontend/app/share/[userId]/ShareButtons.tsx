'use client';

import { useEffect, useState } from 'react';
import { Check, Link as LinkIcon, Share2 } from 'lucide-react';
import { buttonClass } from '../../ui/buttonClass';

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

  const shareText = `I scored ${score}/100 (Grade ${grade}) on crypto execution quality. How well do you execute?`;
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
    } catch {
      // The share sheet was closed or failed; nothing to report.
    }
  };

  const cls = buttonClass('secondary', 'sm', 'no-underline');
  const links: Array<[string, string]> = [
    ['X', `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`],
    ['WhatsApp', `https://wa.me/?text=${encodedText}%20${encodedUrl}`],
    ['Telegram', `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`],
    ['Reddit', `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`],
  ];

  return (
    <div className="flex flex-wrap justify-center gap-2">
      <button type="button" onClick={handleCopy} className={buttonClass('primary', 'sm')}>
        {copied ? <Check aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
      {links.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={cls}>{label}</a>
      ))}
      {canNativeShare && (
        <button type="button" onClick={handleNativeShare} className={buttonClass('secondary', 'sm')}>
          <Share2 aria-hidden="true" /> Share
        </button>
      )}
    </div>
  );
}
