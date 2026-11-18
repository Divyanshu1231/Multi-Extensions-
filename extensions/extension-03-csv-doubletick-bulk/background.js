chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "sendTemplate") return;

  (async () => {
    try {
      const proxyUrl = "https://doubletick-proxy.divyanshusrivastava1021.workers.dev";
      const proxySecret = "CONFIGURE_SERVER_SIDE_PROXY_SECRET";

      const body = {
        to: msg.phone,
        from: msg.from,
        templateName: msg.templateName,
        language: msg.language || "en"
      };

      const response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Proxy-Secret": proxySecret
        },
        body: JSON.stringify(body)
      });

      const responseText = await response.text();
      let responseData = {};
      try {
        responseData = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseData = { raw: responseText || "" };
      }

      sendResponse({
        ok: response.ok,
        status: response.status,
        data: responseData,
        responseText
      });
    } catch (e) {
      sendResponse({ ok:false, status:0, error:e?.message || String(e) });
    }
  })();

  return true;
});