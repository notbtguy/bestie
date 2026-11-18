package com.sanidhya.bestie

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Loads the rules: remote JSON (5 s timeout) -> cached copy -> built-in assets/rules.json.
 */
class RulesRepository(private val context: Context, private val prefs: PrefsStore) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .callTimeout(5, TimeUnit.SECONDS)
        .build()

    /** Fast, local-only load: cache first, then the built-in asset. Safe on the main thread. */
    fun loadLocal(): Rules {
        prefs.cachedRulesJson?.let { cached ->
            Rules.parse(cached, fromRemote = true)?.let {
                prefs.rulesStatus = "cached remote v${it.version}"
                return it
            }
        }
        val text = context.assets.open("rules.json").bufferedReader().use { it.readText() }
        val rules = Rules.parse(text, fromRemote = false)
            ?: Rules(
                1, listOf("a[href=\"/reels/\"]"), listOf("/reels/"), listOf("^/reels?/[^/]+/?$"), "",
                emptyList(), listOf("article"),
                listOf("suggestions for you", "suggested for you", "suggested posts", "people you may know"),
                false
            )
        prefs.rulesStatus = "built-in default v${rules.version}"
        return rules
    }

    /** Fetches the remote rules off the main thread. Returns null on any failure. */
    suspend fun fetchRemote(): Rules? = withContext(Dispatchers.IO) {
        val url = Constants.RULES_URL
        if (!url.startsWith("https://") || url.contains("your-site.vercel.app")) {
            return@withContext null // not configured yet
        }
        try {
            val req = Request.Builder().url(url).build()
            client.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext null
                val body = resp.body?.string() ?: return@withContext null
                val rules = Rules.parse(body, fromRemote = true) ?: return@withContext null
                prefs.cachedRulesJson = body // only valid JSON is cached
                prefs.rulesStatus = "remote v${rules.version}"
                rules
            }
        } catch (e: Exception) {
            null
        }
    }
}
