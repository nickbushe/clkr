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

  function matchRule(link, rule) {
    var linkMatch;
    if (Array.isArray(rule.links) && rule.links.length) {
      linkMatch = matchRuleLinks(link, rule);
      if (!linkMatch.matched) {
        return linkMatch;
      }

      return {
        matched: true,
        matchedLink: linkMatch.matchedLink
      };
    }

    var href = link.href || "";
    var text = (link.textContent || "").trim();
    var action = typeof rule.action === "string" ? rule.action : "redirect";
    var selector = typeof rule.selector === "string" ? rule.selector : "";
    var urlPattern = typeof rule.urlPattern === "string" ? rule.urlPattern : "";
    var textPattern = typeof rule.textPattern === "string" ? rule.textPattern : "";
    var sourceUrlMatched = false;

    if (selector && !link.matches(selector)) {
      return { matched: false, reason: "selector_mismatch" };
    }

    if (action === "redirect" || action === "replace") {
      if (urlPattern) {
        sourceUrlMatched = matchesPattern(href, urlPattern);

        if (!sourceUrlMatched) {
          return {
            matched: false,
            reason: "source_url_mismatch",
            details: {
              href: href,
              urlPattern: urlPattern
            }
          };
        }
      }
    } else if (urlPattern && !matchesPattern(href, urlPattern)) {
      return {
        matched: false,
        reason: "url_pattern_mismatch",
        details: {
          href: href,
          urlPattern: urlPattern
        }
      };
    }

    if (textPattern && !matchesPattern(text, textPattern)) {
      return {
        matched: false,
        reason: "text_pattern_mismatch",
        details: {
          text: text,
          textPattern: textPattern
        }
      };
    }

    return { matched: true };
  }

  function matchRuleLinks(link, rule) {
    var i;
    var entry;
    var entryRule;
    var result;

    for (i = 0; i < rule.links.length; i += 1) {
      entry = rule.links[i];
      if (!isObject(entry)) {
        continue;
      }

      entryRule = {
        action: rule.action,
        selector: entry.type === "selector" ? entry.value : "",
        urlPattern: entry.type === "urlPattern" ? entry.value : "",
        textPattern: entry.type === "textPattern" ? entry.value : ""
      };
      result = matchRule(link, entryRule);

      if (result.matched) {
        return {
          matched: true,
          matchedLink: entry
        };
      }
    }

    return { matched: false, reason: "links_mismatch" };
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
    return matchRule(link, rule).matched;
  }

  function findRuleForLink(link, rules) {
    var i;
    var matchResult;

    for (i = 0; i < rules.length; i += 1) {
      matchResult = matchRule(link, rules[i]);

      if (matchResult.matched) {
        if (matchResult.matchedLink) {
          rules[i].__matchedLink = matchResult.matchedLink;
        } else {
          delete rules[i].__matchedLink;
        }

        return rules[i];
      }

      logInfo("[NetClkr] rule:missed", {
        ruleId: rules[i].id || "",
        action: rules[i].action || "",
        href: link.href || "",
        reason: matchResult.reason || "unknown",
        details: matchResult.details || null
      });
    }

    return null;
  }

  function resolveTargetUrl(rule, link) {
    if (isObject(rule.__matchedLink) && typeof rule.__matchedLink.redirectTo === "string" && rule.__matchedLink.redirectTo) {
      return rule.__matchedLink.redirectTo;
    }

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
