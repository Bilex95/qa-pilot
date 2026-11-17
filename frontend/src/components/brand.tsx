import Link from "next/link";

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="6" fill="#0C6B67" />
      <circle cx="13" cy="13" r="6.5" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M17.5 17.5L22 22" stroke="#F4D35E" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

export function Brand({ href }: { href: string }) {
  return (
    <Link className="brand" href={href}>
      <BrandMark />
      <span>QA Pilot</span>
    </Link>
  );
}
