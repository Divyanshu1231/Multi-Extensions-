"use strict";

function safeResponse(status, ok, responseText) {
    let responseData = {};
    try {
        responseData = responseText ? JSON.parse(responseText) : {};
    } catch {
        responseData = { raw: responseText || "" };
    }

    return { status, ok, responseData, responseText };
}

/*
 * The extension no longer calls public.doubletick.io directly —
 * that address is not allow-listed anywhere in this codebase
 * anymore, and the DoubleTick API key is never stored here.
 * This sends the message intent to YOUR serverless proxy, which
 * holds the real DoubleTick key server-side (as an environment
 * variable on the proxy) and makes the actual DoubleTick call.
 *
 * The proxy secret sent here is NOT the DoubleTick API key — it
 * is a separate shared token you configure both in the proxy's
 * environment variables and in this extension's settings, so
 * that a stranger who stumbles on your proxy URL can't use it
 * without also knowing that token.
 */
async function doProxyRequest(data) {
    const proxyUrl = "https://doubletick-proxy.divyanshusrivastava1021.workers.dev";
    const proxySecret = "CONFIGURE_SERVER_SIDE_PROXY_SECRET";
    const body = data?.body;

    if (!proxyUrl) throw new Error("DoubleTick Proxy URL missing.");
    if (!proxySecret) throw new Error("Proxy Secret missing.");
    if (!proxyUrl.startsWith("https://")) {
        throw new Error("Proxy URL must start with https://");
    }

    const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Proxy-Secret": proxySecret
        },
        body: JSON.stringify(body || {})
    });

    const text = await response.text();
    const result = safeResponse(response.status, response.ok, text);

    if (result.status === 401 || result.status === 403) {
        result.browserAccessHint =
            "The proxy rejected this request (HTTP " + result.status + "). " +
            "This means the extension reached YOUR proxy but the Proxy " +
            "Secret didn't match what's configured on the proxy, or the " +
            "proxy itself is misconfigured. This is not a DoubleTick error " +
            "— DoubleTick access was already proven to work from curl.";
    }

    return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action === "PROXY_REQUEST") {
        doProxyRequest(message.data)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});
