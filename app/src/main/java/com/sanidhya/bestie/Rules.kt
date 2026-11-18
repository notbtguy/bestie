package com.sanidhya.bestie

import org.json.JSONArray
import org.json.JSONObject

/**
 * Parsed rules file. Schema:
 * { "version": int, "hideSelectors": [string], "blockedExactPaths": [string],
 *   "allowedPathPatterns": [string], "script": string }
 * Optional extra key: "storySelectors": [string] (used when "Hide Stories" is on).
 */
data class Rules(
    val version: Int,
    val hideSelectors: List<String>,
    val blockedExactPaths: List<String>,
    val allowedPathPatterns: List<String>,
    val script: String,
    val storySelectors: List<String>,
    /** True only if these rules came from the configured HTTPS URL (fetched or cached from it). */
    val fromRemote: Boolean
) {
    companion object {
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
                // Make sure every pattern compiles.
                allowed.forEach { Regex(it) }
                Rules(version, hide, blocked, allowed, script, stories, fromRemote)
            } catch (e: Exception) {
                null
            }
        }

        private fun strings(a: JSONArray): List<String> =
            (0 until a.length()).map { a.getString(it) }
    }
}
