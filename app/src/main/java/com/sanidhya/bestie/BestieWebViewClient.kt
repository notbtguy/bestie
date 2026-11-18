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
        return when (UrlPolicy.decide(url, host.currentRules(), host.prefs())) {
            UrlPolicy.Decision.ALLOW -> false
            UrlPolicy.Decision.REDIRECT_HOME -> {
                view.loadUrl(Constants.HOME_URL)
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
        host.fallbackScript()?.let { view.evaluateJavascript(it, null) }
        host.onPageFinishedUi(url)
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) host.onLoadError()
    }
}
