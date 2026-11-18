package com.sanidhya.bestie

import android.content.Context
import android.content.SharedPreferences

/** Small wrapper around SharedPreferences for toggles and the cached rules copy. */
class PrefsStore(context: Context) {
    private val sp: SharedPreferences =
        context.applicationContext.getSharedPreferences("bestie_prefs", Context.MODE_PRIVATE)

    var profileUsername: String
        get() = sp.getString("profile_username", "") ?: ""
        set(v) = sp.edit().putString("profile_username", v).apply()

    var blockReels: Boolean
        get() = sp.getBoolean("block_reels", true)
        set(v) = sp.edit().putBoolean("block_reels", v).apply()

    var disableSwipe: Boolean
        get() = sp.getBoolean("disable_swipe", true)
        set(v) = sp.edit().putBoolean("disable_swipe", v).apply()

    /** Home route shows only the stories tray; feed posts are hidden. */
    var storiesOnlyHome: Boolean
        get() = sp.getBoolean("stories_only_home", true)
        set(v) = sp.edit().putBoolean("stories_only_home", v).apply()

    var hideStories: Boolean
        get() = sp.getBoolean("hide_stories", false)
        set(v) = sp.edit().putBoolean("hide_stories", v).apply()

    var debug: Boolean
        get() = sp.getBoolean("debug", false)
        set(v) = sp.edit().putBoolean("debug", v).apply()

    /** Last valid rules JSON fetched from the remote URL. */
    var cachedRulesJson: String?
        get() = sp.getString("cached_rules", null)
        set(v) = sp.edit().putString("cached_rules", v).apply()

    /** Human readable note about which rules are active (shown in the debug panel). */
    var rulesStatus: String
        get() = sp.getString("rules_status", "built-in default") ?: "built-in default"
        set(v) = sp.edit().putString("rules_status", v).apply()
}
