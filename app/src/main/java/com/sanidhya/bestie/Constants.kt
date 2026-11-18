package com.sanidhya.bestie

/** App-wide constants. Edit RULES_URL to point at your hosted rules.json. */
object Constants {
    /** Owner-controlled selector rules; cached locally for offline startup. */
    const val RULES_URL = "https://raw.githubusercontent.com/notbtguy/bestie/main/rules.json"

    const val HOME_URL = "https://www.instagram.com/"
    const val LOGIN_URL = "https://www.instagram.com/accounts/login/"
    const val INBOX_URL = "https://www.instagram.com/direct/inbox/"
    const val AUTHOR_URL = "https://notbtguy.vercel.app"

    /** Mobile Chrome user agent. Update the version number now and then. */
    const val USER_AGENT =
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/120.0.0.0 Mobile Safari/537.36"

    /** True when Instagram's session cookie is present (cookie is HttpOnly, so check natively). */
    fun hasSession(): Boolean {
        val c = android.webkit.CookieManager.getInstance().getCookie("https://www.instagram.com") ?: return false
        return c.contains("sessionid=")
    }

    /** Logged out: go straight to the login form, skipping the "Log in / Open app" interstitial. */
    fun startUrl(): String = if (hasSession()) HOME_URL else LOGIN_URL
}
