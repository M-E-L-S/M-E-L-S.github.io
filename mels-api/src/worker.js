import { authorize, login } from './auth.js';

const CONFIG = {
  allowedOrigin: "https://m-e-l-s.github.io",
  upstreamOrigin: "https://api.aicu.cc",

  v3TimeoutMs: 8000,
  requestTimeoutMs: 10000,
  queueTimeoutMs: 50000,

  maxJsonBytes: 2 * 1024 * 1024,
  maxSseBytes: 256 * 1024,
  maxSseEventBytes: 16 * 1024,

  maxUrlLength: 2048,
  maxPage: 1000,
  maxPageSize: 100,
  maxKeywordLength: 80,

  // 修改响应结构或缓存规则后递增此版本。
  cacheVersion: "v3",

  cacheTtl: {
    replies: 600,
    videoDanmaku: 600,
    history: 21600,
    assets: 21600,
  },
};

const ROUTES = new Map([
  ["/api/aicu/replies", "replies"],
  ["/api/aicu/video-danmaku", "videoDanmaku"],
  ["/api/aicu/history", "history"],
  ["/api/aicu/assets", "assets"],
]);

const SEARCH_PATHS = {
  replies: "search/getreply",
  videoDanmaku: "search/getvideodm",
};

const USER_PATHS = {
  history: "user/getusermark",
  medals: "user/getmedal",
  collections: "user/getcollection",
};

class ApiError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "ApiError";
    this.reason = reason;
  }
}

function corsHeaders(request) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers":
      "X-Cache, X-Aicu-Source, Retry-After",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (
    request.headers.get("Origin") === CONFIG.allowedOrigin
  ) {
    headers["Access-Control-Allow-Origin"] =
      CONFIG.allowedOrigin;
  }

  return headers;
}

function clientResponse(
  request,
  body,
  status = 200,
  extraHeaders = {},
) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function jsonResponse(
  request,
  value,
  status = 200,
  extraHeaders = {},
) {
  return clientResponse(
    request,
    JSON.stringify(value),
    status,
    extraHeaders,
  );
}

function upstreamHeaders(
  cookies = "",
  accept = "application/json,text/plain,*/*",
) {
  const headers = {
    Accept: accept,
    Origin: "https://www.aicu.cc",
    Referer: "https://www.aicu.cc/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/153.0.0.0 Safari/537.36",
  };

  if (cookies) headers.Cookie = cookies;

  return headers;
}

