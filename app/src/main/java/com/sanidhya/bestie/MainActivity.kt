package com.sanidhya.bestie

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.launch

/** Main screen: one full-screen Instagram WebView, a progress bar and an offline screen. */
class MainActivity : AppCompatActivity(),
    BestieWebViewClient.Host, BestieChromeClient.Host, BestieBridge.Host {

    private lateinit var webView: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var progress: ProgressBar
    private lateinit var offlineView: View
    private lateinit var customContainer: FrameLayout
    private lateinit var prefs: PrefsStore
    private lateinit var repo: RulesRepository
    private lateinit var rules: Rules

    private var scriptHandler: ScriptHandler? = null
    private var docStartSupported = false
    private var currentScript = ""
    private var started = false

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingChooserIntent: Intent? = null
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null
    private var pendingWebPermission: PermissionRequest? = null

    private val fileLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            val uris: Array<Uri>? = if (result.resultCode == RESULT_OK) {
                WebChromeClient.FileChooserParams.parseResult(result.resultCode, data)
            } else null
            fileCallback?.onReceiveValue(uris)
            fileCallback = null
        }

    private val storagePermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            // The system picker works either way, so continue regardless of the answer.
            launchPendingChooser()
        }

    private val cameraPermLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val req = pendingWebPermission
            pendingWebPermission = null
            if (req != null) {
                if (granted) req.grant(req.resources) else req.deny()
            }
        }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        prefs = PrefsStore(this)
        repo = RulesRepository(this, prefs)
        rules = repo.loadLocal()

        webView = findViewById(R.id.webView)
        swipe = findViewById(R.id.swipeRefresh)
        progress = findViewById(R.id.progressBar)
        offlineView = findViewById(R.id.offlineView)
        customContainer = findViewById(R.id.customViewContainer)

        configureWebView()
        installScript()

        swipe.setColorSchemeResources(R.color.bestie_purple)
        swipe.setOnRefreshListener { webView.reload() }
        swipe.setOnChildScrollUpCallback { _, _ -> webView.scrollY > 0 }

        findViewById<View>(R.id.retryButton).setOnClickListener { retry() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> onHideCustom()
                    webView.canGoBack() -> webView.goBack()
                    else -> finish()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else if (isOnline()) {
            webView.loadUrl(Constants.startUrl())
        } else {
            showOffline(true)
        }

        // Refresh rules in the background; apply if we got a valid new copy.
        lifecycleScope.launch {
            repo.fetchRemote()?.let {
                rules = it
                applySettingsLive()
            }
        }
        started = true
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun configureWebView() {
        val s = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        @Suppress("DEPRECATION")
        s.databaseEnabled = true
        s.userAgentString = Constants.USER_AGENT
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.mediaPlaybackRequiresUserGesture = false
        s.javaScriptCanOpenWindowsAutomatically = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        s.offscreenPreRaster = true // pre-render offscreen content for smoother scrolling

        val cm = CookieManager.getInstance()
        cm.setAcceptCookie(true)
        cm.setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(BestieBridge(this), "BestieBridge")
        webView.webViewClient = BestieWebViewClient(this)
        webView.webChromeClient = BestieChromeClient(this)
    }

    /** (Re)builds the injected script. Uses document-start injection when the WebView supports it. */
    private fun installScript() {
        currentScript = ScriptBuilder.build(this, rules, prefs)
        docStartSupported = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
        if (docStartSupported) {
            scriptHandler?.remove()
            scriptHandler = WebViewCompat.addDocumentStartJavaScript(
                webView, currentScript, setOf("https://*.instagram.com", "https://instagram.com")
            )
        }
    }

    /** Applies changed settings or rules to the running page without reloading. */
    private fun applySettingsLive() {
        installScript()
        webView.evaluateJavascript(currentScript, null)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        if (started) {
            // Settings may have changed, or rules were reloaded from Settings.
            rules = repo.loadLocal()
            applySettingsLive()
        }
    }

    override fun onPause() {
        webView.onPause()
        CookieManager.getInstance().flush() // persist the session
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    // ---- connectivity ----
    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun showOffline(show: Boolean) {
        offlineView.visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun retry() {
        if (!isOnline()) return
        showOffline(false)
        if (webView.url == null) webView.loadUrl(Constants.startUrl()) else webView.reload()
    }

    // ---- BestieWebViewClient.Host ----
    override fun currentRules(): Rules = rules
    override fun prefs(): PrefsStore = prefs

    override fun openExternal(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: ActivityNotFoundException) {
            // No app can open it; ignore.
        }
    }

    override fun onPageStartedUi() {
        progress.visibility = View.VISIBLE
    }

    override fun onPageFinishedUi(url: String?) {
        progress.visibility = View.GONE
        swipe.isRefreshing = false
        if (isOnline()) showOffline(false)
    }

    override fun onLoadError() {
        swipe.isRefreshing = false
        progress.visibility = View.GONE
        if (!isOnline()) showOffline(true)
    }

    override fun fallbackScript(): String? = if (docStartSupported) null else currentScript

    // ---- BestieBridge.Host ----
    override fun onRouteChanged(url: String) {
        // Same rules as navigation interception, for SPA route changes with no page load.
        when (UrlPolicy.decide(url, rules, prefs)) {
            UrlPolicy.Decision.REDIRECT_HOME -> webView.loadUrl(Constants.startUrl())
            else -> Unit
        }
    }

    override fun onDebugInfo(json: String) {
        // The on-page debug panel already shows matches; nothing else to do natively.
    }

    // ---- BestieChromeClient.Host ----
    override fun onProgress(percent: Int) {
        progress.progress = percent
        progress.visibility = if (percent >= 100) View.GONE else View.VISIBLE
    }

    override fun onFileChooser(
        callback: ValueCallback<Array<Uri>>,
        params: WebChromeClient.FileChooserParams
    ): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        pendingChooserIntent = try {
            params.createIntent()
        } catch (e: Exception) {
            null
        }
        val perms = if (Build.VERSION.SDK_INT >= 33) {
            arrayOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO)
        } else {
            arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        val missing = perms.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) launchPendingChooser() else storagePermLauncher.launch(missing.toTypedArray())
        return true
    }

    private fun launchPendingChooser() {
        val intent = pendingChooserIntent
        pendingChooserIntent = null
        if (intent == null) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
            return
        }
        try {
            fileLauncher.launch(intent)
        } catch (e: ActivityNotFoundException) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
        }
    }

    override fun onShowCustom(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (customView != null) {
            callback.onCustomViewHidden()
            return
        }
        customView = view
        customCallback = callback
        customContainer.addView(view)
        customContainer.visibility = View.VISIBLE
        val c = WindowInsetsControllerCompat(window, window.decorView)
        c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        c.hide(WindowInsetsCompat.Type.systemBars())
    }

    override fun onHideCustom() {
        val v = customView ?: return
        customContainer.removeView(v)
        customContainer.visibility = View.GONE
        customView = null
        customCallback?.onCustomViewHidden()
        customCallback = null
        WindowInsetsControllerCompat(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
    }

    override fun onWebPermission(request: PermissionRequest) {
        val wantsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
        if (!wantsCamera) {
            request.deny()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        } else {
            pendingWebPermission = request
            cameraPermLauncher.launch(Manifest.permission.CAMERA)
        }
    }
}
