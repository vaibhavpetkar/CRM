# The page calls these methods by name through window.CRMApp.
-keepclassmembers class com.inveon.onecrm.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
