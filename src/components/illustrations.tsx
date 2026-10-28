/** Line-art pour-over illustration used on the Overview hero (decorative). */
export function PourOverIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 220" className={className} aria-hidden fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <linearGradient id="po-coffee" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5a3b" />
          <stop offset="1" stopColor="#5b3a26" />
        </linearGradient>
        <linearGradient id="po-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".25" />
        </linearGradient>
      </defs>
      {/* steam */}
      <path d="M150 40c-6-8 6-12 0-20M166 44c-6-8 6-12 0-20" stroke="#5a878c" strokeWidth="2" opacity=".6" />
      {/* kettle */}
      <path d="M196 54h52c6 0 10 4 10 10v30c0 8-6 14-14 14h-40c-8 0-14-6-14-14V64c0-6 4-10 6-10z" fill="#2a4a4e" stroke="#1f3a3d" strokeWidth="2" />
      <path d="M210 54c0-10 8-16 18-16s18 6 18 16" stroke="#1f3a3d" strokeWidth="3" />
      <path d="M190 70c-16 0-26 6-38 18l-6 6" stroke="#2a4a4e" strokeWidth="6" />
      <path d="M258 66c12 2 16 12 14 22-2 10-10 14-16 14" stroke="#1f3a3d" strokeWidth="4" />
      {/* pour stream */}
      <path d="M146 96c-2 10-2 18-2 26" stroke="#8a5a3b" strokeWidth="2.5" />
      {/* dripper */}
      <path d="M108 118h72l-14 34h-44z" fill="#fbf8f4" stroke="#1f3a3d" strokeWidth="2" />
      <path d="M100 118h88" stroke="#1f3a3d" strokeWidth="3" />
      <path d="M128 136l4 12M144 132v16M160 136l-4 12" stroke="#cfd9d9" strokeWidth="1.5" />
      {/* carafe */}
      <path d="M118 156h52l8 14c6 12 4 26-6 34-8 6-18 8-28 8s-20-2-28-8c-10-8-12-22-6-34z" fill="url(#po-glass)" stroke="#1f3a3d" strokeWidth="2" />
      <path d="M114 186c10 6 50 6 60 0 2 8 0 14-6 18-8 6-18 8-24 8s-16-2-24-8c-6-4-8-10-6-18z" fill="url(#po-coffee)" />
      <path d="M128 162c-2 6-2 12 0 18" stroke="#ffffff" strokeWidth="2" opacity=".8" />
      {/* bag */}
      <path d="M232 134h44l6 80h-56z" fill="#f3c9a8" stroke="#b8643a" strokeWidth="2" />
      <path d="M232 134l6-10h32l6 10" stroke="#b8643a" strokeWidth="2" fill="#f8dcc7" />
      <circle cx="254" cy="168" r="10" stroke="#2f5257" strokeWidth="2" />
      <path d="M249 172c3-6 7-6 10-8" stroke="#2f5257" strokeWidth="1.5" />
      <path d="M244 192h20" stroke="#b8643a" strokeWidth="2" />
      {/* leaves */}
      <path d="M40 214c0-30 10-50 26-64M66 150c-14 2-22 10-24 22 12 0 20-8 24-22zM56 178c-14-4-24 0-30 10 12 4 22 0 30-10zM60 196c10-8 20-8 28-2-8 8-18 8-28 2z" stroke="#3d6a70" strokeWidth="2" fill="#a9c4c5" fillOpacity=".5" />
      <path d="M20 214h290" stroke="#1f3a3d" strokeWidth="2" opacity=".25" />
    </svg>
  );
}
