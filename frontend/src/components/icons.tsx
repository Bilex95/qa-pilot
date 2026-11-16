/* Stroke icons ported from the locked prototype so the app matches it exactly. */
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function make(paths: ReactNode, name: string) {
  const Icon = ({ size, ...props }: IconProps) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" width={size} height={size} {...props}>
      {paths}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

export const IconDash = make(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>, "IconDash");
export const IconFolder = make(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, "IconFolder");
export const IconBug = make(<><path d="M8 8a4 4 0 0 1 8 0v1H8z" /><rect x="7" y="9" width="10" height="11" rx="5" /><path d="M12 13v7M3 13h4M17 13h4M4 7l3 2M20 7l-3 2M4 20l3-2M20 20l-3-2" /></>, "IconBug");
export const IconBoard = make(<><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></>, "IconBoard");
export const IconSuite = make(<><path d="M9 5h11M9 12h11M9 19h11" /><path d="M4 5l1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2" /></>, "IconSuite");
export const IconRun = make(<><circle cx="12" cy="12" r="9" /><path d="M10 8l6 4-6 4z" /></>, "IconRun");
export const IconRelease = make(<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>, "IconRelease");
export const IconReport = make(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />, "IconReport");
export const IconUsers = make(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" /></>, "IconUsers");
export const IconMeter = make(<><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></>, "IconMeter");
export const IconGear = make(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>, "IconGear");
export const IconSpark = make(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />, "IconSpark");
export const IconSearch = make(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>, "IconSearch");
export const IconPlus = make(<path d="M12 5v14M5 12h14" />, "IconPlus");
export const IconMenu = make(<path d="M4 6h16M4 12h16M4 18h16" />, "IconMenu");
export const IconChevron = make(<path d="M6 9l6 6 6-6" />, "IconChevron");
export const IconAlert = make(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></>, "IconAlert");
export const IconInfo = make(<><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>, "IconInfo");
export const IconCheck = make(<path d="M5 12l5 5 9-10" />, "IconCheck");
export const IconUser = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>, "IconUser");
export const IconLogout = make(<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />, "IconLogout");
export const IconCompass = make(<><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>, "IconCompass");
export const IconLock = make(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, "IconLock");
export const IconRefresh = make(<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />, "IconRefresh");
