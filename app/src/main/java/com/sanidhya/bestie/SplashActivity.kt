package com.sanidhya.bestie

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.ImageButton
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

/**
 * Shows the logo, name and "A Sanidhya Production" footer for 2 seconds, then opens MainActivity.
 * The gear in the top-right opens Settings instead; when Settings closes, MainActivity opens.
 */
class SplashActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val goNext = Runnable { openMain() }

    private val settingsLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            openMain()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)
        findViewById<TextView>(R.id.splashLink).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Constants.AUTHOR_URL)))
        }
        findViewById<ImageButton>(R.id.splashSettings).setOnClickListener {
            handler.removeCallbacks(goNext)
            settingsLauncher.launch(Intent(this, SettingsActivity::class.java))
        }
        handler.postDelayed(goNext, 2000)
    }

    private fun openMain() {
        if (isFinishing) return
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    override fun onDestroy() {
        handler.removeCallbacks(goNext)
        super.onDestroy()
    }
}
