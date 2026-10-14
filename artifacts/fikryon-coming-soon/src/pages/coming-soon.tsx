import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { copy, type Lang } from "@/config/i18n";
import {
  CONTACT_EMAIL, COUNTDOWN_START_DATE, LAUNCH_DATE, LINKEDIN_URL, LOGO_DARK_SRC, LOGO_LIGHT_SRC, TWITTER_URL, isPlaceholder,
} from "@/config/site";
import { usePreferences } from "@/hooks/use-preferences";
import { NetworkBackground } from "@/components/network-background";
import {
  ArrowIcon, CheckIcon, LinkedInIcon, MailIcon, MoonIcon, SunIcon, XIcon,
} from "@/components/icons";

const DAY_MS = 86400000;
const target = new Date(LAUNCH_DATE).getTime();
const countdownStart = new Date(COUNTDOWN_START_DATE).getTime();
const totalCountdownDays = Math.max(1, Math.ceil((target - countdownStart) / DAY_MS));
function remaining() {
  const now = Date.now();
  const d = Math.max(0, target - now);
  const days = Math.floor(d / DAY_MS);
  const daysForPercent = d === 0 ? 0 : Math.max(1, days);
  const percent = Math.round(Math.min(1, daysForPercent / totalCountdownDays) * 100);
  return {
    done: d === 0,
    percent,
    days,
    hours: Math.floor(d / 3600000) % 24,
    minutes: Math.floor(d / 60000) % 60,
    seconds: Math.floor(d / 1000) % 60,
  };
}

function useCountdown() {
  const [t, setT] = useState(remaining);
  useEffect(() => {
    const id = window.setInterval(() => setT(remaining()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return t;
}

const fmt = (n: number, lang: Lang, pad = 2) =>
  new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-arab" : "en-US", {
    minimumIntegerDigits: pad, useGrouping: false,
  }).format(n);
const fmtPercent = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-arab" : "en-US", {
    style: "percent", maximumFractionDigits: 0,
  }).format(n / 100);

/* ---------------- Official brand lockup ---------------- */
function BrandLockup() {
  return (
    <div className="fk-lockup" data-testid="brand-lockup">
      <img
        src={LOGO_LIGHT_SRC}
        alt="FIKRYON | فيكريون — Innovation & Technology"
        className="fk-logo fk-logo-light"
        data-testid="img-logo-light"
      />
      <img
        src={LOGO_DARK_SRC}
        alt=""
        aria-hidden="true"
        className="fk-logo fk-logo-dark"
        data-testid="img-logo-dark"
      />
    </div>
  );
}

