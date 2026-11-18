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
    private lateinit var repo: RulesRepository
    private lateinit var debugInfo: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        prefs = PrefsStore(this)
        repo = RulesRepository(this, prefs)
        debugInfo = findViewById(R.id.debugInfo)

        bind(R.id.switchBlockReels, prefs.blockReels) { prefs.blockReels = it }
        bind(R.id.switchDisableSwipe, prefs.disableSwipe) { prefs.disableSwipe = it }
        bind(R.id.switchStoriesOnlyHome, prefs.storiesOnlyHome) { prefs.storiesOnlyHome = it }
        bind(R.id.switchHideStories, prefs.hideStories) { prefs.hideStories = it }
        bind(R.id.switchDebug, prefs.debug) {
            prefs.debug = it
            refreshDebugInfo()
        }
        refreshDebugInfo()

        findViewById<Button>(R.id.reloadRules).setOnClickListener {
            Toast.makeText(this, R.string.rules_reloading, Toast.LENGTH_SHORT).show()
            lifecycleScope.launch {
                val r = repo.fetchRemote()
                val msg = if (r != null) R.string.rules_reloaded else R.string.rules_reload_failed
                Toast.makeText(this@SettingsActivity, msg, Toast.LENGTH_LONG).show()
                refreshDebugInfo()
            }
        }

        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
        findViewById<TextView>(R.id.versionLabel).text = getString(R.string.version_label, version)
        findViewById<TextView>(R.id.madeByLink).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(Constants.AUTHOR_URL)))
        }
    }

    private fun bind(id: Int, initial: Boolean, onChange: (Boolean) -> Unit) {
        val s = findViewById<SwitchCompat>(id)
        s.isChecked = initial
        s.setOnCheckedChangeListener { _, checked -> onChange(checked) }
    }

    private fun refreshDebugInfo() {
        if (prefs.debug) {
            debugInfo.visibility = View.VISIBLE
            debugInfo.text = "Rules: ${prefs.rulesStatus}\nRules URL: ${Constants.RULES_URL}"
        } else {
            debugInfo.visibility = View.GONE
        }
    }
}
