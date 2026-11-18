package com.sanidhya.bestie

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/** Exposed to the page as window.BestieBridge. JS calls these methods; we hop to the main thread. */
class BestieBridge(private val host: Host) {
    interface Host {
        fun onRouteChanged(url: String)
        fun onDebugInfo(json: String)
    }

    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun onRouteChange(url: String) {
        main.post { host.onRouteChanged(url) }
    }

    @JavascriptInterface
    fun onDebug(json: String) {
        main.post { host.onDebugInfo(json) }
    }
}
