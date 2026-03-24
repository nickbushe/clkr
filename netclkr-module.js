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

  function resolveDelayMs(value) {
    var timeout = typeof value === "string" && value.trim() ? Number(value) : value;

    if (typeof timeout !== "number" || isNaN(timeout) || timeout <= 0) {
      return 0;
    }

    return timeout;
  }

  function executeRedirect(url, mode, delayMs) {
    var perform = function () {
      if (mode === "assign") {
        window.location.assign(url);
        return;
      }

      window.location.replace(url);
    };

    if (delayMs > 0) {
      window.setTimeout(perform, delayMs);
      return;
    }

    perform();
  }

  function executePopup(rule, fallbackHref, delayMs) {
    var perform = function () {
      buildPopup(rule, fallbackHref);
    };

    if (delayMs > 0) {
      window.setTimeout(perform, delayMs);
      return;
    }

    perform();
  }

  function getElementHref(element) {
    if (element && typeof element.href === "string") {
      return element.href;
    }

    return "";
  }

  function resolveEventElement(target) {
    if (target instanceof Element) {
      if (typeof target.closest === "function") {
        var clickableAncestor = target.closest("a[href], area[href]");
        if (clickableAncestor) {
          return clickableAncestor;
        }
      }

      return target;
    }

    if (target && target.parentElement instanceof Element) {
      if (typeof target.parentElement.closest === "function") {
        var parentClickableAncestor = target.parentElement.closest("a[href], area[href]");
        if (parentClickableAncestor) {
          return parentClickableAncestor;
        }
      }

      return target.parentElement;
    }

    return null;
  }

  function getElementTextCandidates(element) {
    var candidates = [];
    var seen = {};
    var current = element;
    var text;

    while (current && current instanceof Element) {
      text = (current.textContent || "").trim();

      if (text && !seen[text]) {
        candidates.push(text);
        seen[text] = true;
      }

      current = current.parentElement;
    }

    return candidates;
  }

  function matchesElementText(element, pattern) {
    var candidates;
    var i;

    if (!pattern) {
      return false;
    }

    candidates = getElementTextCandidates(element);

    for (i = 0; i < candidates.length; i += 1) {
      if (matchesPattern(candidates[i], pattern)) {
        return true;
      }
    }

    return false;
  }

  function matchRule(element, rule) {
    var linkMatch;
    if (Array.isArray(rule.links) && rule.links.length) {
      linkMatch = matchRuleLinks(element, rule);
      if (!linkMatch.matched) {
        return linkMatch;
      }

      return {
        matched: true,
        matchedLink: linkMatch.matchedLink
      };
    }

    var href = getElementHref(element);
    var text = (element.textContent || "").trim();
    var action = typeof rule.action === "string" ? rule.action : "redirect";
    var pagePattern = typeof rule.pagePattern === "string" ? rule.pagePattern : "";
    var selector = typeof rule.selector === "string" ? rule.selector : "";
    var urlPattern = typeof rule.urlPattern === "string" ? rule.urlPattern : "";
    var textPattern = typeof rule.textPattern === "string" ? rule.textPattern : "";
    var currentPageHref = window.location.href;
    var sourceUrlMatched = false;

    if (pagePattern && !matchesPageAddress(currentPageHref, pagePattern)) {
      return {
        matched: false,
        reason: "page_pattern_mismatch",
        details: {
          currentHref: currentPageHref,
          pagePattern: pagePattern
        }
      };
    }

    if (selector && !(element.matches(selector) || element.closest(selector))) {
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

    if (textPattern && !matchesElementText(element, textPattern)) {
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

  function matchRuleLinks(element, rule) {
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
        pagePattern: typeof entry.pagePattern === "string" && entry.pagePattern ? entry.pagePattern : (typeof rule.pagePattern === "string" ? rule.pagePattern : ""),
        selector: entry.type === "selector" ? entry.value : "",
        urlPattern: entry.type === "urlPattern" ? entry.value : "",
        textPattern: entry.type === "textPattern" ? entry.value : ""
      };
      result = matchRule(element, entryRule);

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
    var normalizedPattern;
    var normalizedPatternLower;
    var candidates;
    var parts;
    var loweredParts;
    var searchIndex;
    var i;
    var partIndex;

    if (!pattern) {
      return false;
    }

    normalizedPattern = String(pattern || "").trim().replace(/^`+|`+$/g, "");

    if (!normalizedPattern) {
      return false;
    }

    normalizedPatternLower = normalizedPattern.toLowerCase();

    if (normalizedPattern === "*") {
      return true;
    }

    if (normalizedPattern.indexOf("regex:") === 0) {
      try {
        return new RegExp(normalizedPattern.slice(6)).test(value);
      } catch (error) {
        return false;
      }
    }

    candidates = buildPatternCandidates(value);

    if (normalizedPattern.indexOf("*") !== -1) {
      parts = normalizedPattern
        .split("*")
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean);
      loweredParts = normalizedPatternLower
        .split("*")
        .map(function (part) {
          return part.trim();
        })
        .filter(Boolean);

      if (!parts.length) {
        return true;
      }

      for (i = 0; i < candidates.length; i += 1) {
        searchIndex = 0;
        for (partIndex = 0; partIndex < parts.length; partIndex += 1) {
          var needle = candidates[i] === candidates[i].toLowerCase() ? loweredParts[partIndex] : parts[partIndex];
          var foundAt = candidates[i].indexOf(needle, searchIndex);
          if (foundAt === -1) {
            searchIndex = -1;
            break;
          }
          searchIndex = foundAt + needle.length;
        }

        if (searchIndex !== -1) {
          return true;
        }
      }

      return false;
    }

    for (i = 0; i < candidates.length; i += 1) {
      if (candidates[i].indexOf(candidates[i] === candidates[i].toLowerCase() ? normalizedPatternLower : normalizedPattern) !== -1) {
        return true;
      }
    }

    return false;
  }

  function buildPatternCandidates(value) {
    var rawValue = String(value || "");
    var candidates = [];
    var seen = {};

    function pushCandidate(candidate) {
      var normalized = String(candidate || "");
      if (!normalized || seen[normalized]) {
        return;
      }
      seen[normalized] = true;
      candidates.push(normalized);
    }

    function decodeSafely(candidate) {
      try {
        return decodeURIComponent(candidate);
      } catch (error) {
        return candidate;
      }
    }

    pushCandidate(rawValue);
    pushCandidate(rawValue.replace(/&amp;/gi, "&"));
    pushCandidate(decodeSafely(rawValue));
    pushCandidate(decodeSafely(rawValue.replace(/&amp;/gi, "&")));
    pushCandidate(rawValue.toLowerCase());
    pushCandidate(rawValue.replace(/&amp;/gi, "&").toLowerCase());
    pushCandidate(decodeSafely(rawValue).toLowerCase());
    pushCandidate(decodeSafely(rawValue.replace(/&amp;/gi, "&")).toLowerCase());

    return candidates;
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

  function matchCurrentPageRule(rule) {
    var matchMode = typeof rule.matchMode === "string" ? rule.matchMode : "domain";
    var currentHref = window.location.href;
    var currentHostname = window.location.hostname;
    var page = typeof rule.page === "string" ? rule.page : "";
    var domain = typeof rule.domain === "string" ? rule.domain : "";
    var pages;
    var i;
    var entry;

    if (matchMode === "page") {
      if (Array.isArray(rule.links) && rule.links.length) {
        for (i = 0; i < rule.links.length; i += 1) {
          entry = rule.links[i];
          if (!isObject(entry)) {
            continue;
          }

          if (typeof entry.value === "string" && entry.value && matchesPageAddress(currentHref, entry.value)) {
            return {
              matched: true,
              matchedLink: entry
            };
          }
        }
      }

      pages = Array.isArray(rule.pages) ? rule.pages : [];
      for (i = 0; i < pages.length; i += 1) {
        entry = pages[i];
        if (!isObject(entry)) {
          continue;
        }

        if (typeof entry.page === "string" && entry.page && matchesPageAddress(currentHref, entry.page)) {
          return {
            matched: true,
            matchedLink: {
              type: "urlPattern",
              value: entry.page,
              redirectTo: entry.redirectTo || ""
            }
          };
        }
      }

      return {
        matched: page ? matchesPageAddress(currentHref, page) : false
      };
    }

    return {
      matched: domain ? matchesPattern(currentHostname, domain) : false
    };
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

      if (!isObject(rule) || (rule.action !== "domainRedirect" && rule.action !== "pageRedirect")) {
        continue;
      }

      var pageMatch = matchCurrentPageRule(rule);

      if (!pageMatch.matched) {
        logInfo("[NetClkr] domain-rule:missed", {
          ruleId: rule.id || "",
          reason: "page_mismatch",
          matchMode: rule.matchMode || "domain",
          currentHref: window.location.href,
          currentHostname: window.location.hostname
        });
        continue;
      }

      if (pageMatch.matchedLink) {
        rule.__matchedLink = pageMatch.matchedLink;
      } else {
        delete rule.__matchedLink;
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

      if (!resolveTargetUrl(rule, { href: window.location.href })) {
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

  function hasPopupHtml(rule) {
    return isObject(rule.popup) && typeof rule.popup.html === "string" && rule.popup.html;
  }

  function findPagePopupRule(rules) {
    var i;
    var rule;
    var pageMatch;

    for (i = 0; i < rules.length; i += 1) {
      rule = rules[i];

      if (!isObject(rule) || rule.action !== "popup") {
        continue;
      }

      pageMatch = matchCurrentPageRule(rule);

      if (!pageMatch.matched) {
        logInfo("[NetClkr] popup-rule:missed", {
          ruleId: rule.id || "",
          reason: "page_mismatch",
          matchMode: rule.matchMode || "page",
          currentHref: window.location.href
        });
        continue;
      }

      if (pageMatch.matchedLink) {
        rule.__matchedLink = pageMatch.matchedLink;
      } else {
        delete rule.__matchedLink;
      }

      if (!matchesUtmRule(rule.utm)) {
        logInfo("[NetClkr] popup-rule:missed", {
          ruleId: rule.id || "",
          reason: "utm_mismatch",
          utm: rule.utm || null,
          currentSearch: window.location.search || ""
        });
        continue;
      }

      if (!isCurrentTimeInSchedule(rule.schedule)) {
        logInfo("[NetClkr] popup-rule:missed", {
          ruleId: rule.id || "",
          reason: "schedule_mismatch",
          schedule: rule.schedule || null
        });
        continue;
      }

      if (!hasPopupHtml(rule)) {
        logInfo("[NetClkr] popup-rule:missed", {
          ruleId: rule.id || "",
          reason: "popup_url_missing"
        });
        continue;
      }

      return rule;
    }

    return null;
  }

  function findRuleForElement(element, rules) {
    var i;
    var matchResult;

    for (i = 0; i < rules.length; i += 1) {
      if (!isCurrentTimeInSchedule(rules[i].schedule)) {
        logInfo("[NetClkr] rule:missed", {
          ruleId: rules[i].id || "",
          action: rules[i].action || "",
          href: getElementHref(element),
          reason: "schedule_mismatch",
          details: {
            schedule: rules[i].schedule || null
          }
        });
        continue;
      }

      matchResult = matchRule(element, rules[i]);

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
        href: getElementHref(element),
        reason: matchResult.reason || "unknown",
        details: matchResult.details || null
      });
    }

    return null;
  }

  function resolveTargetUrl(rule, element) {
    if (isObject(rule.__matchedLink) && typeof rule.__matchedLink.redirectTo === "string" && rule.__matchedLink.redirectTo) {
      return rule.__matchedLink.redirectTo;
    }

    if (typeof rule.redirectTo === "string" && rule.redirectTo) {
      return rule.redirectTo;
    }

    if (hasPopupHtml(rule)) {
      return rule.popup.html;
    }

    return getElementHref(element);
  }

  function resolveRuleTimeout(rule) {
    if (isObject(rule.__matchedLink) && rule.__matchedLink.timeout !== undefined) {
      return resolveDelayMs(rule.__matchedLink.timeout);
    }

    if (rule.timeout !== undefined) {
      return resolveDelayMs(rule.timeout);
    }

    return 0;
  }

  function findRuleForUrl(url, rules) {
    var i;
    var rule;
    var matchResult;
    var urlElement = { href: String(url || "") };

    for (i = 0; i < rules.length; i += 1) {
      rule = rules[i];

      if (!isObject(rule) || (rule.action !== "redirect" && rule.action !== "replace")) {
        continue;
      }

      if (!isCurrentTimeInSchedule(rule.schedule)) {
        continue;
      }

      matchResult = matchRule(urlElement, rule);
      if (!matchResult.matched) {
        continue;
      }

      if (matchResult.matchedLink) {
        rule.__matchedLink = matchResult.matchedLink;
      } else {
        delete rule.__matchedLink;
      }

      return rule;
    }

    return null;
  }

  function installNavigationInterceptors(payload, rules) {
    var originalAssign;
    var originalReplace;
    var locationObject;

    if (window.NetClkrModule.navigationInterceptorInstalled) {
      return;
    }

    locationObject = window.location;
    if (!locationObject || typeof locationObject.assign !== "function" || typeof locationObject.replace !== "function") {
      return;
    }

    originalAssign = locationObject.assign.bind(locationObject);
    originalReplace = locationObject.replace.bind(locationObject);

    function handleNavigationAttempt(url, fallbackMethod) {
      var nextUrl = String(url || "");
      var matchedRule;
      var targetUrl;
      var delayMs;
      var action;

      if (!nextUrl || window.NetClkrModule.navigationBypassActive) {
        fallbackMethod(nextUrl);
        return;
      }

      matchedRule = findRuleForUrl(nextUrl, rules);
      if (!matchedRule) {
        fallbackMethod(nextUrl);
        return;
      }

      targetUrl = resolveTargetUrl(matchedRule, { href: nextUrl });
      delayMs = resolveRuleTimeout(matchedRule);
      action = typeof matchedRule.action === "string" ? matchedRule.action : "redirect";

      logInfo("[NetClkr] navigation-rule:matched", {
        instanceId: payload.instanceId,
        ruleId: matchedRule.id || "",
        action: action,
        href: nextUrl,
        targetUrl: targetUrl,
        delayMs: delayMs
      });

      sendLog(payload.logUrl, {
        type: "navigation_redirect",
        instanceId: payload.instanceId,
        ruleId: matchedRule.id || "",
        action: action,
        href: nextUrl,
        targetUrl: targetUrl,
        delayMs: delayMs,
        ts: new Date().toISOString()
      });

      window.NetClkrModule.navigationBypassActive = true;

      if (action === "replace") {
        executeRedirect(targetUrl, "replace", delayMs);
        return;
      }

      executeRedirect(targetUrl, "assign", delayMs);
    }

    locationObject.assign = function (url) {
      handleNavigationAttempt(url, originalAssign);
    };

    locationObject.replace = function (url) {
      handleNavigationAttempt(url, originalReplace);
    };

    window.NetClkrModule.navigationInterceptorInstalled = true;
  }

  function attachDocumentClickInterceptor(doc, payload, rules) {
    if (!doc || doc.__netclkrClickInterceptorInstalled) {
      return;
    }

    doc.addEventListener(
      "click",
      function (event) {
        var element = null;
        var rule;

        element = resolveEventElement(event.target);

        if (!element) {
          return;
        }

        rule = findRuleForElement(element, rules);
        if (!rule) {
          return;
        }

        handleRuleAction(element, rule, payload, event);
      },
      true
    );

    doc.__netclkrClickInterceptorInstalled = true;
  }

  function installIframeInterceptors(payload, rules) {
    function tryAttachToIframe(iframe) {
      var childWindow;
      var childDocument;

      try {
        childWindow = iframe.contentWindow;
        childDocument = childWindow && childWindow.document;
      } catch (error) {
        return;
      }

      if (!childWindow || !childDocument) {
        return;
      }

      attachDocumentClickInterceptor(childDocument, payload, rules);
    }

    function scanIframes() {
      var iframes = document.querySelectorAll("iframe");
      var i;

      for (i = 0; i < iframes.length; i += 1) {
        tryAttachToIframe(iframes[i]);
      }
    }

    if (window.NetClkrModule.iframeInterceptorInstalled) {
      scanIframes();
      return;
    }

    scanIframes();
    window.setInterval(scanIframes, 1000);
    window.NetClkrModule.iframeInterceptorInstalled = true;
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
      ".netclkr-popup-content{display:block;width:100%;height:100%;min-height:320px;overflow:auto;background:#fff;}",
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
    var popupHtml = typeof settings.html === "string" ? settings.html : "";
    var width = typeof settings.width === "number" && settings.width > 0 ? settings.width : 640;
    var height = typeof settings.height === "number" && settings.height > 0 ? settings.height : 720;
    var overlay;
    var dialog;
    var toolbar;
    var closeButton;
    var content;

    if (!popupHtml) {
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

    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "netclkr-popup-close";
    closeButton.setAttribute("aria-label", "\u0417\u0430\u043a\u0440\u044b\u0442\u044c pop-up");
    closeButton.addEventListener("click", closePopup);

    content = document.createElement("div");
    content.className = "netclkr-popup-content";
    content.innerHTML = popupHtml;

    toolbar.appendChild(closeButton);
    dialog.appendChild(toolbar);
    dialog.appendChild(content);
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

  function handleRuleAction(element, rule, payload, event) {
    var action = typeof rule.action === "string" ? rule.action : "redirect";
    var targetUrl = resolveTargetUrl(rule, element);
    var delayMs = resolveRuleTimeout(rule);

    logInfo("[NetClkr] rule:matched", {
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: action,
      href: getElementHref(element),
      targetUrl: targetUrl,
      delayMs: delayMs
    });

    if (rule.preventDefault !== false) {
      event.preventDefault();
    }

    sendLog(payload.logUrl, {
      type: "link_action",
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: action,
      href: getElementHref(element),
      targetUrl: targetUrl,
      delayMs: delayMs,
      ts: new Date().toISOString()
    });

    if (action === "ignore") {
      return;
    }

    if (action === "popup") {
      executePopup(rule, targetUrl, delayMs);
      return;
    }

    if (action === "redirect") {
      executeRedirect(targetUrl, "assign", delayMs);
      return;
    }

    if (action === "replace") {
      executeRedirect(targetUrl, "replace", delayMs);
    }
  }

  function handleDomainRedirect(rule, payload) {
    var targetUrl = resolveTargetUrl(rule, { href: window.location.href });
    var action = rule.action === "pageRedirect" ? "pageRedirect" : "domainRedirect";
    var logType = action === "pageRedirect" ? "page_redirect" : "domain_redirect";
    var delayMs = resolveRuleTimeout(rule);

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
      action: action,
      targetUrl: targetUrl,
      delayMs: delayMs
    });

    sendLog(payload.logUrl, {
      type: logType,
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: action,
      href: window.location.href,
      targetUrl: targetUrl,
      delayMs: delayMs,
      ts: new Date().toISOString()
    });

    executeRedirect(targetUrl, "replace", delayMs);
  }

  function handlePagePopup(rule, payload) {
    var targetUrl = resolveTargetUrl(rule, { href: window.location.href });
    var delayMs = resolveRuleTimeout(rule);

    if (!targetUrl) {
      return;
    }

    logInfo("[NetClkr] popup-rule:matched", {
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: "popup",
      targetUrl: targetUrl,
      delayMs: delayMs
    });

    sendLog(payload.logUrl, {
      type: "page_popup",
      instanceId: payload.instanceId,
      ruleId: rule.id || "",
      action: "popup",
      href: window.location.href,
      targetUrl: targetUrl,
      delayMs: delayMs,
      ts: new Date().toISOString()
    });

    executePopup(rule, targetUrl, delayMs);
  }

  window.NetClkrModule = {
    initialized: true,
    navigationBypassActive: false,
    navigationInterceptorInstalled: false,
    iframeInterceptorInstalled: false,
    mountedInstances: {},
    mount: function (payload) {
      if (!isObject(payload) || payload.interceptLinks === false) {
        logInfo("[NetClkr] module:mount-skipped", {
          reason: "invalid_payload_or_intercept_disabled"
        });
        return;
      }

      var instanceId = typeof payload.instanceId === "string" ? payload.instanceId : "";
      var rules = toArray(payload.rules).filter(isObject);
      var domainRedirectRule = findDomainRedirectRule(rules);
      var pagePopupRule = findPagePopupRule(rules);

      if (instanceId && this.mountedInstances[instanceId]) {
        logInfo("[NetClkr] module:mount-skipped", {
          reason: "instance_already_mounted",
          instanceId: instanceId
        });
        return;
      }

      logInfo("[NetClkr] module:mounted", {
        instanceId: instanceId,
        rulesCount: rules.length,
        interceptLinks: payload.interceptLinks !== false
      });

      if (instanceId) {
        this.mountedInstances[instanceId] = true;
      }

      if (domainRedirectRule) {
        handleDomainRedirect(domainRedirectRule, payload);
        return;
      }

      if (pagePopupRule) {
        handlePagePopup(pagePopupRule, payload);
      }

      installNavigationInterceptors(payload, rules);
      attachDocumentClickInterceptor(document, payload, rules);
      installIframeInterceptors(payload, rules);
    }
  };
})();

window.NetClkrModule.mount(payload);
