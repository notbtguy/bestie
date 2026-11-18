package com.sanidhya.bestie

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Builds the JavaScript injected into every Instagram page from the rules and the settings. */
object ScriptBuilder {
    private var coreCache: String? = null

    private fun core(context: Context): String =
        coreCache ?: context.assets.open("bestie_core.js").bufferedReader().use { it.readText() }
            .also { coreCache = it }

    fun build(context: Context, rules: Rules, prefs: PrefsStore): String {
        val cfg = JSONObject()
        cfg.put("version", rules.version)
        cfg.put("hideSelectors", JSONArray(rules.hideSelectors))
        cfg.put("storySelectors", JSONArray(rules.storySelectors))
        cfg.put("blockedExactPaths", JSONArray(rules.blockedExactPaths))
        cfg.put("allowedPathPatterns", JSONArray(rules.allowedPathPatterns))
        cfg.put("blockReels", prefs.blockReels)
        cfg.put("disableSwipe", prefs.disableSwipe)
        cfg.put("hideStories", prefs.hideStories)
        cfg.put("debug", prefs.debug)
        cfg.put("rulesStatus", prefs.rulesStatus)

        val sb = StringBuilder()
        sb.append("window.__BESTIE_CONFIG = ").append(cfg.toString()).append(";\n")
        sb.append(core(context)).append("\n")
        // Remote script runs only when the rules came from the configured HTTPS URL.
        if (rules.fromRemote && Constants.RULES_URL.startsWith("https://") && rules.script.isNotBlank()) {
            sb.append("try {\n").append(rules.script).append("\n} catch (e) { console.log('bestie remote script error', e); }\n")
        }
        return sb.toString()
    }
}
