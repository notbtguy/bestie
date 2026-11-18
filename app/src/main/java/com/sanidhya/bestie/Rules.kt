package com.sanidhya.bestie

import org.json.JSONArray
import org.json.JSONObject

/**
 * Parsed rules file. Schema:
 * { "version": int, "hideSelectors": [string], "blockedExactPaths": [string],
 *   "allowedPathPatterns": [string], "script": string }
 * Optional extra keys: "storySelectors": [string] (used when "Hide Stories" is on),
 * "homeFeedSelectors": [string] (hidden only on the home route when Stories-only home is on),
 * "homeFeedTextHeaders": [string] (suggestion-row headers hidden on the home route).
 */
data class Rules(
    val version: Int,
    val hideSelectors: List<String>,
    val blockedExactPaths: List<String>,
    val allowedPathPatterns: List<String>,
    val script: String,
    val storySelectors: List<String>,
    /** Selectors hidden only on the home route ("/") - the feed posts, not the stories tray. */
    val homeFeedSelectors: List<String>,
    /** Header texts of home suggestion/follow rows ("Suggestions for you" etc.), matched lowercase. */
    val homeFeedTextHeaders: List<String>,
    /** True only if these rules came from the configured HTTPS URL (fetched or cached from it). */
    val fromRemote: Boolean
) {
    companion object {
        /** Instagram wraps every home feed post (and suggested post) in an <article>. */
        private val DEFAULT_HOME_FEED = listOf("article")

        private val DEFAULT_HOME_HEADERS = listOf(
            "suggestions for you", "suggested for you", "suggested posts",
            "people you may know", "who to follow", "you might like"
        )

        /** Returns null if the JSON is invalid. */
        fun parse(json: String, fromRemote: Boolean): Rules? {
            return try {
                val o = JSONObject(json)
                val version = o.getInt("version")
                val hide = strings(o.getJSONArray("hideSelectors"))
                val blocked = strings(o.getJSONArray("blockedExactPaths"))
                val allowed = strings(o.getJSONArray("allowedPathPatterns"))
                val script = o.optString("script", "")
                val stories = if (o.has("storySelectors")) strings(o.getJSONArray("storySelectors")) else emptyList()
                val homeFeed = if (o.has("homeFeedSelectors")) strings(o.getJSONArray("homeFeedSelectors")) else DEFAULT_HOME_FEED
                val homeHeaders = if (o.has("homeFeedTextHeaders")) strings(o.getJSONArray("homeFeedTextHeaders")) else DEFAULT_HOME_HEADERS
                // Make sure every pattern compiles.
                allowed.forEach { Regex(it) }
                Rules(version, hide, blocked, allowed, script, stories, homeFeed, homeHeaders, fromRemote)
            } catch (e: Exception) {
                null
            }
        }

        private fun strings(a: JSONArray): List<String> =
            (0 until a.length()).map { a.getString(it) }
    }
}