function buildUrl(version, path, params = {}) {
  const url = new URL(
    `/api/${version}/${path}`,
    CONFIG.upstreamOrigin,
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

function failure(reason, extra = {}) {
  return { success: false, reason, ...extra };
}

function errorReason(error, signal) {
  if (error instanceof ApiError) return error.reason;

  if (
    signal?.aborted ||
    error?.name === "AbortError" ||
    error?.name === "TimeoutError"
  ) {
    return "timeout";
  }

  return "fetch_error";
}

function safeMessage(value) {
  return typeof value === "string"
    ? value.slice(0, 200)
    : undefined;
}

function publicFailure(result) {
  return {
    reason: result.reason,
    status: result.status,
    code: result.code,
    message: safeMessage(result.message),
  };
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

// 仅处理 Aicu 返回的 Cookie，不转发访问者的 Cookie。
function mergeCookies(existing, response) {
  const jar = new Map();

  for (const part of existing.split(/;\s*/)) {
    const index = part.indexOf("=");
    if (index > 0) {
      jar.set(part.slice(0, index), part.slice(index + 1));
    }
  }

  const values =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  for (const value of values) {
    const pair = value.split(";", 1)[0];
    const index = pair.indexOf("=");

    if (index > 0) {
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  const cookies = [...jar]
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  if (cookies.length > 8192) {
    throw new ApiError("upstream_cookies_too_large");
  }

  return cookies;
}

/*
 * 按实际收到的字节数限制响应。
 * Content-Length 只用于提前拒绝，不能替代流式计数。
 * 超限时中止 fetch，并取消 reader。
 */
async function readLimitedText(response, controller) {
  const declaredLength = Number(
    response.headers.get("content-length"),
  );

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > CONFIG.maxJsonBytes
  ) {
    controller.abort();
    throw new ApiError("response_too_large");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts = [];

  let totalBytes = 0;
  let finished = false;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        finished = true;
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > CONFIG.maxJsonBytes) {
        throw new ApiError("response_too_large");
      }

      parts.push(decoder.decode(value, { stream: true }));
    }

    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    if (!finished) {
      controller.abort();

      try {
        await reader.cancel();
      } catch {
        // 原始错误由调用方处理。
      }
    }

    reader.releaseLock();
  }
}

async function fetchAicuJson(
  url,
  {
    method = "GET",
    cookies = "",
    timeoutMs = CONFIG.requestTimeoutMs,
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  let status;

  try {
    const response = await fetch(url, {
      method,
      headers: upstreamHeaders(cookies),
      redirect: "manual",
      signal: controller.signal,
    });

    status = response.status;

    const contentType =
      response.headers.get("content-type") ?? "";

    if (
      response.headers.get("cf-mitigated") === "challenge" ||
      contentType.includes("text/html")
    ) {
      controller.abort();
      return failure("cloudflare_or_html_response", { status });
    }

    const text = await readLimitedText(response, controller);

    let body;

    try {
      body = JSON.parse(text);
    } catch {
      return failure("invalid_json", { status });
    }

    if (!response.ok) {
      return failure("http_error", { status });
    }

    if (!isObject(body)) {
      return failure("invalid_response_shape", { status });
    }

    if (body.code !== 0) {
      return failure("business_error", {
        status,
        code:
          typeof body.code === "number" ? body.code : undefined,
        message: safeMessage(body.message),
      });
    }

    return {
      success: true,
      status,
      body,
      cookies: mergeCookies(cookies, response),
    };
  } catch (error) {
    return failure(
      errorReason(error, controller.signal),
      { status },
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function integerParam(url, name, fallback, min, max) {
  const raw = url.searchParams.get(name);

  if (raw === null) return fallback;

  if (!/^\d{1,10}$/.test(raw)) {
    throw new Error(`Invalid ${name}`);
  }

  const value = Number(raw);

  if (
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`Invalid ${name}`);
  }

  return value;
}

function parseParams(url, type) {
  const search =
    type === "replies" || type === "videoDanmaku";

  const allowed = new Set(
    search
      ? ["uid", "pn", "ps", "keyword", "stime", "etime"]
      : ["uid"],
  );

  if (type === "replies") allowed.add("mode");

  for (const key of url.searchParams.keys()) {
    if (
      !allowed.has(key) ||
      url.searchParams.getAll(key).length !== 1
    ) {
      throw new Error("Unknown or duplicated parameter");
    }
  }

  const rawUid = url.searchParams.get("uid") ?? "";

  if (!/^\d{1,20}$/.test(rawUid)) {
    throw new Error("Invalid UID");
  }

  // 合并前导零，避免相同 UID 生成不同缓存键。
  const uid = BigInt(rawUid).toString();

  if (uid === "0") throw new Error("Invalid UID");

  const params = { uid };

  if (!search) return params;

  params.pn = String(
    integerParam(url, "pn", 1, 1, CONFIG.maxPage),
  );

  params.ps = String(
    integerParam(url, "ps", 100, 1, CONFIG.maxPageSize),
  );

  const keyword = url.searchParams.get("keyword") ?? "";

  if (
    keyword.length > CONFIG.maxKeywordLength ||
    /[\u0000-\u001f\u007f]/.test(keyword)
  ) {
    throw new Error("Invalid keyword");
  }

  params.keyword = keyword;
  params.need_count = "true";

  if (type === "replies") {
    params.mode = String(
      integerParam(url, "mode", 0, 0, 2),
    );
  }

  for (const name of ["stime", "etime"]) {
    if (url.searchParams.has(name)) {
      params[name] = String(
        integerParam(url, name, 0, 0, 9999999999),
      );
    }
  }

  if (
    params.stime !== undefined &&
    params.etime !== undefined &&
    Number(params.stime) > Number(params.etime)
  ) {
    throw new Error("Invalid time range");
  }

  return params;
}

// code=0 之外，再检查功能所需的数据结构。
function validateResult(result, type) {
  if (!result.success) return result;

  const data = result.body?.data;
  let valid = isObject(data);

  if (type === "replies") {
    valid =
      valid &&
      isObject(data.cursor) &&
      Array.isArray(data.replies);
  } else if (type === "videoDanmaku") {
    valid =
      valid &&
      isObject(data.cursor) &&
      Array.isArray(data.videodmlist);
  } else if (type === "medals" || type === "collections") {
    valid = valid && Array.isArray(data.list);
  } else if (type === "history") {
    valid =
      valid &&
      (data.hname === undefined || Array.isArray(data.hname));
  }

  return valid
    ? result
    : failure("invalid_response_shape", {
        status: result.status,
      });
}

async function cancelTicket(ticket, cookies) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(
      buildUrl("v4", "queue/cancel", { ticket }),
      {
        method: "POST",
        headers: upstreamHeaders(cookies),
        redirect: "manual",
        signal: controller.signal,
      },
    );

    if (response.body) {
      await response.body.cancel();
    }
  } catch {
    // 清理失败不覆盖主请求结果。
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/*
 * SSE 同时限制：
 * 1. 整条连接累计字节数；
 * 2. 尚未结束的单条事件字节数；
 * 3. 等待总时间。
 *
 * 超限、超时、ready、error 或 expired 后都会关闭连接。
 */
async function waitUntilReady(ticket, cookies) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    CONFIG.queueTimeoutMs,
  );

  let reader;

  try {
    const response = await fetch(
      buildUrl("v4", "queue/stream", { ticket }),
      {
        headers: upstreamHeaders(
          cookies,
          "text/event-stream",
        ),
        redirect: "manual",
        signal: controller.signal,
      },
    );

    if (
      response.headers.get("cf-mitigated") === "challenge"
    ) {
      return failure("cloudflare_challenge", {
        status: response.status,
      });
    }

    if (!response.ok || !response.body) {
      return failure("queue_stream_error", {
        status: response.status,
      });
    }

    const contentType =
      response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/event-stream")) {
      return failure("invalid_queue_content_type", {
        status: response.status,
      });
    }

    cookies = mergeCookies(cookies, response);
    reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";
    let totalBytes = 0;
    let eventBytes = 0;
    let lineBytes = 0;
    let lastPosition = null;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        return failure("queue_closed");
      }

      totalBytes += value.byteLength;

      if (totalBytes > CONFIG.maxSseBytes) {
        throw new ApiError("queue_stream_too_large");
      }

      // 按原始字节识别 LF/CRLF 空行，限制每条 SSE 事件。
      for (const byte of value) {
        eventBytes++;

        if (eventBytes > CONFIG.maxSseEventBytes) {
          throw new ApiError("queue_event_too_large");
        }

        if (byte === 10) {
          if (lineBytes === 0) eventBytes = 0;
          lineBytes = 0;
        } else if (byte !== 13) {
          lineBytes++;
        }
      }

      buffer += decoder.decode(value, { stream: true });

      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        let eventName = "message";
        const dataLines = [];

        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).replace(/^ /, ""));
          }
        }

        const eventData = dataLines.join("\n");

        if (eventName === "position") {
          try {
            const parsed = JSON.parse(eventData);
            const position = Number(parsed.position);

            if (Number.isFinite(position) && position >= 0) {
              lastPosition = position;
            }
          } catch {
            // 忽略无法解析的位置通知。
          }
        }

        if (eventName === "ready") {
          return {
            success: true,
            cookies,
            lastPosition,
          };
        }

        if (
          eventName === "expired" ||
          eventName === "error"
        ) {
          // 不向客户端转发原始事件，避免泄露 ticket。
          return failure(`queue_${eventName}`);
        }
      }
    }
  } catch (error) {
    const reason = errorReason(error, controller.signal);

    return failure(
      reason === "timeout" ? "queue_timeout" : reason,
    );
  } finally {
    clearTimeout(timer);
    controller.abort();

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        // fetch 中止后 cancel 可能抛错。
      }

      reader.releaseLock();
    }
  }
}

