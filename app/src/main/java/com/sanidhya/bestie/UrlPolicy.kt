package com.sanidhya.bestie

import android.net.Uri

/** Decides what to do with a URL. Used by the WebViewClient and by JS route-change reports. */
object UrlPolicy {
    enum class Decision { ALLOW, REDIRECT_HOME, EXTERNAL }

    fun isInstagramHost(host: String?): Boolean {
        val h = host?.lowercase() ?: return false
        return h == "instagram.com" || h.endsWith(".instagram.com")
    }

    private fun normalize(path: String): String {
        val p = if (path.isEmpty()) "/" else path
        return if (p.endsWith("/")) p else "$p/"
    }

    fun decide(url: String, rules: Rules, prefs: PrefsStore): Decision {
        val uri = Uri.parse(url)
        val scheme = uri.scheme?.lowercase()
        if (scheme == "about" || scheme == "blob" || scheme == "data") return Decision.ALLOW
        if (scheme != "http" && scheme != "https") return Decision.EXTERNAL
        if (!isInstagramHost(uri.host)) return Decision.EXTERNAL

        // Avoid entry to the endless surfaces by routing, not filtering their content.
        val path = normalize(uri.path ?: "/")
        if (path == "/" || path.startsWith("/explore/") || path == "/reels/") return Decision.REDIRECT_HOME
        return Decision.ALLOW
    }
}
