package com.sanidhya.bestie

import android.graphics.Bitmap
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/** Intercepts navigation: keeps Instagram inside the app, sends everything else out, blocks /reels/. */
class BestieWebViewClient(private val host: Host) : WebViewClient() {

    interface Host {
        fun currentRules(): Rules
        fun prefs(): PrefsStore
        fun openExternal(url: String)
        fun onPageStartedUi()
        fun onPageFinishedUi(url: String?)
        fun onLoadError()
        /** Script to inject in onPageFinished when document-start injection is unavailable, else null. */
        fun fallbackScript(): String?
    }

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        // Do not let the single-reel viewer chain into another reel through a full navigation.
        val current = android.net.Uri.parse(view.url ?: "")
        val next = request.url
        val reel = Regex("^/reels?/[^/]+/?$")
        if (request.isForMainFrame && UrlPolicy.isInstagramHost(current.host) &&
            UrlPolicy.isInstagramHost(next.host) && reel.matches(current.path ?: "") &&
            reel.matches(next.path ?: "") && current.path?.trimEnd('/') != next.path?.trimEnd('/')) return true
        return when (UrlPolicy.decide(url, host.currentRules(), host.prefs())) {
            UrlPolicy.Decision.ALLOW -> false
            UrlPolicy.Decision.REDIRECT_HOME -> {
                view.loadUrl(Constants.startUrl())
                true
            }
            UrlPolicy.Decision.EXTERNAL -> {
                host.openExternal(url)
                true
            }
        }
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        host.onPageStartedUi()
    }

    override fun onPageFinished(view: WebView, url: String?) {
        // Logged-out visit to the home route shows a web interstitial: jump to the login form.
        try {
            val u = android.net.Uri.parse(url ?: "")
            if (UrlPolicy.isInstagramHost(u.host) && (u.path ?: "/").trim('/').isEmpty()) {
                view.loadUrl(Constants.startUrl())
                return
            }
        } catch (e: Exception) {}
        host.fallbackScript()?.let { view.evaluateJavascript(it, null) }
        host.onPageFinishedUi(url)
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) host.onLoadError()
    }
}