async function queryV4(type, params) {
  const queued = await fetchAicuJson(
    buildUrl("v4", "queue/enqueue"),
    { method: "POST" },
  );

  if (!queued.success) return queued;

  const ticket = queued.body?.data?.ticket;

  if (
    typeof ticket !== "string" ||
    ticket.length === 0 ||
    ticket.length > 4096
  ) {
    return failure("invalid_queue_ticket");
  }

  let cookies = queued.cookies ?? "";
  let succeeded = false;

  try {
    if (queued.body.data.status !== "ready") {
      const ready = await waitUntilReady(ticket, cookies);

      if (!ready.success) return ready;

      cookies = ready.cookies;
    }

    const result = validateResult(
      await fetchAicuJson(
        buildUrl("v4", SEARCH_PATHS[type], {
          ...params,
          ticket,
        }),
        { cookies },
      ),
      type,
    );

    succeeded = result.success;
    return result;
  } finally {
    if (!succeeded) {
      await cancelTicket(ticket, cookies);
    }
  }
}

async function queryVersioned(type, params) {
  const isSearch =
    type === "replies" || type === "videoDanmaku";

  const path = isSearch
    ? SEARCH_PATHS[type]
    : USER_PATHS[type];

  const v3 = validateResult(
    await fetchAicuJson(
      buildUrl("v3", path, params),
      { timeoutMs: CONFIG.v3TimeoutMs },
    ),
    type,
  );

  if (v3.success) {
    return {
      success: true,
      source: "v3",
      fallbackUsed: false,
      data: v3.body.data,
    };
  }

  const v4 = isSearch
    ? await queryV4(type, params)
    : validateResult(
        await fetchAicuJson(
          buildUrl("v4", path, params),
        ),
        type,
      );

  if (v4.success) {
    return {
      success: true,
      source: "v4",
      fallbackUsed: true,
      data: v4.body.data,
    };
  }

  return {
    success: false,
    v3: publicFailure(v3),
    v4: publicFailure(v4),
  };
}

