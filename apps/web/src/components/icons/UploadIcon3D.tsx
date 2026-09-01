

export default function UploadIcon3D({ size = 24 }: { size?: number | string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size} className="upload-icon-3d inline-block">
      <defs>
        <filter id="shadow-doc" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#000" floodOpacity="0.2"/>
        </filter>
        <filter id="shadow-folder" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="-1" stdDeviation="2" floodColor="#000" floodOpacity="0.15"/>
        </filter>
        <filter id="shadow-cloud" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.25"/>
        </filter>
        <filter id="shadow-arrow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.3"/>
        </filter>

        <linearGradient id="docGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="100%" stopColor="#E2E8F0"/>
        </linearGradient>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E293B"/>
          <stop offset="100%" stopColor="#0F172A"/>
        </linearGradient>
        <linearGradient id="folderGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBBF24"/>
          <stop offset="100%" stopColor="#D97706"/>
        </linearGradient>
        <linearGradient id="cloudGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60A5FA"/>
          <stop offset="100%" stopColor="#2563EB"/>
        </linearGradient>
        <linearGradient id="arrowGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF"/>
          <stop offset="100%" stopColor="#F1F5F9"/>
        </linearGradient>
      </defs>

      {/* Document */}
      <rect x="22" y="8" width="56" height="70" rx="4" fill="url(#docGrad)" filter="url(#shadow-doc)" />
      
      {/* Document Lines */}
      <rect x="32" y="22" width="20" height="5" rx="2.5" fill="url(#lineGrad)" filter="url(#shadow-doc)" />
      <rect x="32" y="36" width="36" height="5" rx="2.5" fill="url(#lineGrad)" filter="url(#shadow-doc)" />
      <rect x="32" y="50" width="36" height="5" rx="2.5" fill="url(#lineGrad)" filter="url(#shadow-doc)" />

      {/* Folder Front */}
      <path d="M12,90 L12,50 C12,47 14,44 17,44 L32,44 C35,44 37,42 38,40 C39,37 42,35 45,35 L83,35 C86,35 88,37 88,40 L88,90 C88,93 86,95 83,95 L17,95 C14,95 12,93 12,90 Z" fill="url(#folderGrad)" filter="url(#shadow-folder)" />
      
      {/* Cloud */}
      <path d="M 30 76 A 14 14 0 0 1 32 49 A 21 21 0 0 1 68 49 A 14 14 0 0 1 70 76 Z" fill="url(#cloudGrad)" filter="url(#shadow-cloud)" />
      
      {/* Arrow */}
      <path d="M 44 86 L 44 62 L 34 62 L 50 40 L 66 62 L 56 62 L 56 86 Z" fill="url(#arrowGrad)" filter="url(#shadow-arrow)" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
