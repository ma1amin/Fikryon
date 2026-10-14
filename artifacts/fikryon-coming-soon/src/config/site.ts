/**
 * FIKRYON — central site configuration.
 * Replace every *_HERE placeholder with the official value once confirmed.
 * Placeholders are detected automatically and rendered as "unavailable" (no navigation).
 */

// Launch moment (Riyadh time, UTC+3). Change this single line to move the launch.
export const LAUNCH_DATE = "2026-11-03T00:00:00+03:00";
// Progress percentage counts down from this configured start moment to launch.
export const COUNTDOWN_START_DATE = "2026-10-14T00:00:00+03:00";

// Official contact / social values supplied by FIKRYON.
export const CONTACT_EMAIL = "info@fikryon.com";
export const LINKEDIN_URL = "https://www.linkedin.com/company/fikryon-company/posts/?viewAsMember=true";
export const TWITTER_URL = "https://x.com/fikryonai";

// Official logo variants supplied by FIKRYON.
export const LOGO_LIGHT_SRC = `${import.meta.env.BASE_URL}fikryon-logo-light.png`;
export const LOGO_DARK_SRC = `${import.meta.env.BASE_URL}fikryon-logo-dark.png`;

export const isPlaceholder = (v: string) => !v || v.endsWith("_HERE");
