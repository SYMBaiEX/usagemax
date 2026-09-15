import Link from "next/link";
import { authErrors, authHref, type AuthContext, type AuthMode } from "@/lib/auth-flow";
import { BrandIcon } from "./brand-icon";
import { ThemeControls } from "./theme-controls";
import { ArrowRight, ArrowUpRight } from "./icons";
import { AuthButtons } from "./auth-buttons";
import { AuthSculpture } from "./auth-sculpture";
import { CodeField } from "./code-field";
import styles from "./auth-page.module.css";

export function AuthPage({ mode, context, error }: { mode: AuthMode; context: AuthContext; error?: string }) {
  const signup = mode === "sign-up";
  const message = error && Object.hasOwn(authErrors, error) ? authErrors[error] : undefined;
  const alternate = signup ? "sign-in" : "sign-up";
  return <div className={styles.page} data-auth-page={mode}>
    <header className={styles.header}>
      <Link className="brand" href="/" aria-label="UsageMax home"><BrandIcon /><span className="brand-wordmark">Usage<span>Max</span></span></Link>
      <div className={styles.headerRight}><Link href="/docs">Documentation <ArrowUpRight size={13} /></Link><ThemeControls /></div>
    </header>
    <div className={styles.layout}>
      <aside className={styles.exhibit} aria-label="Your UsageMax account">
        <AuthSculpture />
        <div className={styles.exhibitCopy}>
          <p className={styles.kicker}>Many sources. One perspective.</p>
          <h2>{signup ? <>Make your<br />work count.</> : <>Your work.<br />In perspective.</>}</h2>
          <p>Tokens, costs, and the rhythm of building.<br />Together, across your computers.</p>
        </div>
        <div className={styles.codeWindow} aria-hidden="true"><CodeField /><div className={styles.codeForeground}><span>usage.config</span><code><b>privacy</b>: <em>{'"yours"'}</em><br /><b>sources</b>: <em>{'"connected"'}</em><br /><b>perspective</b>: <em>{'"complete"'}</em></code></div><span className={styles.codeCursor}>▌</span></div>
        <div className={styles.exhibitFoot}><a href="https://github.com/SYMBaiEX/usagemax" target="_blank" rel="noreferrer">View source <ArrowUpRight size={13} /></a></div>
      </aside>
      <section className={styles.access} aria-labelledby="auth-title">
        <div className={styles.form}>
          <div className={styles.accessLabel}><span className={styles.statusLight} /><span>{signup ? "A fresh perspective" : "Pick up where you left off"}</span></div>
          <h1 id="auth-title">{signup ? <>Create your<br /><span>account.</span></> : <>Welcome<br /><span>back.</span></>}</h1>
          <p className={styles.description}>{signup ? "Start tracking your AI usage. Free for individuals." : "Sign in to your UsageMax workspace."}</p>
          {(context.invitationToken || context.organizationId) && <p className={styles.contextNote}>You’re joining a workspace. Use the account associated with your invitation.</p>}
          {message && <div role="alert" className={styles.error}><p>{message}</p>{error === "verification" && <a href={authHref("/auth/hosted", mode, context)}>Continue with secure verification <ArrowRight size={14} /></a>}</div>}
          <AuthButtons mode={mode} context={context} />
          <a className={styles.sso} href={authHref("/auth/hosted", mode, context)}><span><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 21V4l7-2 7 2v17M2 21h20M9 21v-5h6v5M9 7h1m4 0h1M9 11h1m4 0h1" /></svg>Continue with SSO</span><ArrowRight size={15} /></a>
          <p className={styles.switch}>{signup ? "Already have an account?" : "New to UsageMax?"} <Link href={authHref(`/${alternate}`, alternate, context)}>{signup ? "Sign in" : "Create an account"} <ArrowUpRight size={12} /></Link></p>
          <div className={styles.assurance}><svg width="15" height="17" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m10 1 8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V4l8-3Z"/><path d="m6 10 3 3 5-6"/></svg><p>{signup ? "Private by default. Publish only when you choose." : "Same account. Every connected computer."}</p></div>
          <p className={styles.terms}>{signup ? "By continuing, you agree to our " : "Protected by WorkOS. "}{signup ? <><Link href="/terms">Terms</Link> and acknowledge our <Link href="/privacy">Privacy Policy</Link>.</> : <Link href="/privacy">Your privacy matters.</Link>}</p>
        </div>
      </section>
    </div>
    <footer className={styles.footer}><span>© {new Date().getUTCFullYear()} UsageMax</span><div><a href="mailto:hello@usagemax.com">Need a hand?</a><Link href="/security">Security <ArrowUpRight size={12} /></Link></div></footer>
  </div>;
}