async function queryAssets(params) {
  const [medals, collections] = await Promise.all([
    queryVersioned("medals", params),
    queryVersioned("collections", params),
  ]);

  return {
    success: medals.success || collections.success,
    partial: !medals.success || !collections.success,

    sources: {
      medals: medals.source ?? null,
      collections: collections.source ?? null,
    },

    data: {
      // null=失败；[]=成功但没有记录。
      medals: medals.success ? medals.data.list : null,
      collections: collections.success
        ? collections.data.list
        : null,
    },

    failures: {
      medals: medals.success
        ? null
        : { v3: medals.v3, v4: medals.v4 },
      collections: collections.success
        ? null
        : { v3: collections.v3, v4: collections.v4 },
    },
  };
}

function cacheRequestFor(request, type, params) {
  const url = new URL(request.url);

  url.pathname =
    `/__aicu_cache/${CONFIG.cacheVersion}/${type}`;
  url.search = "";
  url.hash = "";

  for (const key of Object.keys(params).sort()) {
    url.searchParams.set(key, String(params[key]));
  }

  return new Request(url.toString(), { method: "GET" });
}

// 只限制需要访问上游的缓存 MISS。
// 所有功能共用 IP 额度、节点总额度。
async function checkRateLimits(request, env) {
  if (
    typeof env.AICU_RATE_LIMITER?.limit !== "function" ||
    typeof env.AICU_GLOBAL_LIMITER?.limit !== "function"
  ) {
    return {
      allowed: false,
      status: 503,
      reason: "rate_limit_not_configured",
    };
  }

  const ip = request.headers.get("CF-Connecting-IP");

  if (!ip) {
    return {
      allowed: false,
      status: 503,
      reason: "client_address_unavailable",
    };
  }

  try {
    const client = await env.AICU_RATE_LIMITER.limit({
      key: `aicu:miss:ip:${ip}`,
    });

    if (!client.success) {
      return {
        allowed: false,
        status: 429,
        reason: "client_rate_limited",
      };
    }

    const shared = await env.AICU_GLOBAL_LIMITER.limit({
      key: "aicu:miss:all",
    });

    if (!shared.success) {
      return {
        allowed: false,
        status: 429,
        reason: "upstream_budget_limited",
      };
    }

    return { allowed: true };
  } catch {
    return {
      allowed: false,
      status: 503,
      reason: "rate_limit_unavailable",
    };
  }
}

