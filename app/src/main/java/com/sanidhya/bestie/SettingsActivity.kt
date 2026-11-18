package com.sanidhya.bestie

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/** Toggles, "Reload rules", version label and the "Made by Sanidhya" footer. Main applies changes on resume. */
class SettingsActivity : AppCompatActivity() {
    private lateinit var prefs: PrefsStore
    private lateinit var debugInfo: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        prefs = PrefsStore(this)
        debugInfo = findViewById(R.id.debugInfo)

        listOf(R.id.switchBlockReels, R.id.switchDisableSwipe, R.id.switchStoriesOnlyHome,
            R.id.switchHideStories, R.id.switchDebug, R.id.reloadRules).forEach {
            findViewById<View>(it).visibility = View.GONE
        }
        refreshDebugInfo()

        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
        findViewById<TextView>(R.id.versionLabel).text = getString(R.string.version_label, version)
        findViewById<TextView>(R.id.madeByLink).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Constants.AUTHOR_URL)))
        }
    }

    private fun refreshDebugInfo() {
        debugInfo.visibility = View.VISIBLE
        debugInfo.text = "Three-tab mode: Messages, Activity, Profile.\nFeed filtering and remote scripts are disabled."
    }
}
