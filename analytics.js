// Google Tag Manager with Consent Mode defaults. Loaded early in <head>
// (not deferred) so consent defaults are set before GTM starts. Kept out of
// inline <script> so the Content Security Policy can forbid inline scripts.
//
// Analytics stay denied until the visitor accepts in the consent banner
// (app.js sends the 'update'). Ad storage is always denied.
window.dataLayer = window.dataLayer || [];
function gtag() {
    window.dataLayer.push(arguments);
}

(function () {
    var choice = null;
    try {
        choice = localStorage.getItem('analyticsConsent');
    } catch (e) {
        // Storage unavailable: analytics stay denied.
    }
    gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: choice === 'granted' ? 'granted' : 'denied'
    });

    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-MSLPPPW6';
    document.head.appendChild(script);
})();