async function handleApi(request, env, ctx, type) {
  const url = new URL(request.url);
  let params;

  try {
    params = parseParams(url, type);
  } catch (error) {
    return jsonResponse(
      request,
      {
        ok: false,
        error: safeMessage(error.message) ?? "Invalid parameters",
      },
      400,
    );
  }

  const cache = caches.default;
  const cacheKey = cacheRequestFor(request, type, params);

  try {
    const cached = await cache.match(cacheKey);

    if (cached) {
      return clientResponse(
        request,
        cached.body,
        200,
        {
          "X-Cache": "HIT",
          "X-Aicu-Source":
            cached.headers.get("X-Aicu-Source") ?? "unknown",
        },
      );
    }
  } catch {
    // 缓存不可用按 MISS 处理，不绕过限流。
  }

  const limit = await checkRateLimits(request, env);

  if (!limit.allowed) {
    return jsonResponse(
      request,
      { ok: false, error: limit.reason },
      limit.status,
      {
        "X-Cache": "MISS",
        "Retry-After": "60",
      },
    );
  }

  const result =
    type === "assets"
      ? await queryAssets(params)
      : await queryVersioned(type, params);

  if (!result.success) {
    return jsonResponse(
      request,
      {
        ok: false,
        route: type,
        error: "all_upstreams_failed",
        details:
          type === "assets"
            ? result.failures
            : { v3: result.v3, v4: result.v4 },
      },
      502,
      { "X-Cache": "MISS" },
    );
  }

  const partial =
    type === "assets" && result.partial === true;

  const payload =
    type === "assets"
      ? {
          ok: true,
          route: type,
          partial,
          sources: result.sources,
          data: result.data,
          failures: result.failures,
        }
      : {
          ok: true,
          route: type,
          source: result.source,
          fallbackUsed: result.fallbackUsed,
          data: result.data,
        };

  const source =
    type === "assets"
      ? `medals=${result.sources.medals ?? "failed"};` +
        `collections=${result.sources.collections ?? "failed"}`
      : result.source;

  const text = JSON.stringify(payload);

  // 仅完整成功结果缓存。
  // 内部缓存不携带 CORS、Cookie 或 ticket。
  if (!partial) {
    const stored = new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control":
          `public, max-age=${CONFIG.cacheTtl[type]}`,
        "X-Aicu-Source": source,
      },
    });

    ctx.waitUntil(
      cache.put(cacheKey, stored).catch(() => {
        // 写缓存失败不影响当前查询结果。
      }),
    );
  }

  return clientResponse(request, text, 200, {
    "X-Cache": partial ? "BYPASS-PARTIAL" : "MISS",
    "X-Aicu-Source": source,
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const origin = request.headers.get("Origin");

      // 保留无 Origin 请求，便于地址栏或命令行测试。
      // 此检查是浏览器来源约束，不是身份认证。
      if (origin && origin !== CONFIG.allowedOrigin) {
        return jsonResponse(
          request,
          { ok: false, error: "origin_not_allowed" },
          403,
        );
      }

      if (request.url.length > CONFIG.maxUrlLength) {
        return jsonResponse(
          request,
          { ok: false, error: "url_too_long" },
          414,
        );
      }

      const url = new URL(request.url);
      const type = ROUTES.get(url.pathname);
      const isLogin = url.pathname === '/api/aicu/auth/login';
      const isSession = url.pathname === '/api/aicu/auth/session';
      const method = isLogin ? 'POST' : 'GET';

      if (!type && !isLogin && !isSession) {
        return jsonResponse(
          request,
          { ok: false, error: "not_found" },
          404,
        );
      }

      if (request.method === "OPTIONS") {
        const requestedMethod = request.headers.get(
          "Access-Control-Request-Method",
        );

        const requestedHeaders = (
          request.headers.get(
            "Access-Control-Request-Headers",
          ) ?? ""
        )
          .toLowerCase()
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

        if (
          requestedMethod !== method ||
          requestedHeaders.some(
            (name) => !['content-type', 'authorization'].includes(name),
          )
        ) {
          return jsonResponse(
            request,
            { ok: false, error: "preflight_not_allowed" },
            403,
          );
        }

        return new Response(null, {
          status: 204,
          headers: {
            ...corsHeaders(request),
            "Cache-Control": "no-store",
          },
        });
      }

      if (request.method !== method) {
        return jsonResponse(
          request,
          { ok: false, error: "method_not_allowed" },
          405,
          { Allow: `${method}, OPTIONS` },
        );
      }

      if (isLogin || isSession) {
        if (url.search) return jsonResponse(request, { ok: false, error: 'unexpected_parameters' }, 400);
        const { status, ...body } = await (isLogin ? login(request, env) : authorize(request, env));
        return jsonResponse(request, { ok: status === 200, ...body }, status, status === 429 ? { 'Retry-After': '60' } : {});
      }
      // Required even on cache hits. Never move this check into the cache-miss branch.
      const auth = await authorize(request, env);
      if (auth.status !== 200) return jsonResponse(request, { ok: false, error: auth.error }, auth.status);
      return await handleApi(request, env, ctx, type);
    } catch {
      // 不向客户端泄露内部 URL、ticket、Cookie 或堆栈。
      return jsonResponse(
        request,
        { ok: false, error: "internal_error" },
        500,
      );
    }
  },
};