/* ---------------- Controls ---------------- */
function Controls({ lang, theme, onLang, onTheme }: {
  lang: Lang; theme: "light" | "dark"; onLang: (l: Lang) => void; onTheme: () => void;
}) {
  const t = copy[lang];
  return (
    <div className="flex items-center gap-2">
      <div className="fk-pill" role="group" aria-label={t.langSwitch}>
        <span className="fk-pill-thumb" data-pos={lang === "ar" ? "start" : "end"} aria-hidden="true" />
        {(["ar", "en"] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onLang(l)}
            aria-pressed={lang === l}
            aria-label={l === "ar" ? "العربية" : "English"}
            lang={l}
            className="fk-pill-btn"
            data-active={lang === l}
            data-testid={`button-lang-${l}`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onTheme}
        className="fk-icon-btn"
        aria-label={theme === "dark" ? t.toLight : t.toDark}
        title={theme === "dark" ? t.toLight : t.toDark}
        data-testid="button-theme-toggle"
      >
        <span className="fk-theme-icon" data-show={theme === "dark"}><SunIcon /></span>
        <span className="fk-theme-icon" data-show={theme === "light"}><MoonIcon /></span>
      </button>
    </div>
  );
}

/* ---------------- Countdown ---------------- */
function Countdown({ lang }: { lang: Lang }) {
  const c = useCountdown();
  const t = copy[lang];
  const units: { k: keyof typeof t.units; v: number; pad: number }[] = [
    { k: "days", v: c.days, pad: 3 },
    { k: "hours", v: c.hours, pad: 2 },
    { k: "minutes", v: c.minutes, pad: 2 },
    { k: "seconds", v: c.seconds, pad: 2 },
  ];
  return (
    <section aria-label={t.countdownLabel} className="fk-rise" style={{ ["--d" as string]: "5" }}>
      <div className="grid grid-cols-4 gap-2 sm:gap-4" role="timer" aria-live="off">
        {units.map((u) => (
          <div key={u.k} className="fk-glass fk-unit" data-testid={`countdown-${u.k}`}>
            <span key={u.v} className="fk-digit">{fmt(u.v, lang, u.pad)}</span>
            <span className="fk-unit-label">{t.units[u.k]}</span>
          </div>
        ))}
      </div>
      <div className="fk-progress" data-testid="countdown-progress">
        <div className="fk-progress-label">
          <span>{t.timeRemaining}</span>
          <span className="fk-progress-value">{fmtPercent(c.percent, lang)}</span>
        </div>
        <div
          className="fk-progress-track"
          role="progressbar"
          aria-label={t.timeRemaining}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={c.percent}
          aria-valuetext={fmtPercent(c.percent, lang)}
        >
          <span className="fk-progress-fill" style={{ width: `${c.percent}%` }} />
        </div>
      </div>
      <p className="fk-final" data-testid="text-final-touches">
        <span className="fk-final-dot" aria-hidden="true" />
        {c.done ? t.launched : t.finalTouches}
      </p>
    </section>
  );
}

/* ---------------- Notify form ---------------- */
type Status = "idle" | "sending" | "success" | "error" | "invalid";

async function subscribe(email: string): Promise<void> {
  // EMAIL SUBSCRIPTION INTEGRATION HERE
  // Replace this stub with a real call, e.g.:
  //   await fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" },
  //     credentials: "include", body: JSON.stringify({ email }) });
  // Throw on failure so the UI shows the error state.
  void email;
  await new Promise((r) => setTimeout(r, 700));
}

function NotifyForm({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { setStatus("invalid"); return; }
    setStatus("sending");
    try { await subscribe(email.trim()); setStatus("success"); setEmail(""); }
    catch { setStatus("error"); }
  };

  return (
    <section className="fk-rise w-full" style={{ ["--d" as string]: "6" }} aria-labelledby="notify-title">
      <h2 id="notify-title" className="fk-section-title">{t.notifyTitle}</h2>
      {status === "success" ? (
        <div className="fk-success" role="status" data-testid="status-subscribe-success">
          <CheckIcon className="shrink-0" />
          <span>{t.success}</span>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="fk-form" data-state={status}>
          <label htmlFor="notify-email" className="sr-only">{t.emailLabel}</label>
          <MailIcon className="fk-form-icon" />
          <input
            id="notify-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (status !== "sending") setStatus("idle"); }}
            placeholder={t.placeholder}
            aria-invalid={status === "invalid"}
            aria-describedby="notify-msg"
            className="fk-input"
            data-testid="input-email"
          />
          <button type="submit" className="fk-cta" disabled={status === "sending"} data-testid="button-notify">
            <span>{status === "sending" ? t.sending : t.button}</span>
            <ArrowIcon className="fk-cta-arrow" />
          </button>
        </form>
      )}
      <p id="notify-msg" className="fk-form-msg" role="alert" data-testid="text-form-message">
        {status === "invalid" ? t.invalid : status === "error" ? t.error : ""}
      </p>
    </section>
  );
}

/* ---------------- Social ---------------- */
function SocialLink({ href, label, unavailable, icon, testId }: {
  href: string; label: string; unavailable: string; icon: ReactNode; testId: string;
}) {
  if (isPlaceholder(href)) {
    return (
      <span
        className="fk-social"
        data-disabled="true"
        role="link"
        aria-disabled="true"
        aria-label={`${label} — ${unavailable}`}
        title={`${label} — ${unavailable}`}
        data-testid={testId}
      >
        {icon}
      </span>
    );
  }
  const ext = href.startsWith("http");
  return (
    <a href={href} className="fk-social" aria-label={label} title={label} data-testid={testId}
      {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {icon}
    </a>
  );
}

/* ---------------- Page ---------------- */
export default function ComingSoon() {
  const { lang, theme, changeLang, toggleTheme } = usePreferences();
  const t = copy[lang];
  const emailHref = isPlaceholder(CONTACT_EMAIL) ? CONTACT_EMAIL : `mailto:${CONTACT_EMAIL}`;

  return (
    <div className="fk-page" data-lang={lang}>
      <div className="fk-atmos" aria-hidden="true">
        <div className="fk-glow fk-glow-a" />
        <div className="fk-glow fk-glow-b" />
        <div className="fk-grid" />
      </div>
      <NetworkBackground theme={theme} />
      <div className="fk-orbit" aria-hidden="true">
        <svg viewBox="0 0 800 800">
          <circle cx="400" cy="400" r="390" className="fk-orbit-ring" />
          <circle cx="400" cy="400" r="300" className="fk-orbit-ring fk-orbit-ring-2" />
          <g className="fk-orbit-spin"><circle cx="400" cy="10" r="4" className="fk-orbit-dot" /></g>
          <g className="fk-orbit-spin-rev"><circle cx="400" cy="100" r="3" className="fk-orbit-dot" /></g>
        </svg>
      </div>

      <header className="fk-header fk-rise" style={{ ["--d" as string]: "0" }}>
        <BrandLockup />
        <div className="fk-header-controls">
          <Controls lang={lang} theme={theme} onLang={changeLang} onTheme={toggleTheme} />
        </div>
      </header>

      <main key={lang} className="fk-main">
        <div className="fk-badge fk-rise" style={{ ["--d" as string]: "1" }} data-testid="text-badge">
          <span className="fk-badge-dot" aria-hidden="true" />
          {t.badge}
        </div>

        <h1 className="fk-heading fk-rise" style={{ ["--d" as string]: "2" }} data-testid="text-heading">
          {t.heading}
        </h1>

        <p className="fk-tagline fk-rise" style={{ ["--d" as string]: "3" }} data-testid="text-tagline">
          <span className="fk-rule" aria-hidden="true" />
          <span>{t.tagline}</span>
          <span className="fk-rule" aria-hidden="true" />
        </p>

        <p className="fk-desc fk-rise" style={{ ["--d" as string]: "4" }} data-testid="text-description">
          {t.description}
        </p>

        <div className="fk-stack">
          <Countdown lang={lang} />
          <NotifyForm lang={lang} />
        </div>
      </main>

      <footer className="fk-footer fk-rise" style={{ ["--d" as string]: "7" }}>
        <div className="fk-contact">
          <span className="fk-contact-title">{t.contact}</span>
          <div className="flex items-center gap-2.5">
            <SocialLink href={LINKEDIN_URL} label={t.linkedin} unavailable={t.unavailable} icon={<LinkedInIcon />} testId="link-linkedin" />
            <SocialLink href={TWITTER_URL} label={t.twitter} unavailable={t.unavailable} icon={<XIcon />} testId="link-twitter" />
            <SocialLink href={emailHref} label={t.email} unavailable={t.unavailable} icon={<MailIcon />} testId="link-email" />
          </div>
        </div>
        <p className="fk-copyright" data-testid="text-footer">{t.footer}</p>
      </footer>
    </div>
  );
}
