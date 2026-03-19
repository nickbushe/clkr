;(function () {
  "use strict";

  if (window.NetClkrModule && window.NetClkrModule.initialized) {
    return;
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function logInfo(message, data) {
    if (typeof console !== "undefined" && typeof console.info === "function") {
      console.info(message, data || {});
    }
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function matchesPattern(value, pattern) {
    if (!pattern) {
      return false;
    }

    if (pattern === "*") {
      return true;
    }

    if (pattern.indexOf("regex:") === 0) {
      try {
        return new RegExp(pattern.slice(6)).test(value);
      } catch (error) {
        return false;
      }
    }

    return value.indexOf(pattern) !== -1;
  }

  function matchesRule(link, rule) {
    var href = link.href || "";
    var text = (link.textContent || "").trim();
    var selector = typeof rule.selector === "string" ? rule.selector : "";
    var urlPattern = typeof rule.urlPattern === "string" ? rule.urlPattern : "";
    var textPattern = typeof rule.textPattern === "string" ? rule.textPattern : "";

    if (selector && !link.matches(selector)) {
      return false;
    }

    if (urlPattern && !matchesPattern(href, urlPattern)) {
      return false;
    }

    if (textPattern && !matchesPattern(text, textPattern)) {
      return false;
    }

    return true;
  }

  function findRuleForLink(link, rules) {
    var i;

    for (i = 0; i < rules.length; i += 1) {
      if (matchesRule(link, rules[i])) {
        return rules[i];
      }
    }

    return null;
  }

  function resolveTargetUrl(rule, link) {
    if (typeof rule.redirectTo === "string" && rule.redirectTo) {
      return rule.redirectTo;
    }

    if (isObject(rule.popup) && typeof rule.popup.url === "string" && rule.popup.url) {
      return rule.popup.url;
    }

    return link.href;
  }

  function buildPopup(rule, fallbackHref) {
    var settings = isObject(rule.popup) ? rule.popup : {};
    var width = typeof settings.width === "number" ? settings.width : 640;
    var height = typeof settings.height === "number" ? settings.height : 720;
    var left = Math.max(0, Math.round((window.screen.width - width) / 2));
    var top = Math.max(0, Math.round((window.screen.height - height) / 2));
    var features = [
      "popup=yes",
      "width=" + width,
      "height=" + height,
      "left=" + left,
      "top=" + top,
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");

    window.open(settings.url || fallbackHref, settings.name || "_blank", features);
  }

  function sendLog(logUrl, payload) {
    if (!logUrl) {
      return;
    }

    var body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      navigator.sendBeacon(logUrl, new Blob([body], { type: "application/json" }));
      return;
    }

    fetch(logUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
      credentials: "omit"
    }).catch(function () {});
  }

  function handleRuleAction(link, rule, payload, event) {
    var action = typeof rule.action === "string" ? rule.action : "redirect";
    var targetUrl = resolveTargetUrl(rule, link);

    logInfo("[NetClkr] rule:matched", {
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: action,
      href: link.href,
      targetUrl: targetUrl
    });

    if (rule.preventDefault !== false) {
      event.preventDefault();
    }

    sendLog(payload.logUrl, {
      type: "link_action",
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: action,
      href: link.href,
      targetUrl: targetUrl,
      ts: new Date().toISOString()
    });

    if (action === "ignore") {
      return;
    }

    if (action === "popup") {
      buildPopup(rule, targetUrl);
      return;
    }

    if (action === "redirect") {
      window.location.assign(targetUrl);
      return;
    }

    if (action === "replace") {
      window.location.replace(targetUrl);
    }
  }

  window.NetClkrModule = {
    initialized: true,
    mount: function (payload) {
      if (!isObject(payload) || payload.interceptLinks === false) {
        logInfo("[NetClkr] module:mount-skipped", {
          reason: "invalid_payload_or_intercept_disabled"
        });
        return;
      }

      var rules = toArray(payload.rules).filter(isObject);

      logInfo("[NetClkr] module:mounted", {
        instanceId: payload.instanceId,
        rulesCount: rules.length,
        interceptLinks: payload.interceptLinks !== false
      });

      document.addEventListener(
        "click",
        function (event) {
          var link = event.target instanceof Element ? event.target.closest("a[href]") : null;
          var rule;

          if (!link) {
            return;
          }

          rule = findRuleForLink(link, rules);
          if (!rule) {
            return;
          }

          handleRuleAction(link, rule, payload, event);
        },
        true
      );
    }
  };
})();

window.NetClkrModule.mount(payload);
