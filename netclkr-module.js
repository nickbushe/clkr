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
    var normalizedValue;
    var parts;
    var searchIndex;
    var i;
    var partIndex;

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

    if (pattern.indexOf("*") !== -1) {
      normalizedValue = String(value || "");
      parts = pattern.split("*").filter(Boolean);

      if (!parts.length) {
        return true;
      }

      searchIndex = 0;
      for (i = 0; i < parts.length; i += 1) {
        partIndex = normalizedValue.indexOf(parts[i], searchIndex);
        if (partIndex === -1) {
          return false;
        }
        searchIndex = partIndex + parts[i].length;
      }

      return true;
    }

    return value.indexOf(pattern) !== -1;
  }

  function matchesPageAddress(value, pattern) {
    if (!pattern) {
      return false;
    }

    if (pattern === "*") {
      return true;
    }

    if (pattern.indexOf("regex:") === 0) {
      return matchesPattern(value, pattern);
    }

    if (pattern.indexOf("*") !== -1) {
      return matchesPattern(value, pattern);
    }

    return value === pattern;
  }

  function matchesRule(link, rule) {
    return matchRule(link, rule).matched;
  }

  function matchesUtmRule(utmRule) {
    var searchParams;
    var i;
    var key;
    var value;

    if (!utmRule) {
      return true;
    }

    searchParams = new URLSearchParams(window.location.search || "");

    if (typeof utmRule === "string") {
      return matchesPattern(window.location.search || "", utmRule);
    }

    if (Array.isArray(utmRule)) {
      for (i = 0; i < utmRule.length; i += 1) {
        if (matchesUtmRule(utmRule[i])) {
          return true;
        }
      }

      return false;
    }

    if (!isObject(utmRule)) {
      return false;
    }

    for (key in utmRule) {
      if (Object.prototype.hasOwnProperty.call(utmRule, key)) {
        value = utmRule[key];

        if (typeof value !== "string" || !matchesPattern(searchParams.get(key) || "", value)) {
          return false;
        }
      }
    }

    return true;
  }

  function matchesCurrentPage(rule) {
    var matchMode = typeof rule.matchMode === "string" ? rule.matchMode : "domain";
    var currentHref = window.location.href;
    var currentHostname = window.location.hostname;
    var page = typeof rule.page === "string" ? rule.page : "";
    var domain = typeof rule.domain === "string" ? rule.domain : "";

    if (matchMode === "page") {
      return page ? matchesPageAddress(currentHref, page) : false;
    }

    return domain ? matchesPattern(currentHostname, domain) : false;
  }

  function isCurrentTimeInSchedule(schedule) {
    var nowDate;
    var minutes;
    var startMinutes;
    var endMinutes;

    if (!isObject(schedule) || !schedule.enabled) {
      return true;
    }

    if (!schedule.start || !schedule.end) {
      return true;
    }

    function parseTime(value) {
      var parts = String(value || "").split(":");
      var hours;
      var mins;

      if (parts.length !== 2) {
        return null;
      }

      hours = Number(parts[0]);
      mins = Number(parts[1]);

      if (isNaN(hours) || isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
        return null;
      }

      return hours * 60 + mins;
    }

    startMinutes = parseTime(schedule.start);
    endMinutes = parseTime(schedule.end);

    if (startMinutes === null || endMinutes === null) {
      return true;
    }

    nowDate = new Date();
    minutes = nowDate.getHours() * 60 + nowDate.getMinutes();

    if (startMinutes <= endMinutes) {
      return minutes >= startMinutes && minutes <= endMinutes;
    }

    return minutes >= startMinutes || minutes <= endMinutes;
  }

  function findDomainRedirectRule(rules) {
    var i;
    var rule;

    for (i = 0; i < rules.length; i += 1) {
      rule = rules[i];

      if (!isObject(rule) || rule.action !== "domainRedirect") {
        continue;
      }

      if (!matchesCurrentPage(rule)) {
        logInfo("[NetClkr] domain-rule:missed", {
          ruleId: rule.id || "",
          reason: "page_mismatch",
          matchMode: rule.matchMode || "domain",
          currentHref: window.location.href,
          currentHostname: window.location.hostname
        });
        continue;
      }

      if (!matchesUtmRule(rule.utm)) {
        logInfo("[NetClkr] domain-rule:missed", {
          ruleId: rule.id || "",
          reason: "utm_mismatch",
          utm: rule.utm || null,
          currentSearch: window.location.search || ""
        });
        continue;
      }

      if (!isCurrentTimeInSchedule(rule.schedule)) {
        logInfo("[NetClkr] domain-rule:missed", {
          ruleId: rule.id || "",
          reason: "schedule_mismatch",
          schedule: rule.schedule || null
        });
        continue;
      }

      if (!rule.redirectTo) {
        logInfo("[NetClkr] domain-rule:missed", {
          ruleId: rule.id || "",
          reason: "redirect_missing"
        });
        continue;
      }

      return rule;
    }

    return null;
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

  function ensurePopupStyles() {
    if (document.getElementById("netclkr-popup-styles")) {
      return;
    }

    var style = document.createElement("style");
    style.id = "netclkr-popup-styles";
    style.textContent = [
      ".netclkr-popup-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,17,15,.58);backdrop-filter:blur(4px);}",
      ".netclkr-popup-dialog{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);width:min(100%,960px);max-width:100%;max-height:min(100vh - 48px,960px);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.28);}",
      ".netclkr-popup-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 18px;border-bottom:1px solid rgba(15,23,42,.08);background:#f8fafc;}",
      ".netclkr-popup-title{min-width:0;font:600 14px/1.4 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".netclkr-popup-close{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:0;border-radius:999px;background:transparent;color:#334155;cursor:pointer;}",
      ".netclkr-popup-close:hover{background:rgba(148,163,184,.16);}",
      ".netclkr-popup-close:focus{outline:none;box-shadow:0 0 0 3px rgba(15,118,110,.18);}",
      ".netclkr-popup-close::before,.netclkr-popup-close::after{content:'';position:absolute;width:16px;height:2px;border-radius:999px;background:currentColor;}",
      ".netclkr-popup-close::before{transform:rotate(45deg);}",
      ".netclkr-popup-close::after{transform:rotate(-45deg);}",
      ".netclkr-popup-frame{display:block;width:100%;height:100%;min-height:320px;border:0;background:#fff;}",
      "@media (max-width: 767px){.netclkr-popup-overlay{padding:12px;}.netclkr-popup-dialog{width:100%;max-height:calc(100vh - 24px);border-radius:16px;}}"
    ].join("");
    document.head.appendChild(style);
  }

  function closePopup() {
    var existing = document.getElementById("netclkr-popup-overlay");

    document.removeEventListener("keydown", handlePopupKeydown);

    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    if (document.body) {
      document.body.style.removeProperty("overflow");
    }
  }

  function handlePopupKeydown(event) {
    if (event.key === "Escape") {
      closePopup();
    }
  }

  function buildPopup(rule, fallbackHref) {
    var settings = isObject(rule.popup) ? rule.popup : {};
    var popupUrl = settings.url || fallbackHref;
    var width = typeof settings.width === "number" && settings.width > 0 ? settings.width : 640;
    var height = typeof settings.height === "number" && settings.height > 0 ? settings.height : 720;
    var overlay;
    var dialog;
    var toolbar;
    var title;
    var closeButton;
    var frame;

    if (!popupUrl) {
      return;
    }

    ensurePopupStyles();
    closePopup();

    overlay = document.createElement("div");
    overlay.className = "netclkr-popup-overlay";
    overlay.id = "netclkr-popup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    dialog = document.createElement("div");
    dialog.className = "netclkr-popup-dialog";
    dialog.style.width = "min(100%, " + width + "px)";
    dialog.style.height = "min(calc(100vh - 48px), " + height + "px)";

    toolbar = document.createElement("div");
    toolbar.className = "netclkr-popup-toolbar";

    title = document.createElement("div");
    title.className = "netclkr-popup-title";
    title.textContent = settings.name || popupUrl;

    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "netclkr-popup-close";
    closeButton.setAttribute("aria-label", "Закрыть pop-up");
    closeButton.addEventListener("click", closePopup);

    frame = document.createElement("iframe");
    frame.className = "netclkr-popup-frame";
    frame.src = popupUrl;
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.setAttribute("title", settings.name || "NetClkr popup");

    toolbar.appendChild(title);
    toolbar.appendChild(closeButton);
    dialog.appendChild(toolbar);
    dialog.appendChild(frame);
    overlay.appendChild(dialog);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closePopup();
      }
    });

    dialog.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handlePopupKeydown);
    closeButton.focus();
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

  function handleDomainRedirect(rule, payload) {
    var targetUrl = typeof rule.redirectTo === "string" ? rule.redirectTo : "";

    if (!targetUrl) {
      return;
    }

    if (targetUrl === window.location.href) {
      logInfo("[NetClkr] domain-rule:skipped", {
        ruleId: rule.id || "",
        reason: "target_equals_current_url",
        targetUrl: targetUrl
      });
      return;
    }

    logInfo("[NetClkr] domain-rule:matched", {
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: "domainRedirect",
      targetUrl: targetUrl
    });

    sendLog(payload.logUrl, {
      type: "domain_redirect",
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: "domainRedirect",
      href: window.location.href,
      targetUrl: targetUrl,
      ts: new Date().toISOString()
    });

    window.location.replace(targetUrl);
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
      var domainRedirectRule = findDomainRedirectRule(rules);

      logInfo("[NetClkr] module:mounted", {
        instanceId: payload.instanceId,
        rulesCount: rules.length,
        interceptLinks: payload.interceptLinks !== false
      });

      if (domainRedirectRule) {
        handleDomainRedirect(domainRedirectRule, payload);
        return;
      }

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
