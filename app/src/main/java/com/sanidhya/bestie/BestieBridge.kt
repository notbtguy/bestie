package com.sanidhya.bestie

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/** Exposed to the page as window.BestieBridge. JS calls these methods; we hop to the main thread. */
class BestieBridge(private val host: Host, private val context: android.content.Context) {
    interface Host {
        fun onRouteChanged(url: String)
        fun onDebugInfo(json: String)
        fun onReelGuardChanged(active: Boolean)
    }

    private val main = Handler(Looper.getMainLooper())

    private fun accountId(): String? {
        val cookies = android.webkit.CookieManager.getInstance().getCookie("https://www.instagram.com") ?: return null
        return cookies.split(';').map { it.trim() }.firstOrNull { it.startsWith("ds_user_id=") }
            ?.substringAfter('=')?.takeIf { it.matches(Regex("^[0-9]+$")) }
    }

    @JavascriptInterface
    fun profileUsername(): String {
        val id = accountId() ?: return ""
        return context.getSharedPreferences("bestie_account_profiles", android.content.Context.MODE_PRIVATE)
            .getString(id, "") ?: ""
    }

    @JavascriptInterface
    fun rememberProfile(username: String) {
        if (!Regex("^[A-Za-z0-9_.]{1,30}$").matches(username)) return
        val id = accountId() ?: return
        context.getSharedPreferences("bestie_account_profiles", android.content.Context.MODE_PRIVATE)
            .edit().putString(id, username).apply()
    }


    @JavascriptInterface
    fun onRouteChange(url: String) {
        main.post { host.onRouteChanged(url) }
    }

    @JavascriptInterface
    fun onReelGuard(active: Boolean) { main.post { host.onReelGuardChanged(active) } }

    @JavascriptInterface
    fun onDebug(json: String) {
        main.post { host.onDebugInfo(json) }
    }
}
