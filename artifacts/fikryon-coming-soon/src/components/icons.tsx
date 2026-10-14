type P = { className?: string };
const base = { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": true as const };

export const SunIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </svg>
);
export const MoonIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
);
export const LinkedInIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="currentColor">
    <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.77 2.65 4.77 6.1v5.46h-4v-4.84c0-1.16-.02-2.64-1.61-2.64-1.61 0-1.86 1.26-1.86 2.56v4.92h-4V9.75Z" />
  </svg>
);
export const XIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="currentColor">
    <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
  </svg>
);
export const MailIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);
export const ArrowIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.7 2.7L16 9.8" />
  </svg>
);
