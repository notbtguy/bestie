package com.sanidhya.bestie

import android.content.Context

/** Lightweight navigation shell only. No remote content-hiding scripts are executed. */
object ScriptBuilder {
    private var cached: String? = null
    fun build(context: Context, rules: Rules, prefs: PrefsStore): String {
        val core = cached ?: context.assets.open("bestie_core.js").bufferedReader().use { it.readText() }.also { cached = it }
        return "window.__BESTIE_PROFILE_USERNAME = " + org.json.JSONObject.quote(prefs.profileUsername) + ";\n" + core
    }
}
