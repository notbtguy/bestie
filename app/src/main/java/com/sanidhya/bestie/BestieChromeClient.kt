package com.sanidhya.bestie

import android.net.Uri
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

/** Handles progress, file uploads (photos in DMs), camera permission and fullscreen video. */
class BestieChromeClient(private val host: Host) : WebChromeClient() {

    interface Host {
        fun onProgress(percent: Int)
        fun onFileChooser(callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean
        fun onShowCustom(view: View, callback: CustomViewCallback)
        fun onHideCustom()
        fun onWebPermission(request: PermissionRequest)
    }

    override fun onProgressChanged(view: WebView, newProgress: Int) = host.onProgress(newProgress)

    override fun onShowFileChooser(
        webView: WebView,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: FileChooserParams
    ): Boolean = host.onFileChooser(filePathCallback, fileChooserParams)

    override fun onShowCustomView(view: View, callback: CustomViewCallback) = host.onShowCustom(view, callback)

    override fun onHideCustomView() = host.onHideCustom()

    override fun onPermissionRequest(request: PermissionRequest) = host.onWebPermission(request)
}
