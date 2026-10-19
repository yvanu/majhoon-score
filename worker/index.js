var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/buffer.js
var bufferToFormData = /* @__PURE__ */ __name((arrayBuffer, contentType) => {
  const response = new Response(arrayBuffer, {
    headers: {
      // Normalize the media type (case-insensitive) while keeping parameters like the boundary
      "Content-Type": contentType.replace(/^[^;]+/, (mediaType) => mediaType.toLowerCase())
    }
  });
  return response.formData();
}, "bufferToFormData");

// node_modules/hono/dist/utils/body.js
var isRawRequest = /* @__PURE__ */ __name((request) => "headers" in request, "isRawRequest");
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const contentType = headers.get("Content-Type");
  const mediaType = contentType?.split(";")[0].trim().toLowerCase();
  if (mediaType === "multipart/form-data" || mediaType === "application/x-www-form-urlencoded") {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  if (!isRawRequest(request) && request.bodyCache.formData) {
    return convertFormDataToBodyData(
      await request.bodyCache.formData,
      options
    );
  }
  const headers = isRawRequest(request) ? request.headers : request.raw.headers;
  const arrayBuffer = await request.arrayBuffer();
  const formDataPromise = bufferToFormData(arrayBuffer, headers.get("Content-Type") || "");
  if (!isRawRequest(request)) {
    request.bodyCache.formData = formDataPromise;
  }
  const formData = await formDataPromise;
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = /* @__PURE__ */ Object.create(null);
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = /* @__PURE__ */ Object.create(null);
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var createResponseInstance = /* @__PURE__ */ __name((body, init) => new Response(body, init), "createResponseInstance");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders2 = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders2.append(key, value);
        } else {
          responseHeaders2.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders2.set(k, v);
        } else {
          responseHeaders2.delete(k);
          for (const v2 of v) {
            responseHeaders2.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders2 });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler, baseRoutePath) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path,
      method,
      handler
    };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path = this.getPath(request, { env });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = /* @__PURE__ */ __name((children) => {
  for (const _ in children) {
    return true;
  }
  return false;
}, "hasChildren");
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (m[0].length === restPathString.length && child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  node.#params,
                  params
                );
              }
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// worker/core.ts
var encoder = new TextEncoder();
var winds = ["east", "south", "west", "north"];
var jsonError = /* @__PURE__ */ __name((c, message, status = 400) => c.json({ error: message }, status), "jsonError");
var uid = /* @__PURE__ */ __name(() => crypto.randomUUID(), "uid");
var now = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "now");
var isRecord = /* @__PURE__ */ __name((value) => typeof value === "object" && value !== null, "isRecord");
function randomHex(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(randomHex, "randomHex");
async function sha2562(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha2562, "sha256");
function safeEqual(first, second) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index++) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
}
__name(safeEqual, "safeEqual");
function shareCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => characters[byte % characters.length]).join("");
}
__name(shareCode, "shareCode");
function nextPosition(wind, hand) {
  if (hand < 4) return { wind, hand: hand + 1 };
  const index = winds.indexOf(wind);
  return index < winds.length - 1 ? { wind: winds[index + 1], hand: 1 } : { wind: "north", hand: 4 };
}
__name(nextPosition, "nextPosition");
function avatarSeed(name) {
  return Math.abs([...name].reduce((value, character) => value * 31 + (character.codePointAt(0) ?? 0), 7));
}
__name(avatarSeed, "avatarSeed");

// worker/auth-service.ts
function bearer(c) {
  const value = c.req.header("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}
__name(bearer, "bearer");
async function currentUser(c) {
  const token = bearer(c);
  if (!token) return null;
  return await c.env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.gender, u.avatar_url, u.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(await sha2562(token), now()).first() ?? null;
}
__name(currentUser, "currentUser");
async function createSession(c, userId) {
  const token = randomHex(32);
  const expiresAt = new Date(Date.now() + 30 * 864e5).toISOString();
  const createdAt = now();
  await c.env.DB.prepare(`
    INSERT INTO sessions(id, user_id, token_hash, expires_at, created_at)
    VALUES(?, ?, ?, ?, ?)
  `).bind(uid(), userId, await sha2562(token), expiresAt, createdAt).run();
  c.executionCtx.waitUntil(
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(createdAt).run().catch((error) => {
      console.error(JSON.stringify({ event: "expired_session_cleanup_failed", message: error instanceof Error ? error.message : String(error) }));
    })
  );
  return { token, expiresAt };
}
__name(createSession, "createSession");
async function canWrite(c, matchIdOrCode) {
  const suppliedAdminToken = c.req.header("x-admin-token") || "";
  const authToken = bearer(c);
  const [adminTokenHash, authTokenHash] = await Promise.all([
    suppliedAdminToken ? sha2562(suppliedAdminToken) : Promise.resolve(""),
    authToken ? sha2562(authToken) : Promise.resolve("")
  ]);
  const row = await c.env.DB.prepare(`
    SELECT m.admin_token_hash, m.owner_user_id,
      EXISTS(
        SELECT 1 FROM sessions s
        WHERE s.user_id = m.owner_user_id
          AND s.token_hash = ?
          AND s.expires_at > ?
      ) owner_session
    FROM matches m
    WHERE m.id = ? OR m.share_code = ?
    LIMIT 1
  `).bind(authTokenHash, now(), matchIdOrCode, matchIdOrCode.toUpperCase()).first();
  if (!row) return false;
  if (suppliedAdminToken && safeEqual(row.admin_token_hash, adminTokenHash)) return true;
  return Boolean(row.owner_user_id && Number(row.owner_session));
}
__name(canWrite, "canWrite");
async function exchangeWechatCode(c, code) {
  if (!c.env.WECHAT_APP_ID || !c.env.WECHAT_APP_SECRET) {
    throw new Error("WECHAT_CONFIG_MISSING");
  }
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", c.env.WECHAT_APP_ID);
  url.searchParams.set("secret", c.env.WECHAT_APP_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8e3);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`WECHAT_HTTP_${response.status}`);
    const text = await response.text();
    if (text.length > 4096) throw new Error("WECHAT_RESPONSE_TOO_LARGE");
    const result = JSON.parse(text);
    if (result.errcode || !result.openid) {
      console.error(JSON.stringify({
        event: "wechat_code_exchange_failed",
        errcode: result.errcode ?? -1,
        errmsg: result.errmsg ?? "missing openid"
      }));
      throw new Error("WECHAT_CODE_INVALID");
    }
    return { openid: result.openid, unionid: result.unionid ?? null };
  } finally {
    clearTimeout(timeout);
  }
}
__name(exchangeWechatCode, "exchangeWechatCode");
async function findOrCreateWechatUser(c, openid, unionid) {
  const existing = await c.env.DB.prepare(`
    SELECT id, username, display_name, gender, avatar_url, created_at FROM users WHERE wechat_openid = ?
  `).bind(openid).first();
  if (existing) return existing;
  const id = uid();
  const createdAt = now();
  const username = `\u5FAE\u4FE1\u7528\u6237${id.replaceAll("-", "").slice(0, 8)}`;
  try {
    await c.env.DB.prepare(`
      INSERT INTO users(id, username, wechat_openid, wechat_unionid, created_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(id, username, openid, unionid, createdAt).run();
    return { id, username, display_name: null, gender: null, avatar_url: null, created_at: createdAt };
  } catch (error) {
    const raced = await c.env.DB.prepare(`
      SELECT id, username, display_name, gender, avatar_url, created_at FROM users WHERE wechat_openid = ?
    `).bind(openid).first();
    if (raced) return raced;
    throw error;
  }
}
__name(findOrCreateWechatUser, "findOrCreateWechatUser");

// worker/routes/auth.ts
function registerAuthRoutes(app2) {
  app2.post("/api/auth/wechat", async (c) => {
    const startedAt = performance.now();
    const body = await c.req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 256) return jsonError(c, "\u5FAE\u4FE1\u767B\u5F55\u51ED\u8BC1\u65E0\u6548");
    const parsedAt = performance.now();
    try {
      const identity = await exchangeWechatCode(c, code);
      const exchangedAt = performance.now();
      const user = await findOrCreateWechatUser(c, identity.openid, identity.unionid);
      const userResolvedAt = performance.now();
      const session = await createSession(c, user.id);
      const sessionCreatedAt = performance.now();
      c.header("Server-Timing", [
        `parse;dur=${(parsedAt - startedAt).toFixed(1)}`,
        `wechat;dur=${(exchangedAt - parsedAt).toFixed(1)}`,
        `user;dur=${(userResolvedAt - exchangedAt).toFixed(1)}`,
        `session;dur=${(sessionCreatedAt - userResolvedAt).toFixed(1)}`,
        `total;dur=${(sessionCreatedAt - startedAt).toFixed(1)}`
      ].join(", "));
      return c.json({ user, ...session });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "WECHAT_CONFIG_MISSING") return jsonError(c, "\u5FAE\u4FE1\u767B\u5F55\u5C1A\u672A\u5B8C\u6210\u670D\u52A1\u7AEF\u914D\u7F6E", 503);
      if (message === "WECHAT_CODE_INVALID") return jsonError(c, "\u5FAE\u4FE1\u767B\u5F55\u51ED\u8BC1\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u8BD5", 401);
      console.error(JSON.stringify({ event: "wechat_login_failed", message }));
      return jsonError(c, "\u5FAE\u4FE1\u767B\u5F55\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", 502);
    }
  });
  app2.get("/api/auth/me", async (c) => {
    const user = await currentUser(c);
    return user ? c.json({ user }) : jsonError(c, "\u672A\u767B\u5F55", 401);
  });
  app2.post("/api/auth/logout", async (c) => {
    const token = bearer(c);
    if (token) {
      await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha2562(token)).run();
    }
    return c.json({ ok: true });
  });
}
__name(registerAuthRoutes, "registerAuthRoutes");

// worker/routes/chat.ts
function mapMessage(row) {
  let payload = null;
  if (row.payload) {
    try {
      const parsed = JSON.parse(row.payload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
    } catch {
      payload = null;
    }
  }
  return { ...row, sequence: Number(row.sequence), payload };
}
__name(mapMessage, "mapMessage");
function displayName(user) {
  return user.display_name?.trim() || user.username;
}
__name(displayName, "displayName");
async function findChatMember(db, groupId, userId) {
  return await db.prepare(`
    SELECT cr.id room_id, cr.group_session_id, cr.status room_status,
           cr.next_sequence latest_sequence, cm.last_read_sequence
    FROM group_chat_rooms cr
    JOIN group_chat_members cm ON cm.room_id = cr.id
    WHERE cr.group_session_id = ? AND cm.user_id = ? AND cm.left_at IS NULL
    LIMIT 1
  `).bind(groupId, userId).first();
}
__name(findChatMember, "findChatMember");
function registerChatRoutes(app2) {
  app2.get("/api/group-sessions/:id/chat", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const groupId = c.req.param("id");
    const member = await findChatMember(c.env.DB, groupId, user.id);
    if (!member) return jsonError(c, "\u53EA\u6709\u5DF2\u786E\u8BA4\u7684\u7EC4\u5C40\u6210\u5458\u53EF\u4EE5\u67E5\u770B\u7FA4\u804A", 401);
    const after = Math.max(0, Number(c.req.query("after") || 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50) || 50));
    const result = after > 0 ? await c.env.DB.prepare(`
          SELECT id, room_id, sender_user_id, sender_name, sequence, message_type, content,
                 event_type, payload, client_message_id, created_at, recalled_at
          FROM group_chat_messages
          WHERE room_id = ? AND sequence > ?
          ORDER BY sequence ASC
          LIMIT ?
        `).bind(member.room_id, after, limit).all() : await c.env.DB.prepare(`
          SELECT id, room_id, sender_user_id, sender_name, sequence, message_type, content,
                 event_type, payload, client_message_id, created_at, recalled_at
          FROM group_chat_messages
          WHERE room_id = ?
          ORDER BY sequence DESC
          LIMIT ?
        `).bind(member.room_id, limit).all();
    const messages = result.results.map(mapMessage);
    if (!after) messages.reverse();
    const latestSequence = Number(member.latest_sequence);
    if (latestSequence > Number(member.last_read_sequence)) {
      c.executionCtx.waitUntil(
        c.env.DB.prepare(`
          UPDATE group_chat_members
          SET last_read_sequence = MAX(last_read_sequence, ?)
          WHERE room_id = ? AND user_id = ? AND left_at IS NULL
        `).bind(latestSequence, member.room_id, user.id).run().catch((error) => {
          console.error(JSON.stringify({
            event: "group_chat_background_read_failed",
            groupId,
            userId: user.id,
            message: error instanceof Error ? error.message : String(error)
          }));
        })
      );
    }
    return c.json({
      room: {
        id: member.room_id,
        group_session_id: member.group_session_id,
        status: member.room_status,
        latest_sequence: latestSequence
      },
      messages
    });
  });
  app2.post("/api/group-sessions/:id/chat/messages", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const groupId = c.req.param("id");
    const member = await findChatMember(c.env.DB, groupId, user.id);
    if (!member) return jsonError(c, "\u53EA\u6709\u5DF2\u786E\u8BA4\u7684\u7EC4\u5C40\u6210\u5458\u53EF\u4EE5\u53D1\u9001\u6D88\u606F", 401);
    if (member.room_status === "readonly") return jsonError(c, "\u8BE5\u7EC4\u5C40\u7FA4\u804A\u5DF2\u5173\u95ED", 409);
    const body = await c.req.json().catch(() => null);
    const content = isRecord(body) && typeof body.content === "string" ? body.content.trim() : "";
    const clientMessageId = isRecord(body) && typeof body.clientMessageId === "string" ? body.clientMessageId.trim() : "";
    if (!content || content.length > 500) return jsonError(c, "\u6D88\u606F\u5185\u5BB9\u5E94\u4E3A1\u81F3500\u4E2A\u5B57\u7B26");
    if (!clientMessageId || clientMessageId.length > 80) return jsonError(c, "\u6D88\u606F\u6807\u8BC6\u65E0\u6548");
    try {
      const message = await c.env.GROUP_CHAT.getByName(groupId).publishText({
        roomId: groupId,
        userId: user.id,
        userName: displayName(user),
        content,
        clientMessageId
      });
      return c.json({ message }, 201);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      if (code.includes("READONLY")) return jsonError(c, "\u8BE5\u7EC4\u5C40\u7FA4\u804A\u5DF2\u5173\u95ED", 409);
      if (code.includes("MEMBERSHIP")) return jsonError(c, "\u4F60\u5DF2\u4E0D\u5728\u8BE5\u7EC4\u5C40\u4E2D", 401);
      console.error(JSON.stringify({ event: "group_chat_send_failed", groupId, message: code }));
      return jsonError(c, "\u6D88\u606F\u53D1\u9001\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", 500);
    }
  });
  app2.post("/api/group-sessions/:id/chat/read", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const groupId = c.req.param("id");
    const member = await findChatMember(c.env.DB, groupId, user.id);
    if (!member) return jsonError(c, "\u4F60\u5DF2\u4E0D\u5728\u8BE5\u7EC4\u5C40\u4E2D", 401);
    const body = await c.req.json().catch(() => null);
    const sequence = isRecord(body) ? Math.max(0, Number(body.sequence) || 0) : 0;
    await c.env.DB.prepare(`
      UPDATE group_chat_members
      SET last_read_sequence = MAX(last_read_sequence, ?)
      WHERE room_id = ? AND user_id = ? AND left_at IS NULL
    `).bind(sequence, member.room_id, user.id).run();
    return c.json({ ok: true });
  });
  app2.get("/api/group-sessions/:id/chat/socket", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const groupId = c.req.param("id");
    const member = await findChatMember(c.env.DB, groupId, user.id);
    if (!member) return jsonError(c, "\u53EA\u6709\u5DF2\u786E\u8BA4\u7684\u7EC4\u5C40\u6210\u5458\u53EF\u4EE5\u8FDB\u5165\u7FA4\u804A", 401);
    if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return jsonError(c, "\u9700\u8981\u5EFA\u7ACB WebSocket \u8FDE\u63A5");
    const headers = new Headers(c.req.raw.headers);
    headers.set("x-chat-room-id", groupId);
    headers.set("x-chat-user-id", user.id);
    headers.set("x-chat-user-name", displayName(user));
    return c.env.GROUP_CHAT.getByName(groupId).fetch(new Request("https://group-chat.internal/socket", {
      method: "GET",
      headers
    }));
  });
}
__name(registerChatRoutes, "registerChatRoutes");

// worker/routes/friend-links.ts
async function canLinkUser(db, ownerUserId, ownerPlayerName, targetUserId) {
  if (!targetUserId || ownerUserId === targetUserId) return false;
  const row = await db.prepare(`
    SELECT 1 known
    WHERE EXISTS (
      SELECT 1
      FROM matches m
      JOIN players mine ON mine.match_id = m.id AND (
        mine.user_id = ? OR (
          m.owner_user_id = ? AND mine.user_id IS NULL AND mine.friend_id IS NULL AND mine.name = ? COLLATE NOCASE
        )
      )
      JOIN players target ON target.match_id = m.id AND target.user_id = ?
    ) OR EXISTS (
      SELECT 1
      FROM group_session_members mine
      JOIN group_session_members other ON other.group_session_id = mine.group_session_id
      WHERE mine.user_id = ? AND mine.status = 'confirmed'
        AND other.user_id = ? AND other.status = 'confirmed'
    ) OR EXISTS (
      SELECT 1
      FROM match_lobbies lobby
      JOIN match_lobby_members other ON other.lobby_id = lobby.id AND other.user_id = ?
      WHERE lobby.owner_user_id = ? OR EXISTS (
        SELECT 1 FROM match_lobby_members mine WHERE mine.lobby_id = lobby.id AND mine.user_id = ?
      )
    )
    LIMIT 1
  `).bind(ownerUserId, ownerUserId, ownerPlayerName, targetUserId, ownerUserId, targetUserId, targetUserId, ownerUserId, ownerUserId).first();
  return Boolean(row);
}
__name(canLinkUser, "canLinkUser");
function registerFriendLinkRoutes(app2) {
  app2.get("/api/me/known-users", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const playerName = user.display_name?.trim() || user.username;
    const result = await c.env.DB.prepare(`
      WITH known AS (
        SELECT other.user_id user_id, MAX(m.created_at) last_played_at
        FROM matches m
        JOIN players mine ON mine.match_id = m.id AND (
          mine.user_id = ? OR (
            m.owner_user_id = ? AND mine.user_id IS NULL AND mine.friend_id IS NULL AND mine.name = ? COLLATE NOCASE
          )
        )
        JOIN players other ON other.match_id = m.id
        WHERE other.user_id IS NOT NULL AND other.user_id <> ?
        GROUP BY other.user_id
        UNION ALL
        SELECT other.user_id user_id, MAX(other.joined_at) last_played_at
        FROM group_session_members mine
        JOIN group_session_members other ON other.group_session_id = mine.group_session_id
        WHERE mine.user_id = ? AND mine.status = 'confirmed'
          AND other.user_id IS NOT NULL AND other.user_id <> ? AND other.status = 'confirmed'
        GROUP BY other.user_id
        UNION ALL
        SELECT other.user_id user_id, MAX(other.joined_at) last_played_at
        FROM match_lobbies lobby
        JOIN match_lobby_members other ON other.lobby_id = lobby.id
        WHERE other.user_id IS NOT NULL AND other.user_id <> ? AND (
          lobby.owner_user_id = ? OR EXISTS (
            SELECT 1 FROM match_lobby_members mine WHERE mine.lobby_id = lobby.id AND mine.user_id = ?
          )
        )
        GROUP BY other.user_id
      ),
      merged AS (
        SELECT user_id, MAX(last_played_at) last_played_at FROM known GROUP BY user_id
      )
      SELECT u.id, COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) display_name,
        u.avatar_url, u.gender, merged.last_played_at
      FROM merged
      JOIN users u ON u.id = merged.user_id
      LEFT JOIN friends f ON f.user_id = ? AND f.linked_user_id = u.id
      WHERE f.id IS NULL
      ORDER BY merged.last_played_at DESC
      LIMIT 100
    `).bind(user.id, user.id, playerName, user.id, user.id, user.id, user.id, user.id, user.id, user.id).all();
    const users = result.results.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      gender: row.gender === "male" || row.gender === "female" ? row.gender : null,
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null
    }));
    return c.json({ users });
  });
  app2.put("/api/me/friends/:id/link", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const friendId = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const linkedUserId = typeof body?.linkedUserId === "string" ? body.linkedUserId.trim() : "";
    if (!linkedUserId) return jsonError(c, "\u8BF7\u9009\u62E9\u8981\u5173\u8054\u7684\u5FAE\u4FE1\u7528\u6237");
    const friend = await c.env.DB.prepare("SELECT id FROM friends WHERE id = ? AND user_id = ?").bind(friendId, user.id).first();
    if (!friend) return jsonError(c, "\u724C\u53CB\u4E0D\u5B58\u5728", 404);
    if (!await canLinkUser(c.env.DB, user.id, user.display_name?.trim() || user.username, linkedUserId)) return jsonError(c, "\u53EA\u80FD\u5173\u8054\u4E0E\u4F60\u540C\u684C\u6216\u540C\u7EC4\u5C40\u8FC7\u7684\u5FAE\u4FE1\u7528\u6237", 409);
    const conflict = await c.env.DB.prepare("SELECT id FROM friends WHERE user_id = ? AND linked_user_id = ? AND id <> ?").bind(user.id, linkedUserId, friendId).first();
    if (conflict) return jsonError(c, "\u8BE5\u5FAE\u4FE1\u7528\u6237\u5DF2\u7ECF\u5173\u8054\u4E86\u5176\u4ED6\u724C\u53CB", 409);
    await c.env.DB.prepare("UPDATE friends SET linked_user_id = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(linkedUserId, now(), friendId, user.id).run();
    return c.json({ ok: true });
  });
  app2.delete("/api/me/friends/:id/link", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const friendId = c.req.param("id");
    const result = await c.env.DB.prepare("UPDATE friends SET linked_user_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?").bind(now(), friendId, user.id).run();
    if (!result.meta?.changes) return jsonError(c, "\u724C\u53CB\u4E0D\u5B58\u5728", 404);
    return c.json({ ok: true });
  });
}
__name(registerFriendLinkRoutes, "registerFriendLinkRoutes");

// worker/validation.ts
var handTypes = ["tsumo", "ron", "draw", "event", "custom"];
var recordedPatterns = /* @__PURE__ */ new Set(["\u65E0\u82B1\u679C", "\u5BF9\u5BF9\u80E1", "\u6DF7\u4E00\u8272", "\u6E05\u4E00\u8272", "\u4E03\u5BF9", "\u5168\u7403\u72EC\u9493", "\u9F99\u4E03", "\u82B1\u5F00", "\u6760\u5F00", "\u62A2\u6760", "\u538B\u7EDD", "\u5929\u80E1", "\u5730\u542C", "\u5916\u5305"]);
var mahjongTiles = /* @__PURE__ */ new Set([
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
  "5p",
  "6p",
  "7p",
  "8p",
  "9p",
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "east",
  "south",
  "west",
  "north",
  "red",
  "green",
  "white"
]);
function validatePlayers(value) {
  if (!isRecord(value) || !Array.isArray(value.players) || value.players.length !== 4) return null;
  const players = value.players.map((player) => {
    if (typeof player === "string") return { name: player.trim() };
    if (!isRecord(player) || typeof player.name !== "string") return null;
    const name = player.name.trim();
    const friendId = typeof player.friendId === "string" ? player.friendId.trim() : void 0;
    const isSelf = player.isSelf === true;
    return { name, ...friendId ? { friendId } : {}, ...isSelf ? { isSelf: true } : {} };
  });
  if (players.some((player) => !player || !player.name || player.name.length > 12)) return null;
  const valid = players;
  if (new Set(valid.map((player) => player.name.toLocaleLowerCase())).size !== 4) return null;
  return valid;
}
__name(validatePlayers, "validatePlayers");
function validateTileRecord(value) {
  if (!isRecord(value)) return null;
  const readTiles = /* @__PURE__ */ __name((input, max) => {
    if (!Array.isArray(input) || input.length > max) return null;
    const tiles = input.filter((tile) => typeof tile === "string" && mahjongTiles.has(tile));
    return tiles.length === input.length ? tiles : null;
  }, "readTiles");
  const pongs = readTiles(value.pongs, 4);
  const exposedKongs = readTiles(value.exposedKongs, 4);
  const concealedKongs = readTiles(value.concealedKongs, 4);
  const hand = readTiles(value.hand, 13);
  const winningTile = value.winningTile === null ? null : typeof value.winningTile === "string" && mahjongTiles.has(value.winningTile) ? value.winningTile : void 0;
  if (!pongs || !exposedKongs || !concealedKongs || !hand || winningTile === void 0) return null;
  const meldCount = pongs.length + exposedKongs.length + concealedKongs.length;
  if (meldCount > 4) return null;
  const kongCount = exposedKongs.length + concealedKongs.length;
  const physicalTileCount = pongs.length * 3 + kongCount * 4 + hand.length + (winningTile ? 1 : 0);
  if (physicalTileCount > 14 + kongCount) return null;
  const counts = /* @__PURE__ */ new Map();
  const add = /* @__PURE__ */ __name((tile, amount) => counts.set(tile, (counts.get(tile) ?? 0) + amount), "add");
  pongs.forEach((tile) => add(tile, 3));
  exposedKongs.forEach((tile) => add(tile, 4));
  concealedKongs.forEach((tile) => add(tile, 4));
  hand.forEach((tile) => add(tile, 1));
  if (winningTile) add(winningTile, 1);
  if ([...counts.values()].some((count) => count > 4) || counts.size === 0) return null;
  return { pongs, exposedKongs, concealedKongs, hand, winningTile };
}
__name(validateTileRecord, "validateTileRecord");
function parseStoredTileRecord(value) {
  if (!value) return null;
  try {
    return validateTileRecord(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return null;
  }
}
__name(parseStoredTileRecord, "parseStoredTileRecord");
function bigHandPatterns(note) {
  if (typeof note !== "string") return [];
  return note.split("\u3001").map((item) => item.trim()).filter((item) => recordedPatterns.has(item));
}
__name(bigHandPatterns, "bigHandPatterns");
function resolveStatisticsPeriod(dimensionValue, rawValue, rawOffset) {
  const dimension = dimensionValue === "day" || dimensionValue === "year" ? dimensionValue : "month";
  const parsedOffset = Number(rawOffset);
  const timezoneOffset = Number.isFinite(parsedOffset) ? Math.max(-840, Math.min(840, Math.round(parsedOffset))) : 0;
  const localNow = new Date(Date.now() - timezoneOffset * 6e4);
  const defaultValue = dimension === "day" ? `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, "0")}-${String(localNow.getUTCDate()).padStart(2, "0")}` : dimension === "month" ? `${localNow.getUTCFullYear()}-${String(localNow.getUTCMonth() + 1).padStart(2, "0")}` : String(localNow.getUTCFullYear());
  const value = rawValue || defaultValue;
  let year = 0;
  let month = 1;
  let day = 1;
  if (dimension === "day") {
    const match2 = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match2) return null;
    year = Number(match2[1]);
    month = Number(match2[2]);
    day = Number(match2[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  } else if (dimension === "month") {
    const match2 = value.match(/^(\d{4})-(\d{2})$/);
    if (!match2) return null;
    year = Number(match2[1]);
    month = Number(match2[2]);
    if (month < 1 || month > 12) return null;
  } else {
    if (!/^\d{4}$/.test(value)) return null;
    year = Number(value);
  }
  if (year < 2e3 || year > 2200) return null;
  const toUtc = /* @__PURE__ */ __name((nextYear, nextMonth, nextDay) => new Date(Date.UTC(nextYear, nextMonth - 1, nextDay) + timezoneOffset * 6e4).toISOString(), "toUtc");
  const startAt = toUtc(year, month, day);
  const endAt = dimension === "day" ? toUtc(new Date(Date.UTC(year, month - 1, day + 1)).getUTCFullYear(), new Date(Date.UTC(year, month - 1, day + 1)).getUTCMonth() + 1, new Date(Date.UTC(year, month - 1, day + 1)).getUTCDate()) : dimension === "month" ? toUtc(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) : toUtc(year + 1, 1, 1);
  const label = dimension === "day" ? `${year}\u5E74${month}\u6708${day}\u65E5` : dimension === "month" ? `${year}\u5E74${month}\u6708` : `${year}\u5E74`;
  const previousLocal = dimension === "day" ? new Date(Date.UTC(year, month - 1, day - 1)) : dimension === "month" ? new Date(Date.UTC(year, month - 2, 1)) : new Date(Date.UTC(year - 1, 0, 1));
  const previousStartAt = toUtc(previousLocal.getUTCFullYear(), previousLocal.getUTCMonth() + 1, previousLocal.getUTCDate());
  const comparisonLabel = dimension === "day" ? "\u8F83\u6628\u65E5" : dimension === "month" ? "\u8F83\u4E0A\u6708" : "\u8F83\u53BB\u5E74";
  return { dimension, value, label, startAt, endAt, previousStartAt, previousEndAt: startAt, comparisonLabel };
}
__name(resolveStatisticsPeriod, "resolveStatisticsPeriod");
function validateHand(value) {
  if (!isRecord(value) || typeof value.type !== "string" || !handTypes.includes(value.type) || !Array.isArray(value.scores) || value.scores.length !== 4) return null;
  const scores = value.scores.map((item) => {
    if (!isRecord(item) || typeof item.playerId !== "string" || typeof item.change !== "number" || !Number.isInteger(item.change) || Math.abs(item.change) > 1e6) return null;
    return { playerId: item.playerId, change: item.change };
  });
  if (scores.some((item) => !item)) return null;
  const tileRecord = value.tileRecord === void 0 || value.tileRecord === null ? void 0 : validateTileRecord(value.tileRecord);
  if (value.tileRecord !== void 0 && value.tileRecord !== null && !tileRecord) return null;
  let outcomes;
  if (value.outcomes !== void 0) {
    if (!Array.isArray(value.outcomes) || value.outcomes.length < 1 || value.outcomes.length > 3) return null;
    const parsed = value.outcomes.map((item) => {
      if (!isRecord(item) || typeof item.winnerPlayerId !== "string" || typeof item.score !== "number" || !Number.isInteger(item.score) || item.score <= 0 || item.score > 1e6) return null;
      const outcomeTileRecord = item.tileRecord === void 0 || item.tileRecord === null ? void 0 : validateTileRecord(item.tileRecord);
      if (item.tileRecord !== void 0 && item.tileRecord !== null && !outcomeTileRecord) return null;
      return {
        winnerPlayerId: item.winnerPlayerId,
        score: item.score,
        note: typeof item.note === "string" ? item.note.trim().slice(0, 100) : void 0,
        tileRecord: outcomeTileRecord || void 0
      };
    });
    if (parsed.some((item) => !item)) return null;
    outcomes = parsed;
  }
  const clientRequestId = typeof value.clientRequestId === "string" ? value.clientRequestId.trim() : void 0;
  if (clientRequestId && !/^[A-Za-z0-9_-]{12,96}$/.test(clientRequestId)) return null;
  const winnerPlayerId = typeof value.winnerPlayerId === "string" ? value.winnerPlayerId : void 0;
  const note = typeof value.note === "string" ? value.note.trim().slice(0, 100) : void 0;
  if (!outcomes && (value.type === "ron" || value.type === "tsumo") && winnerPlayerId) {
    const winnerScore = scores.find((item) => item?.playerId === winnerPlayerId)?.change ?? 0;
    if (winnerScore > 0) {
      outcomes = [{ winnerPlayerId, score: winnerScore, note, tileRecord: tileRecord || void 0 }];
    }
  }
  return {
    type: value.type,
    clientRequestId,
    winnerPlayerId,
    loserPlayerId: typeof value.loserPlayerId === "string" ? value.loserPlayerId : void 0,
    outcomes,
    scores,
    note,
    tileRecord: tileRecord || void 0
  };
}
__name(validateHand, "validateHand");

// worker/match-service.ts
var matchIdSelector = "(SELECT id FROM matches WHERE id = ? OR share_code = ? LIMIT 1)";
function selectorValues(idOrCode) {
  return [idOrCode, idOrCode.toUpperCase()];
}
__name(selectorValues, "selectorValues");
function buildStats(total, result) {
  const count = Number(total.results[0]?.count ?? 0);
  return {
    totalHands: count,
    players: result.results.map((player, index) => ({
      ...player,
      score: Number(player.score),
      wins: Number(player.wins),
      tsumo: Number(player.tsumo),
      deal_in: Number(player.deal_in),
      max_gain: Number(player.max_gain),
      max_loss: Number(player.max_loss),
      rank: index + 1,
      winRate: count ? Number(player.wins) / count : 0,
      dealInRate: count ? Number(player.deal_in) / count : 0,
      tsumoShare: Number(player.wins) ? Number(player.tsumo) / Number(player.wins) : 0
    }))
  };
}
__name(buildStats, "buildStats");
function statisticsStatements(db, idOrCode) {
  const [key, code] = selectorValues(idOrCode);
  return [
    db.prepare(`SELECT COUNT(*) count FROM hands WHERE match_id = ${matchIdSelector} AND result_type <> 'event'`).bind(key, code),
    db.prepare(`
      SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat,
        COALESCE(u.avatar_url, linked.avatar_url, f.avatar_url) avatar_url,
        COALESCE(u.gender, linked.gender) gender,
        (SELECT COALESCE(SUM(hs.score_change), 0) FROM hand_scores hs WHERE hs.player_id = p.id) score,
        (SELECT COUNT(*) FROM hands h
          WHERE h.match_id = p.match_id AND h.result_type IN ('ron', 'tsumo') AND (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
            ) OR (
              h.winner_player_id = p.id AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          )) wins,
        (SELECT COUNT(*) FROM hands h
          WHERE h.match_id = p.match_id AND h.result_type = 'tsumo' AND (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
            ) OR (
              h.winner_player_id = p.id AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          )) tsumo,
        (SELECT COUNT(*) FROM hands h
          WHERE h.match_id = p.match_id AND h.result_type = 'ron' AND h.loser_player_id = p.id) deal_in,
        (SELECT COALESCE(MAX(hs.score_change), 0) FROM hand_scores hs
          WHERE hs.player_id = p.id AND hs.score_change > 0) max_gain,
        (SELECT COALESCE(MIN(hs.score_change), 0) FROM hand_scores hs
          WHERE hs.player_id = p.id AND hs.score_change < 0) max_loss
      FROM players p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN friends f ON f.id = p.friend_id
      LEFT JOIN users linked ON linked.id = f.linked_user_id
      WHERE p.match_id = ${matchIdSelector}
      ORDER BY score DESC, wins DESC, seat ASC
    `).bind(key, code)
  ];
}
__name(statisticsStatements, "statisticsStatements");
async function getMatchBundle(db, idOrCode, includeStatistics = false) {
  const [key, code] = selectorValues(idOrCode);
  const statements = [
    db.prepare(`
      SELECT id, share_code, status, current_wind, current_hand, created_at, finished_at
      FROM matches WHERE id = ? OR share_code = ? LIMIT 1
    `).bind(key, code),
    db.prepare(`
      SELECT p.id, p.name, p.avatar_seed, p.friend_id, p.user_id, p.seat,
        COALESCE(u.avatar_url, linked.avatar_url, f.avatar_url) avatar_url,
        COALESCE(u.gender, linked.gender) gender,
        COALESCE(SUM(hs.score_change), 0) score
      FROM players p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN friends f ON f.id = p.friend_id
      LEFT JOIN users linked ON linked.id = f.linked_user_id
      LEFT JOIN hand_scores hs ON hs.player_id = p.id
      WHERE p.match_id = ${matchIdSelector}
      GROUP BY p.id
      ORDER BY p.seat
    `).bind(key, code),
    db.prepare(`
      SELECT id, sequence, wind, hand_number, result_type, winner_player_id,
             loser_player_id, note, tile_record, created_at
      FROM hands
      WHERE match_id = ${matchIdSelector}
      ORDER BY sequence DESC
    `).bind(key, code),
    db.prepare(`
      SELECT hs.hand_id, hs.player_id, hs.score_change
      FROM hand_scores hs
      JOIN hands h ON h.id = hs.hand_id
      WHERE h.match_id = ${matchIdSelector}
      ORDER BY h.sequence DESC, hs.player_id
    `).bind(key, code),
    db.prepare(`
      SELECT ho.hand_id, ho.winner_player_id, ho.score_gain, ho.note, ho.tile_record
      FROM hand_outcomes ho
      JOIN hands h ON h.id = ho.hand_id
      WHERE h.match_id = ${matchIdSelector}
      ORDER BY h.sequence DESC, ho.outcome_order ASC
    `).bind(key, code)
  ];
  if (includeStatistics) statements.push(...statisticsStatements(db, idOrCode));
  const results = await db.batch(statements);
  const match2 = results[0].results[0];
  if (!match2) return null;
  const players = results[1];
  const hands = results[2];
  const handScores = results[3];
  const handOutcomes = results[4];
  const scoresByHand = /* @__PURE__ */ new Map();
  handScores.results.forEach((score) => {
    const current = scoresByHand.get(score.hand_id) || [];
    current.push({ playerId: score.player_id, change: Number(score.score_change) });
    scoresByHand.set(score.hand_id, current);
  });
  const outcomesByHand = /* @__PURE__ */ new Map();
  handOutcomes.results.forEach((outcome) => {
    const current = outcomesByHand.get(outcome.hand_id) || [];
    current.push({
      winner_player_id: outcome.winner_player_id,
      score: Number(outcome.score_gain),
      note: outcome.note,
      tile_record: parseStoredTileRecord(outcome.tile_record)
    });
    outcomesByHand.set(outcome.hand_id, current);
  });
  const response = {
    match: {
      ...match2,
      players: players.results.map((player) => ({ ...player, score: Number(player.score) })),
      hands: hands.results.map((hand) => {
        const scores = scoresByHand.get(hand.id) || [];
        const primaryTileRecord = parseStoredTileRecord(hand.tile_record);
        const canHaveOutcomes = hand.result_type === "ron" || hand.result_type === "tsumo";
        const outcomes = canHaveOutcomes ? outcomesByHand.get(hand.id) || (hand.winner_player_id ? [{
          winner_player_id: hand.winner_player_id,
          score: scores.find((score) => score.playerId === hand.winner_player_id)?.change || 0,
          note: hand.note,
          tile_record: primaryTileRecord
        }] : []) : [];
        return {
          ...hand,
          tile_record: primaryTileRecord,
          outcomes,
          scores
        };
      })
    }
  };
  if (includeStatistics) {
    response.stats = buildStats(
      results[5],
      results[6]
    );
  }
  return response;
}
__name(getMatchBundle, "getMatchBundle");
async function getMatch(db, idOrCode) {
  return (await getMatchBundle(db, idOrCode))?.match ?? null;
}
__name(getMatch, "getMatch");
async function getMatchStatistics(db, idOrCode) {
  const [key, code] = selectorValues(idOrCode);
  const [match2, total, result] = await db.batch([
    db.prepare("SELECT id FROM matches WHERE id = ? OR share_code = ? LIMIT 1").bind(key, code),
    ...statisticsStatements(db, idOrCode)
  ]);
  if (!match2.results.length) return null;
  return buildStats(
    total,
    result
  );
}
__name(getMatchStatistics, "getMatchStatistics");

// worker/match-creation.ts
async function uniqueMatchCode(db) {
  let code = shareCode();
  for (let attempt = 0; attempt < 6; attempt++) {
    if (!await db.prepare("SELECT 1 FROM matches WHERE share_code = ?").bind(code).first()) return code;
    code = shareCode();
  }
  return `${shareCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
}
__name(uniqueMatchCode, "uniqueMatchCode");
async function createMatchFromParticipants(db, ownerUserId, participants, createdAt = now()) {
  if (participants.length !== 4) throw new Error("MATCH_REQUIRES_FOUR_PARTICIPANTS");
  const matchId = uid();
  const adminToken = randomHex(24);
  const code = await uniqueMatchCode(db);
  const adminTokenHash = await sha2562(adminToken);
  await db.batch([
    ...participants.flatMap((participant) => participant.friendId ? [db.prepare("UPDATE friends SET last_played_at = ?, updated_at = ? WHERE id = ?").bind(createdAt, createdAt, participant.friendId)] : []),
    db.prepare(`
      INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).bind(matchId, code, adminTokenHash, ownerUserId, createdAt, createdAt),
    ...participants.map((participant, seat) => db.prepare(`
      INSERT INTO players(id, match_id, name, avatar_seed, friend_id, user_id, seat, created_at)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      uid(),
      matchId,
      participant.name,
      participant.avatarSeed,
      participant.friendId,
      participant.userId,
      seat,
      createdAt
    ))
  ]);
  const match2 = await getMatch(db, matchId);
  if (!match2) throw new Error("MATCH_CREATE_FAILED");
  return { match: match2, adminToken };
}
__name(createMatchFromParticipants, "createMatchFromParticipants");

// worker/routes/groups.ts
function userDisplayName(user) {
  return user.display_name?.trim() || user.username;
}
__name(userDisplayName, "userDisplayName");
function publishChatSystem(c, roomId, content, eventType, payload) {
  c.executionCtx.waitUntil(
    c.env.GROUP_CHAT.getByName(roomId).publishSystem({ roomId, content, eventType, payload }).catch((error) => {
      console.error(JSON.stringify({
        event: "group_chat_system_message_failed",
        roomId,
        eventType,
        message: error instanceof Error ? error.message : String(error)
      }));
    })
  );
}
__name(publishChatSystem, "publishChatSystem");
async function activateChatMember(db, roomId, userId, joinedAt) {
  await db.prepare(`
    INSERT INTO group_chat_members(room_id, user_id, joined_at, left_at, last_read_sequence, notification_level)
    VALUES(?, ?, ?, NULL, 0, 'important')
    ON CONFLICT(room_id, user_id) DO UPDATE SET left_at = NULL, joined_at = excluded.joined_at
  `).bind(roomId, userId, joinedAt).run();
}
__name(activateChatMember, "activateChatMember");
async function deactivateChatMember(db, roomId, userId, leftAt) {
  await db.prepare(`
    UPDATE group_chat_members SET left_at = ?
    WHERE room_id = ? AND user_id = ? AND left_at IS NULL
  `).bind(leftAt, roomId, userId).run();
}
__name(deactivateChatMember, "deactivateChatMember");
function parseCreateInput(value) {
  if (!isRecord(value)) return null;
  const startAt = typeof value.startAt === "string" ? value.startAt.trim() : "";
  const location = typeof value.location === "string" ? value.location.trim() : "";
  const note = typeof value.note === "string" ? value.note.trim() : "";
  const friendIds = Array.isArray(value.friendIds) ? [...new Set(value.friendIds.filter((item) => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()))] : [];
  const timestamp = Date.parse(startAt);
  if (!startAt || !Number.isFinite(timestamp) || timestamp < Date.now() - 36e5 || timestamp > Date.now() + 180 * 864e5) return null;
  if (!location || location.length > 60 || note.length > 160 || friendIds.length > 3) return null;
  return { startAt: new Date(timestamp).toISOString(), location, note: note || null, friendIds };
}
__name(parseCreateInput, "parseCreateInput");
function mapGroup(row, members, userId) {
  return {
    ...row,
    capacity: Number(row.capacity),
    confirmed_count: Number(row.confirmed_count),
    invited_count: Number(row.invited_count),
    chat_unread_count: Number(row.chat_unread_count || 0),
    chat_last_message_preview: row.chat_last_message_preview,
    chat_last_message_at: row.chat_last_message_at,
    members,
    is_owner: row.owner_user_id === userId,
    is_member: row.owner_user_id === userId || members.some((member) => member.user_id === userId)
  };
}
__name(mapGroup, "mapGroup");
async function loadMembers(db, groupIds) {
  const grouped = /* @__PURE__ */ new Map();
  if (!groupIds.length) return grouped;
  const placeholders = groupIds.map(() => "?").join(", ");
  const result = await db.prepare(`
    SELECT gm.id, gm.group_session_id, gm.user_id, gm.friend_id,
      CASE WHEN gm.user_id IS NOT NULL THEN COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) ELSE gm.name END name,
      gm.avatar_seed, COALESCE(u.avatar_url, linked.avatar_url, f.avatar_url) avatar_url,
      COALESCE(u.gender, linked.gender) gender,
      gm.role, gm.status, gm.joined_at
    FROM group_session_members gm
    LEFT JOIN users u ON u.id = gm.user_id
    LEFT JOIN friends f ON f.id = gm.friend_id
    LEFT JOIN users linked ON linked.id = f.linked_user_id
    WHERE gm.group_session_id IN (${placeholders})
    ORDER BY CASE gm.role WHEN 'owner' THEN 0 ELSE 1 END, CASE gm.status WHEN 'confirmed' THEN 0 ELSE 1 END, gm.joined_at ASC
  `).bind(...groupIds).all();
  for (const row of result.results) {
    const members = grouped.get(row.group_session_id) ?? [];
    members.push({
      id: row.id,
      user_id: row.user_id,
      friend_id: row.friend_id,
      name: row.name,
      avatar_seed: Number(row.avatar_seed),
      avatar_url: row.avatar_url,
      gender: row.gender,
      role: row.role,
      status: row.status,
      joined_at: row.joined_at
    });
    grouped.set(row.group_session_id, members);
  }
  return grouped;
}
__name(loadMembers, "loadMembers");
async function loadGroup(db, idOrCode, userId) {
  const row = await db.prepare(`
    SELECT gs.id, gs.share_code, gs.owner_user_id,
           COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) owner_name,
           gs.start_at, gs.location, gs.note, gs.capacity, gs.status, gs.match_id,
           gs.created_at, gs.updated_at,
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'confirmed') confirmed_count,
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'invited') invited_count,
           COALESCE((
             SELECT COUNT(*)
             FROM group_chat_messages msg
             JOIN group_chat_members cm ON cm.room_id = msg.room_id
             WHERE msg.room_id = gs.id AND cm.user_id = ? AND cm.left_at IS NULL
               AND msg.sequence > cm.last_read_sequence
           ), 0) chat_unread_count,
           (SELECT content FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_preview,
           (SELECT created_at FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_at
    FROM group_sessions gs
    JOIN users u ON u.id = gs.owner_user_id
    WHERE gs.id = ? OR gs.share_code = ? COLLATE NOCASE
    LIMIT 1
  `).bind(userId, idOrCode, idOrCode).first();
  if (!row) return null;
  const members = await loadMembers(db, [row.id]);
  return mapGroup(row, members.get(row.id) ?? [], userId);
}
__name(loadGroup, "loadGroup");
async function syncGroupStatus(db, groupId) {
  const row = await db.prepare(`
    SELECT gs.status, gs.capacity,
           (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'confirmed') confirmed_count
    FROM group_sessions gs
    WHERE gs.id = ?
  `).bind(groupId).first();
  if (!row || ["active", "finished", "cancelled"].includes(row.status)) return row?.status ?? null;
  const nextStatus = Number(row.confirmed_count) >= Number(row.capacity) ? "full" : "recruiting";
  if (nextStatus !== row.status) {
    await db.prepare("UPDATE group_sessions SET status = ?, updated_at = ? WHERE id = ?").bind(nextStatus, now(), groupId).run();
  }
  return nextStatus;
}
__name(syncGroupStatus, "syncGroupStatus");
async function uniqueGroupCode(db) {
  let code = shareCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!await db.prepare("SELECT 1 FROM group_sessions WHERE share_code = ?").bind(code).first()) return code;
    code = shareCode();
  }
  return `${shareCode()}${Math.floor(Math.random() * 10)}`;
}
__name(uniqueGroupCode, "uniqueGroupCode");
function registerGroupRoutes(app2) {
  app2.get("/api/group-sessions", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const result = await c.env.DB.prepare(`
      SELECT gs.id, gs.share_code, gs.owner_user_id,
             COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) owner_name,
             gs.start_at, gs.location, gs.note, gs.capacity, gs.status, gs.match_id,
             gs.created_at, gs.updated_at,
             (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'confirmed') confirmed_count,
             (SELECT COUNT(*) FROM group_session_members gm WHERE gm.group_session_id = gs.id AND gm.status = 'invited') invited_count,
             COALESCE((
               SELECT COUNT(*)
               FROM group_chat_messages msg
               JOIN group_chat_members cm ON cm.room_id = msg.room_id
               WHERE msg.room_id = gs.id AND cm.user_id = ? AND cm.left_at IS NULL
                 AND msg.sequence > cm.last_read_sequence
             ), 0) chat_unread_count,
             (SELECT content FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_preview,
             (SELECT created_at FROM group_chat_messages msg WHERE msg.room_id = gs.id ORDER BY sequence DESC LIMIT 1) chat_last_message_at
      FROM group_sessions gs
      JOIN users u ON u.id = gs.owner_user_id
      WHERE (gs.status IN ('recruiting', 'full') AND gs.start_at >= ?)
         OR gs.owner_user_id = ?
         OR EXISTS (
           SELECT 1 FROM group_session_members mine
           WHERE mine.group_session_id = gs.id AND mine.user_id = ?
         )
      ORDER BY
        CASE gs.status WHEN 'recruiting' THEN 0 WHEN 'full' THEN 1 WHEN 'active' THEN 2 ELSE 3 END,
        CASE WHEN gs.status IN ('recruiting', 'full') THEN gs.start_at END ASC,
        CASE WHEN gs.status NOT IN ('recruiting', 'full') THEN gs.created_at END DESC
      LIMIT 80
    `).bind(user.id, new Date(Date.now() - 6 * 36e5).toISOString(), user.id, user.id).all();
    const members = await loadMembers(c.env.DB, result.results.map((row) => row.id));
    const groups = result.results.map((row) => mapGroup(row, members.get(row.id) ?? [], user.id));
    return c.json({ groups });
  });
  app2.post("/api/group-sessions", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const input = parseCreateInput(await c.req.json().catch(() => null));
    if (!input) return jsonError(c, "\u8BF7\u586B\u5199\u6709\u6548\u7684\u65F6\u95F4\u3001\u5730\u70B9\u548C\u9080\u8BF7\u6210\u5458");
    let selectedFriends = [];
    if (input.friendIds.length) {
      const placeholders = input.friendIds.map(() => "?").join(", ");
      const friendResult = await c.env.DB.prepare(`
        SELECT id, name, avatar_seed FROM friends
        WHERE user_id = ? AND id IN (${placeholders})
      `).bind(user.id, ...input.friendIds).all();
      if (friendResult.results.length !== input.friendIds.length) return jsonError(c, "\u90E8\u5206\u9080\u8BF7\u724C\u53CB\u4E0D\u5B58\u5728\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5", 409);
      const byId = new Map(friendResult.results.map((friend) => [friend.id, friend]));
      selectedFriends = input.friendIds.map((id) => byId.get(id)).filter((friend) => Boolean(friend));
    }
    const groupId = uid();
    const createdAt = now();
    const code = await uniqueGroupCode(c.env.DB);
    const ownerName = userDisplayName(user);
    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO group_sessions(id, share_code, owner_user_id, start_at, location, note, capacity, status, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, 4, 'recruiting', ?, ?)
      `).bind(groupId, code, user.id, input.startAt, input.location, input.note, createdAt, createdAt),
      c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, 'owner', 'confirmed', ?, ?)
      `).bind(uid(), groupId, user.id, ownerName, avatarSeed(ownerName), createdAt, createdAt),
      c.env.DB.prepare(`
        INSERT INTO group_chat_rooms(id, group_session_id, status, next_sequence, created_at)
        VALUES(?, ?, 'active', 0, ?)
      `).bind(groupId, groupId, createdAt),
      c.env.DB.prepare(`
        INSERT INTO group_chat_members(room_id, user_id, joined_at, left_at, last_read_sequence, notification_level)
        VALUES(?, ?, ?, NULL, 0, 'important')
      `).bind(groupId, user.id, createdAt),
      ...selectedFriends.map((friend) => c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, NULL, ?, ?, ?, 'member', 'invited', ?, ?)
      `).bind(uid(), groupId, friend.id, friend.name, Number(friend.avatar_seed), createdAt, createdAt))
    ]);
    publishChatSystem(c, groupId, `${ownerName}\u53D1\u8D77\u4E86\u7EC4\u5C40`, "group_created", {
      startAt: input.startAt,
      location: input.location
    });
    const group = await loadGroup(c.env.DB, groupId, user.id);
    return c.json({ group }, 201);
  });
  app2.get("/api/group-sessions/:id", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const group = await loadGroup(c.env.DB, c.req.param("id"), user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    return c.json({ group });
  });
  app2.post("/api/group-sessions/:id/join", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const group = await loadGroup(c.env.DB, id, user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    if (!["recruiting", "full"].includes(group.status)) return jsonError(c, "\u5F53\u524D\u7EC4\u5C40\u4E0D\u80FD\u52A0\u5165", 409);
    if (group.members.some((member) => member.user_id === user.id)) return c.json({ group });
    if (group.confirmed_count >= group.capacity) return jsonError(c, "\u7EC4\u5C40\u4EBA\u6570\u5DF2\u6EE1", 409);
    const joinedAt = now();
    const name = userDisplayName(user);
    const matchingInvite = await c.env.DB.prepare(`
      SELECT id FROM group_session_members
      WHERE group_session_id = ? AND user_id IS NULL AND status = 'invited' AND name = ? COLLATE NOCASE
      LIMIT 1
    `).bind(id, name).first();
    if (matchingInvite) {
      await c.env.DB.prepare(`
        UPDATE group_session_members
        SET user_id = ?, name = ?, avatar_seed = ?, status = 'confirmed', updated_at = ?
        WHERE id = ?
      `).bind(user.id, name, avatarSeed(name), joinedAt, matchingInvite.id).run();
    } else {
      await c.env.DB.prepare(`
        INSERT INTO group_session_members(id, group_session_id, user_id, friend_id, name, avatar_seed, role, status, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, 'member', 'confirmed', ?, ?)
      `).bind(uid(), id, user.id, name, avatarSeed(name), joinedAt, joinedAt).run();
    }
    await activateChatMember(c.env.DB, id, user.id, joinedAt);
    const nextStatus = await syncGroupStatus(c.env.DB, id);
    publishChatSystem(c, id, `${name}\u52A0\u5165\u4E86\u7EC4\u5C40`, "member_joined", { userId: user.id });
    if (nextStatus === "full") {
      publishChatSystem(c, id, "\u56DB\u4F4D\u724C\u53CB\u5DF2\u5230\u9F50\uFF0C\u53EF\u4EE5\u5F00\u59CB\u8BB0\u5206\u4E86", "group_full");
    }
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) });
  });
  app2.post("/api/group-sessions/:id/leave", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const group = await loadGroup(c.env.DB, id, user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    if (group.owner_user_id === user.id) return jsonError(c, "\u53D1\u8D77\u4EBA\u4E0D\u80FD\u9000\u51FA\uFF0C\u8BF7\u53D6\u6D88\u7EC4\u5C40", 409);
    if (!["recruiting", "full"].includes(group.status)) return jsonError(c, "\u5F53\u524D\u7EC4\u5C40\u4E0D\u80FD\u9000\u51FA", 409);
    const leavingMember = group.members.find((member) => member.user_id === user.id);
    await c.env.DB.prepare(`
      DELETE FROM group_session_members
      WHERE group_session_id = ? AND user_id = ? AND role = 'member'
    `).bind(id, user.id).run();
    const leftAt = now();
    await deactivateChatMember(c.env.DB, id, user.id, leftAt);
    await syncGroupStatus(c.env.DB, id);
    publishChatSystem(c, id, `${leavingMember?.name || userDisplayName(user)}\u9000\u51FA\u4E86\u7EC4\u5C40`, "member_left", { userId: user.id });
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).disconnectUser(user.id));
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) });
  });
  app2.put("/api/group-sessions/:id/members/:memberId", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const group = await loadGroup(c.env.DB, id, user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    if (!group.is_owner) return jsonError(c, "\u53EA\u6709\u53D1\u8D77\u4EBA\u53EF\u4EE5\u7BA1\u7406\u6210\u5458", 401);
    if (!["recruiting", "full"].includes(group.status)) return jsonError(c, "\u5F53\u524D\u7EC4\u5C40\u4E0D\u80FD\u4FEE\u6539\u6210\u5458", 409);
    const body = await c.req.json().catch(() => null);
    const status = isRecord(body) && (body.status === "confirmed" || body.status === "invited") ? body.status : null;
    if (!status) return jsonError(c, "\u6210\u5458\u72B6\u6001\u65E0\u6548");
    const member = group.members.find((item) => item.id === c.req.param("memberId"));
    if (!member || member.role === "owner") return jsonError(c, "\u6210\u5458\u4E0D\u5B58\u5728", 404);
    if (status === "confirmed" && member.status !== "confirmed" && group.confirmed_count >= group.capacity) {
      return jsonError(c, "\u7EC4\u5C40\u4EBA\u6570\u5DF2\u6EE1", 409);
    }
    const updatedAt = now();
    await c.env.DB.prepare(`
      UPDATE group_session_members SET status = ?, updated_at = ?
      WHERE id = ? AND group_session_id = ?
    `).bind(status, updatedAt, member.id, id).run();
    if (member.user_id) {
      if (status === "confirmed") await activateChatMember(c.env.DB, id, member.user_id, member.joined_at);
      else {
        await deactivateChatMember(c.env.DB, id, member.user_id, updatedAt);
        c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).disconnectUser(member.user_id));
      }
    }
    const nextStatus = await syncGroupStatus(c.env.DB, id);
    publishChatSystem(c, id, `${member.name}${status === "confirmed" ? "\u5DF2\u786E\u8BA4\u53C2\u52A0\u7EC4\u5C40" : "\u88AB\u8BBE\u4E3A\u5F85\u786E\u8BA4"}`, status === "confirmed" ? "member_confirmed" : "member_unconfirmed", { userId: member.user_id });
    if (nextStatus === "full") publishChatSystem(c, id, "\u56DB\u4F4D\u724C\u53CB\u5DF2\u5230\u9F50\uFF0C\u53EF\u4EE5\u5F00\u59CB\u8BB0\u5206\u4E86", "group_full");
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) });
  });
  app2.delete("/api/group-sessions/:id/members/:memberId", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const group = await loadGroup(c.env.DB, id, user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    if (!group.is_owner) return jsonError(c, "\u53EA\u6709\u53D1\u8D77\u4EBA\u53EF\u4EE5\u79FB\u9664\u6210\u5458", 401);
    if (!["recruiting", "full"].includes(group.status)) return jsonError(c, "\u5F53\u524D\u7EC4\u5C40\u4E0D\u80FD\u4FEE\u6539\u6210\u5458", 409);
    const member = group.members.find((item) => item.id === c.req.param("memberId"));
    if (!member || member.role === "owner") return jsonError(c, "\u6210\u5458\u4E0D\u5B58\u5728", 404);
    await c.env.DB.prepare(`
      DELETE FROM group_session_members WHERE id = ? AND group_session_id = ?
    `).bind(member.id, id).run();
    if (member.user_id) {
      await deactivateChatMember(c.env.DB, id, member.user_id, now());
      c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).disconnectUser(member.user_id));
    }
    await syncGroupStatus(c.env.DB, id);
    publishChatSystem(c, id, `${member.name}\u5DF2\u88AB\u79FB\u51FA\u7EC4\u5C40`, "member_removed", { userId: member.user_id });
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) });
  });
  app2.post("/api/group-sessions/:id/cancel", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const group = await loadGroup(c.env.DB, id, user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    if (!group.is_owner) return jsonError(c, "\u53EA\u6709\u53D1\u8D77\u4EBA\u53EF\u4EE5\u53D6\u6D88\u7EC4\u5C40", 401);
    if (!["recruiting", "full"].includes(group.status)) return jsonError(c, "\u5F53\u524D\u7EC4\u5C40\u4E0D\u80FD\u53D6\u6D88", 409);
    const cancelledAt = now();
    await c.env.DB.prepare(`
      UPDATE group_sessions SET status = 'cancelled', updated_at = ? WHERE id = ?
    `).bind(cancelledAt, id).run();
    publishChatSystem(c, id, "\u53D1\u8D77\u4EBA\u53D6\u6D88\u4E86\u672C\u6B21\u7EC4\u5C40", "group_cancelled");
    c.executionCtx.waitUntil(c.env.GROUP_CHAT.getByName(id).setRoomStatus(id, "readonly"));
    return c.json({ group: await loadGroup(c.env.DB, id, user.id) });
  });
  app2.post("/api/group-sessions/:id/start", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const group = await loadGroup(c.env.DB, id, user.id);
    if (!group) return jsonError(c, "\u7EC4\u5C40\u4E0D\u5B58\u5728", 404);
    if (!group.is_owner) return jsonError(c, "\u53EA\u6709\u53D1\u8D77\u4EBA\u53EF\u4EE5\u5F00\u59CB\u8BB0\u5206", 401);
    if (group.match_id) {
      const existingMatch = await getMatch(c.env.DB, group.match_id);
      if (existingMatch) return c.json({ group, match: existingMatch, adminToken: "" });
      return jsonError(c, "\u7EC4\u5C40\u5DF2\u5173\u8054\u724C\u5C40\uFF0C\u4F46\u724C\u5C40\u6570\u636E\u4E0D\u5B58\u5728", 409);
    }
    if (!["recruiting", "full"].includes(group.status)) return jsonError(c, "\u5F53\u524D\u7EC4\u5C40\u4E0D\u80FD\u5F00\u59CB", 409);
    const confirmed = group.members.filter((member) => member.status === "confirmed");
    if (confirmed.length !== 4) return jsonError(c, "\u9700\u8981\u6B63\u597D\u56DB\u4F4D\u5DF2\u786E\u8BA4\u6210\u5458\u624D\u80FD\u5F00\u59CB\u8BB0\u5206", 409);
    const body = await c.req.json().catch(() => null);
    const memberIds = Array.isArray(body?.memberIds) && body.memberIds.every((memberId) => typeof memberId === "string") ? body.memberIds.map((memberId) => memberId.trim()) : [];
    if (memberIds.length !== 4 || new Set(memberIds).size !== 4) {
      return jsonError(c, "\u8BF7\u4E3A\u4E1C\u3001\u5357\u3001\u897F\u3001\u5317\u5404\u5B89\u6392\u4E00\u4F4D\u73A9\u5BB6");
    }
    const confirmedById = new Map(confirmed.map((member) => [member.id, member]));
    if (memberIds.some((memberId) => !confirmedById.has(memberId))) return jsonError(c, "\u5EA7\u4F4D\u4E2D\u5305\u542B\u65E0\u6548\u6210\u5458");
    const ordered = memberIds.map((memberId) => confirmedById.get(memberId));
    const result = await createMatchFromParticipants(c.env.DB, user.id, ordered.map((member) => ({
      name: member.name,
      avatarSeed: member.avatar_seed,
      friendId: member.friend_id,
      userId: member.user_id
    })));
    const createdAt = now();
    const claimed = await c.env.DB.prepare(`
      UPDATE group_sessions SET status = 'active', match_id = ?, updated_at = ?
      WHERE id = ? AND match_id IS NULL AND status IN ('recruiting', 'full')
    `).bind(result.match.id, createdAt, id).run();
    if (Number(claimed.meta?.changes || 0) !== 1) {
      await c.env.DB.prepare("DELETE FROM matches WHERE id = ? AND owner_user_id = ?").bind(result.match.id, user.id).run();
      const latest = await loadGroup(c.env.DB, id, user.id);
      if (latest?.match_id) {
        const existingMatch = await getMatch(c.env.DB, latest.match_id);
        if (existingMatch) return c.json({ group: latest, match: existingMatch, adminToken: "" });
      }
      return jsonError(c, "\u724C\u5C40\u5DF2\u7531\u53E6\u4E00\u8BF7\u6C42\u521B\u5EFA\uFF0C\u8BF7\u5237\u65B0\u540E\u7EE7\u7EED", 409);
    }
    publishChatSystem(c, id, "\u724C\u5C40\u5DF2\u521B\u5EFA\uFF0C\u56DB\u4F4D\u724C\u53CB\u53EF\u4EE5\u5F00\u59CB\u8BB0\u5206\u4E86", "match_started", { matchId: result.match.id });
    return c.json({ group: await loadGroup(c.env.DB, id, user.id), match: result.match, adminToken: result.adminToken }, 201);
  });
}
__name(registerGroupRoutes, "registerGroupRoutes");

// worker/routes/lobbies.ts
var LOBBY_CAPACITY = 4;
var LOBBY_SEATS = [0, 1, 2, 3];
function lobbySeat(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < LOBBY_CAPACITY ? value : null;
}
__name(lobbySeat, "lobbySeat");
function firstFreeSeat(lobby) {
  const occupied = new Set(lobby.members.map((member) => member.seat).filter((seat) => seat !== null));
  return LOBBY_SEATS.find((seat) => !occupied.has(seat)) ?? null;
}
__name(firstFreeSeat, "firstFreeSeat");
async function loadLobby(db, idOrCode, viewerUserId) {
  const lobby = await db.prepare(`
    SELECT id, share_code, owner_user_id, status, match_id, created_at, updated_at
    FROM match_lobbies
    WHERE id = ? OR share_code = ?
    LIMIT 1
  `).bind(idOrCode, idOrCode.toUpperCase()).first();
  if (!lobby) return null;
  const membersResult = await db.prepare(`
    SELECT lm.id, lm.user_id, lm.friend_id, lm.name, lm.avatar_seed, lm.seat, lm.joined_at,
      COALESCE(u.avatar_url, linked.avatar_url, f.avatar_url) avatar_url,
      COALESCE(u.gender, linked.gender) gender
    FROM match_lobby_members lm
    LEFT JOIN users u ON u.id = lm.user_id
    LEFT JOIN friends f ON f.id = lm.friend_id
    LEFT JOIN users linked ON linked.id = f.linked_user_id
    WHERE lm.lobby_id = ?
    ORDER BY CASE WHEN lm.seat IS NULL THEN 4 ELSE lm.seat END ASC, lm.joined_at ASC, lm.id ASC
  `).bind(String(lobby.id)).all();
  const members = membersResult.results.map((row) => ({
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    friendId: row.friend_id ? String(row.friend_id) : null,
    name: String(row.name),
    avatarSeed: Number(row.avatar_seed),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    gender: row.gender === "male" || row.gender === "female" ? row.gender : null,
    seat: lobbySeat(row.seat),
    joinedAt: String(row.joined_at)
  }));
  return {
    id: String(lobby.id),
    shareCode: String(lobby.share_code),
    ownerUserId: String(lobby.owner_user_id),
    status: lobby.status,
    matchId: lobby.match_id ? String(lobby.match_id) : null,
    members,
    isOwner: String(lobby.owner_user_id) === viewerUserId,
    isMember: members.some((member) => member.userId === viewerUserId),
    createdAt: String(lobby.created_at),
    updatedAt: String(lobby.updated_at)
  };
}
__name(loadLobby, "loadLobby");
async function findLobby(c, viewerUserId) {
  return loadLobby(c.env.DB, c.req.param("id") || "", viewerUserId);
}
__name(findLobby, "findLobby");
async function insertLobby(db, lobbyId, ownerUserId, createdAt) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = shareCode();
    const inserted = await db.prepare(`
      INSERT OR IGNORE INTO match_lobbies(id, share_code, owner_user_id, status, created_at, updated_at)
      VALUES(?, ?, ?, 'preparing', ?, ?)
    `).bind(lobbyId, code, ownerUserId, createdAt, createdAt).run();
    if (Number(inserted.meta?.changes || 0) === 1) return code;
  }
  throw new Error("MATCH_LOBBY_CODE_EXHAUSTED");
}
__name(insertLobby, "insertLobby");
async function createOrFindFriend(db, ownerUserId, name, friendId, at) {
  if (friendId) {
    return db.prepare(`
      SELECT id, name, avatar_seed, linked_user_id FROM friends WHERE id = ? AND user_id = ?
    `).bind(friendId, ownerUserId).first();
  }
  const generatedId = uid();
  await db.prepare(`
    INSERT OR IGNORE INTO friends(id, user_id, name, avatar_seed, created_at, updated_at, last_played_at)
    VALUES(?, ?, ?, ?, ?, ?, NULL)
  `).bind(generatedId, ownerUserId, name, avatarSeed(name), at, at).run();
  return db.prepare(`
    SELECT id, name, avatar_seed, linked_user_id FROM friends
    WHERE user_id = ? AND name = ? COLLATE NOCASE LIMIT 1
  `).bind(ownerUserId, name).first();
}
__name(createOrFindFriend, "createOrFindFriend");
async function wechatAccessToken(c) {
  if (!c.env.WECHAT_APP_ID || !c.env.WECHAT_APP_SECRET) throw new Error("WECHAT_CONFIG_MISSING");
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", c.env.WECHAT_APP_ID);
  url.searchParams.set("secret", c.env.WECHAT_APP_SECRET);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`WECHAT_TOKEN_HTTP_${response.status}`);
  const text = await response.text();
  if (text.length > 4096) throw new Error("WECHAT_TOKEN_RESPONSE_TOO_LARGE");
  const payload = JSON.parse(text);
  if (!payload.access_token || payload.errcode) throw new Error(`WECHAT_TOKEN_${payload.errcode ?? "MISSING"}`);
  return payload.access_token;
}
__name(wechatAccessToken, "wechatAccessToken");
function registerLobbyRoutes(app2) {
  app2.post("/api/match-lobbies", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const createdAt = now();
    const lobbyId = uid();
    const code = await insertLobby(c.env.DB, lobbyId, user.id, createdAt);
    return c.json({
      lobby: {
        id: lobbyId,
        shareCode: code,
        ownerUserId: user.id,
        status: "preparing",
        matchId: null,
        members: [],
        isOwner: true,
        isMember: false,
        createdAt,
        updatedAt: createdAt
      }
    }, 201);
  });
  app2.get("/api/match-lobbies/:id", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const lobby = await findLobby(c, user.id);
    return lobby ? c.json({ lobby }) : jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728", 404);
  });
  app2.post("/api/match-lobbies/:id/join", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const lobby = await findLobby(c, user.id);
    if (!lobby) return jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728", 404);
    if (lobby.status !== "preparing") return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u5F00\u59CB\u6216\u5DF2\u5173\u95ED", 409);
    if (lobby.isMember) return c.json({ lobby });
    const body = await c.req.json().catch(() => null);
    const requestedSeat = lobbySeat(body?.seat);
    const linkedPlaceholder = await c.env.DB.prepare(`
      SELECT lm.id, lm.friend_id, lm.seat
      FROM match_lobby_members lm
      JOIN friends f ON f.id = lm.friend_id
      WHERE lm.lobby_id = ? AND f.user_id = ? AND f.linked_user_id = ?
      LIMIT 1
    `).bind(lobby.id, lobby.ownerUserId, user.id).first();
    const displayName2 = user.display_name?.trim() || user.username;
    const joinedAt = now();
    if (linkedPlaceholder) {
      const seat = lobbySeat(linkedPlaceholder.seat) ?? requestedSeat ?? firstFreeSeat(lobby);
      if (seat === null) return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u6EE1\u5458", 409);
      const occupied = lobby.members.find((member) => member.seat === seat && member.id !== linkedPlaceholder.id);
      if (occupied) return jsonError(c, "\u8FD9\u4E2A\u65B9\u4F4D\u521A\u88AB\u5360\u4E86\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u4F4D\u7F6E", 409);
      await c.env.DB.prepare(`
        UPDATE match_lobby_members SET user_id = ?, name = ?, avatar_seed = ?, seat = ?, updated_at = ? WHERE id = ?
      `).bind(user.id, displayName2, avatarSeed(displayName2), seat, joinedAt, linkedPlaceholder.id).run();
    } else {
      if (lobby.members.length >= LOBBY_CAPACITY) return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u6EE1\u5458", 409);
      const seat = requestedSeat ?? firstFreeSeat(lobby);
      if (seat === null) return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u6EE1\u5458", 409);
      if (lobby.members.some((member) => member.seat === seat)) return jsonError(c, "\u8FD9\u4E2A\u65B9\u4F4D\u521A\u88AB\u5360\u4E86\uFF0C\u8BF7\u9009\u62E9\u5176\u4ED6\u4F4D\u7F6E", 409);
      await c.env.DB.prepare(`
        INSERT INTO match_lobby_members(id, lobby_id, user_id, friend_id, name, avatar_seed, seat, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `).bind(uid(), lobby.id, user.id, displayName2, avatarSeed(displayName2), seat, joinedAt, joinedAt).run();
    }
    await c.env.DB.prepare("UPDATE match_lobbies SET updated_at = ? WHERE id = ?").bind(joinedAt, lobby.id).run();
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) });
  });
  app2.post("/api/match-lobbies/:id/members", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const lobby = await findLobby(c, user.id);
    if (!lobby) return jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728", 404);
    if (!lobby.isOwner) return jsonError(c, "\u53EA\u6709\u521B\u5EFA\u8005\u53EF\u4EE5\u6DFB\u52A0\u672C\u5730\u724C\u53CB", 401);
    if (lobby.status !== "preparing") return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u5F00\u59CB\u6216\u5DF2\u5173\u95ED", 409);
    if (lobby.members.length >= LOBBY_CAPACITY) return jsonError(c, "\u56DB\u4EBA\u5DF2\u9F50", 409);
    const body = await c.req.json().catch(() => null);
    const source = body?.source === "self" || body?.source === "friend" || body?.source === "guest" ? body.source : null;
    if (!source) return jsonError(c, "\u6DFB\u52A0\u65B9\u5F0F\u65E0\u6548");
    const seat = lobbySeat(body?.seat) ?? firstFreeSeat(lobby);
    if (seat === null) return jsonError(c, "\u56DB\u4EBA\u5DF2\u9F50", 409);
    const at = now();
    if (source === "self") {
      if (lobby.members.some((member) => member.userId === user.id)) return jsonError(c, "\u4F60\u5DF2\u7ECF\u5728\u724C\u684C\u4E0A", 409);
      if (lobby.members.some((member) => member.seat === seat)) return jsonError(c, "\u8FD9\u4E2A\u65B9\u4F4D\u5DF2\u7ECF\u6709\u4EBA\u4E86", 409);
      const displayName2 = user.display_name?.trim() || user.username;
      await c.env.DB.prepare(`
        INSERT INTO match_lobby_members(id, lobby_id, user_id, friend_id, name, avatar_seed, seat, joined_at, updated_at)
        VALUES(?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `).bind(uid(), lobby.id, user.id, displayName2, avatarSeed(displayName2), seat, at, at).run();
    } else {
      const friendId = typeof body?.friendId === "string" ? body.friendId.trim() : "";
      const rawName = typeof body?.name === "string" ? body.name.trim() : "";
      if (source === "friend" && !friendId) return jsonError(c, "\u8BF7\u9009\u62E9\u724C\u53CB");
      if (source === "guest" && (!rawName || rawName.length > 12 || /[\u0000-\u001f\u007f]/.test(rawName))) return jsonError(c, "\u724C\u53CB\u6635\u79F0\u9700\u4E3A 1\u201312 \u4E2A\u5B57\u7B26");
      const friend = await createOrFindFriend(c.env.DB, user.id, rawName, friendId || null, at);
      if (!friend) return jsonError(c, "\u724C\u53CB\u4E0D\u5B58\u5728", 404);
      const existingFriend = lobby.members.find((member) => member.friendId === friend.id);
      if (existingFriend) return jsonError(c, "\u8FD9\u4F4D\u724C\u53CB\u5DF2\u7ECF\u5728\u684C\u4E0A", 409);
      const linkedMember = friend.linked_user_id ? lobby.members.find((member) => member.userId === friend.linked_user_id) : null;
      const occupied = lobby.members.find((member) => member.seat === seat);
      if (occupied && occupied.id !== linkedMember?.id) return jsonError(c, "\u8FD9\u4E2A\u65B9\u4F4D\u5DF2\u7ECF\u6709\u4EBA\u4E86", 409);
      if (linkedMember) {
        await c.env.DB.prepare("UPDATE match_lobby_members SET friend_id = ?, seat = ?, updated_at = ? WHERE id = ?").bind(friend.id, seat, at, linkedMember.id).run();
      } else {
        await c.env.DB.prepare(`
          INSERT INTO match_lobby_members(id, lobby_id, user_id, friend_id, name, avatar_seed, seat, joined_at, updated_at)
          VALUES(?, ?, NULL, ?, ?, ?, ?, ?, ?)
        `).bind(uid(), lobby.id, friend.id, friend.name, Number(friend.avatar_seed), seat, at, at).run();
      }
    }
    await c.env.DB.prepare("UPDATE match_lobbies SET updated_at = ? WHERE id = ?").bind(at, lobby.id).run();
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) });
  });
  app2.delete("/api/match-lobbies/:id/members/:memberId", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const lobby = await findLobby(c, user.id);
    if (!lobby) return jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728", 404);
    if (lobby.status !== "preparing") return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u5F00\u59CB\u6216\u5DF2\u5173\u95ED", 409);
    const member = lobby.members.find((item) => item.id === c.req.param("memberId"));
    if (!member) return jsonError(c, "\u53C2\u4E0E\u8005\u4E0D\u5B58\u5728", 404);
    if (!lobby.isOwner && member.userId !== user.id) return jsonError(c, "\u6CA1\u6709\u6743\u9650\u79FB\u9664\u8BE5\u53C2\u4E0E\u8005", 401);
    await c.env.DB.prepare("DELETE FROM match_lobby_members WHERE id = ? AND lobby_id = ?").bind(member.id, lobby.id).run();
    const at = now();
    await c.env.DB.prepare("UPDATE match_lobbies SET updated_at = ? WHERE id = ?").bind(at, lobby.id).run();
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) });
  });
  app2.post("/api/match-lobbies/:id/cancel", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const lobby = await findLobby(c, user.id);
    if (!lobby) return jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728", 404);
    if (!lobby.isOwner) return jsonError(c, "\u53EA\u6709\u521B\u5EFA\u8005\u53EF\u4EE5\u5173\u95ED\u51C6\u5907\u684C", 401);
    if (lobby.status !== "preparing") return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u5F00\u59CB\u6216\u5DF2\u5173\u95ED", 409);
    const at = now();
    await c.env.DB.prepare("UPDATE match_lobbies SET status = 'cancelled', updated_at = ? WHERE id = ?").bind(at, lobby.id).run();
    return c.json({ lobby: await loadLobby(c.env.DB, lobby.id, user.id) });
  });
  app2.post("/api/match-lobbies/:id/start", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const lobby = await findLobby(c, user.id);
    if (!lobby) return jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728", 404);
    if (!lobby.isOwner) return jsonError(c, "\u53EA\u6709\u521B\u5EFA\u8005\u53EF\u4EE5\u5F00\u59CB\u724C\u5C40", 401);
    if (lobby.status === "started" && lobby.matchId) {
      const existingMatch = await getMatch(c.env.DB, lobby.matchId);
      if (existingMatch) return c.json({ lobby, match: existingMatch, adminToken: "" });
    }
    if (lobby.status !== "preparing") return jsonError(c, "\u8FD9\u684C\u5DF2\u7ECF\u5F00\u59CB\u6216\u5DF2\u5173\u95ED", 409);
    if (lobby.members.length !== LOBBY_CAPACITY) return jsonError(c, "\u9700\u8981\u6B63\u597D\u56DB\u4F4D\u53C2\u4E0E\u8005\u624D\u80FD\u5F00\u59CB\u724C\u5C40", 409);
    const ordered = [...lobby.members].sort((left, right) => (left.seat ?? 99) - (right.seat ?? 99));
    if (ordered.some((member, index) => member.seat !== index)) {
      return jsonError(c, "\u8BF7\u5148\u4E3A\u4E1C\u3001\u5357\u3001\u897F\u3001\u5317\u5404\u5B89\u6392\u4E00\u4F4D\u73A9\u5BB6");
    }
    const result = await createMatchFromParticipants(c.env.DB, user.id, ordered.map((member) => ({
      name: member.name,
      avatarSeed: member.avatarSeed,
      friendId: member.friendId,
      userId: member.userId
    })));
    const at = now();
    const claimed = await c.env.DB.prepare(`
      UPDATE match_lobbies SET status = 'started', match_id = ?, updated_at = ?
      WHERE id = ? AND status = 'preparing' AND match_id IS NULL
    `).bind(result.match.id, at, lobby.id).run();
    if (Number(claimed.meta?.changes || 0) !== 1) {
      await c.env.DB.prepare("DELETE FROM matches WHERE id = ? AND owner_user_id = ?").bind(result.match.id, user.id).run();
      const latest = await loadLobby(c.env.DB, lobby.id, user.id);
      if (latest?.matchId) {
        const existingMatch = await getMatch(c.env.DB, latest.matchId);
        if (existingMatch) return c.json({ lobby: latest, match: existingMatch, adminToken: "" });
      }
      return jsonError(c, "\u724C\u5C40\u5DF2\u7531\u53E6\u4E00\u8BF7\u6C42\u521B\u5EFA\uFF0C\u8BF7\u5237\u65B0\u540E\u7EE7\u7EED", 409);
    }
    return c.json({
      lobby: await loadLobby(c.env.DB, lobby.id, user.id),
      match: result.match,
      adminToken: result.adminToken
    }, 201);
  });
  app2.get("/api/match-lobbies/:id/qr", async (c) => {
    const idOrCode = c.req.param("id");
    const lobby = await c.env.DB.prepare(`
      SELECT share_code, status FROM match_lobbies WHERE id = ? OR share_code = ? LIMIT 1
    `).bind(idOrCode, idOrCode.toUpperCase()).first();
    if (!lobby || lobby.status !== "preparing") return jsonError(c, "\u51C6\u5907\u684C\u4E0D\u5B58\u5728\u6216\u5DF2\u5173\u95ED", 404);
    try {
      const token = await wechatAccessToken(c);
      const qrResponse = await fetch(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scene: `lobby_${lobby.share_code}`,
          page: "pages/index/index",
          check_path: false,
          width: 430
        })
      });
      const contentType = qrResponse.headers.get("content-type") || "";
      if (!qrResponse.ok || !contentType.startsWith("image/")) {
        const detail = await qrResponse.text();
        console.error(JSON.stringify({ event: "wechat_lobby_qr_failed", status: qrResponse.status, detail: detail.slice(0, 500) }));
        return jsonError(c, "\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u9080\u8BF7", 502);
      }
      return new Response(qrResponse.body, {
        headers: {
          "content-type": contentType,
          "cache-control": "private, max-age=300",
          "x-content-type-options": "nosniff"
        }
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "wechat_lobby_qr_failed", message: error instanceof Error ? error.message : String(error) }));
      return jsonError(c, "\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25\uFF0C\u8BF7\u4F7F\u7528\u5FAE\u4FE1\u9080\u8BF7", 502);
    }
  });
}
__name(registerLobbyRoutes, "registerLobbyRoutes");

// worker/routes/matches.ts
var inHandEventTypes = /* @__PURE__ */ new Set(["\u660E\u6760", "\u6697\u6760", "\u82B1\u6760", "\u88AB\u8DDF\u5708", "\u56DB\u98CE\u5F52\u4E00"]);
var northFourRetentionEvents = /* @__PURE__ */ new Set(["\u88AB\u8DDF\u5708", "\u82B1\u6760", "\u56DB\u98CE\u5F52\u4E00"]);
async function publishGroupMatchFinished(c, matchId) {
  const group = await c.env.DB.prepare("SELECT id FROM group_sessions WHERE match_id = ? LIMIT 1").bind(matchId).first();
  if (!group) return;
  c.executionCtx.waitUntil(
    c.env.GROUP_CHAT.getByName(group.id).publishSystem({
      roomId: group.id,
      content: "\u672C\u6B21\u724C\u5C40\u5DF2\u7ED3\u675F\uFF0C\u7FA4\u804A\u4ECD\u53EF\u7EE7\u7EED\u4F7F\u7528",
      eventType: "match_finished",
      payload: { matchId }
    }).catch((error) => {
      console.error(JSON.stringify({
        event: "group_chat_match_finished_failed",
        roomId: group.id,
        message: error instanceof Error ? error.message : String(error)
      }));
    })
  );
}
__name(publishGroupMatchFinished, "publishGroupMatchFinished");
function shouldRetainDealer(input, dealerPlayerId, isNorthFour, currentHandEventNotes) {
  if (input.type === "event") return true;
  if (input.type === "draw") return true;
  const outcomes = input.outcomes || [];
  if (outcomes.length > 1) return true;
  if (dealerPlayerId && outcomes.some((outcome) => outcome.winnerPlayerId === dealerPlayerId)) return true;
  if (outcomes.some((outcome) => bigHandPatterns(outcome.note).includes("\u5916\u5305"))) return true;
  if (!isNorthFour) return false;
  if (outcomes.some((outcome) => bigHandPatterns(outcome.note).length > 0)) return true;
  return currentHandEventNotes.some((note) => note !== null && northFourRetentionEvents.has(note));
}
__name(shouldRetainDealer, "shouldRetainDealer");
function responseOutcomes(input) {
  return (input.outcomes || []).map((outcome) => ({
    winner_player_id: outcome.winnerPlayerId,
    score: outcome.score,
    note: outcome.note ?? null,
    tile_record: outcome.tileRecord ?? null
  }));
}
__name(responseOutcomes, "responseOutcomes");
function replayInput(hand) {
  return {
    type: hand.result_type,
    winnerPlayerId: hand.winner_player_id ?? void 0,
    loserPlayerId: hand.loser_player_id ?? void 0,
    outcomes: hand.outcomes.map((outcome) => ({
      winnerPlayerId: outcome.winner_player_id,
      score: outcome.score,
      note: outcome.note ?? void 0,
      tileRecord: outcome.tile_record ?? void 0
    })),
    scores: hand.scores,
    note: hand.note ?? void 0,
    tileRecord: hand.tile_record ?? void 0
  };
}
__name(replayInput, "replayInput");
function replayMatchProgress(match2, replacement) {
  const playerBySeat = new Map(match2.players.map((player) => [player.seat, player.id]));
  const originalById = new Map(match2.hands.map((hand) => [hand.id, hand]));
  const ordered = match2.hands.map((hand) => hand.id === replacement.id ? replacement : hand).sort((first, second) => first.sequence - second.sequence);
  let wind = "east";
  let handNumber = 1;
  let finishedAt = null;
  const currentEventNotes = [];
  const positions = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const hand = ordered[index];
    if (finishedAt) {
      return { error: "\u4FEE\u6539\u540E\u724C\u5C40\u4F1A\u5728\u540E\u7EED\u8BB0\u5F55\u4E4B\u524D\u7ED3\u675F\uFF0C\u8BF7\u5148\u64A4\u9500\u53D7\u5F71\u54CD\u7684\u540E\u7EED\u8BB0\u5F55" };
    }
    positions.push({ id: hand.id, wind, handNumber });
    if (hand.result_type === "event") {
      currentEventNotes.push(hand.note);
      continue;
    }
    const isNorthFour = wind === "north" && handNumber === 4;
    const dealerPlayerId = playerBySeat.get(handNumber - 1);
    const retainDealer = shouldRetainDealer(replayInput(hand), dealerPlayerId, isNorthFour, currentEventNotes);
    currentEventNotes.length = 0;
    if (isNorthFour && !retainDealer) {
      finishedAt = hand.created_at;
      continue;
    }
    if (!retainDealer) {
      const next = nextPosition(wind, handNumber);
      wind = next.wind;
      handNumber = next.hand;
    }
  }
  const changedPositions = positions.filter((position) => {
    const original = originalById.get(position.id);
    return original && (original.wind !== position.wind || original.hand_number !== position.handNumber);
  });
  return {
    error: null,
    currentWind: wind,
    currentHand: handNumber,
    status: finishedAt ? "finished" : "active",
    finishedAt,
    changedPositions
  };
}
__name(replayMatchProgress, "replayMatchProgress");
async function existingHandMutation(db, matchId, requestKey) {
  const existing = await db.prepare("SELECT id FROM hands WHERE match_id = ? AND request_key = ? LIMIT 1").bind(matchId, requestKey).first();
  if (!existing) return null;
  const match2 = await getMatch(db, matchId);
  const hand = match2?.hands.find((item) => item.id === existing.id);
  if (!match2 || !hand) return null;
  return {
    hand,
    current_wind: match2.current_wind,
    current_hand: match2.current_hand,
    status: match2.status,
    finished_at: match2.finished_at
  };
}
__name(existingHandMutation, "existingHandMutation");
function handInputError(input, validPlayerIds) {
  if (new Set(input.scores.map((score) => score.playerId)).size !== 4 || input.scores.some((score) => !validPlayerIds.has(score.playerId))) {
    return "\u5FC5\u987B\u4E3A\u672C\u684C\u56DB\u4F4D\u73A9\u5BB6\u5404\u63D0\u4EA4\u4E00\u6761\u5206\u6570";
  }
  if (input.scores.reduce((sum, score) => sum + score.change, 0) !== 0) {
    return "\u56DB\u4EBA\u5206\u6570\u53D8\u5316\u4E4B\u548C\u5FC5\u987B\u4E3A 0";
  }
  const outcomes = input.outcomes || [];
  const winnerIds = outcomes.map((outcome) => outcome.winnerPlayerId);
  if ((input.type === "ron" || input.type === "tsumo") && !outcomes.length) return "\u80E1\u724C\u7ED3\u679C\u4E0D\u80FD\u4E3A\u7A7A";
  if (input.type !== "ron" && input.type !== "tsumo" && outcomes.length) return "\u5F53\u524D\u8BA1\u5206\u7C7B\u578B\u4E0D\u80FD\u5305\u542B\u80E1\u724C\u7ED3\u679C";
  if (new Set(winnerIds).size !== winnerIds.length || winnerIds.some((id) => !validPlayerIds.has(id))) return "\u80E1\u724C\u8005\u65E0\u6548";
  if (input.type === "event") {
    if (!input.winnerPlayerId || !validPlayerIds.has(input.winnerPlayerId)) return "\u5C40\u5185\u4E8B\u4EF6\u9700\u8981\u6307\u5B9A\u76F8\u5173\u73A9\u5BB6";
    if (!input.note || !inHandEventTypes.has(input.note)) return "\u5C40\u5185\u4E8B\u4EF6\u7C7B\u578B\u65E0\u6548";
    const eventPlayerScore = input.scores.find((item) => item.playerId === input.winnerPlayerId)?.change ?? 0;
    if (input.note === "\u88AB\u8DDF\u5708") {
      if (input.loserPlayerId) return "\u88AB\u8DDF\u5708\u4E0D\u9700\u8981\u6307\u5B9A\u5355\u72EC\u4ED8\u6B3E\u4EBA";
      const receiverScores = input.scores.filter((item) => item.playerId !== input.winnerPlayerId).map((item) => item.change);
      if (eventPlayerScore >= 0 || receiverScores.some((score) => score <= 0) || new Set(receiverScores).size !== 1 || -eventPlayerScore !== receiverScores.reduce((sum, score) => sum + score, 0)) {
        return "\u88AB\u8DDF\u5708\u8005\u5E94\u5411\u5176\u4F59\u4E09\u5BB6\u7B49\u989D\u652F\u4ED8";
      }
    } else if (input.note === "\u660E\u6760") {
      if (eventPlayerScore <= 0) return "\u660E\u6760\u8005\u83B7\u5206\u5FC5\u987B\u5927\u4E8E 0";
      if (!input.loserPlayerId || !validPlayerIds.has(input.loserPlayerId) || input.loserPlayerId === input.winnerPlayerId) {
        return "\u660E\u6760\u9700\u8981\u6307\u5B9A\u4E0D\u540C\u7684\u653E\u6760\u8005";
      }
      const loserScore = input.scores.find((item) => item.playerId === input.loserPlayerId)?.change ?? 0;
      if (loserScore !== -eventPlayerScore) return "\u660E\u6760\u53CC\u65B9\u5206\u6570\u4E0D\u4E00\u81F4";
      if (input.scores.some((item) => item.playerId !== input.winnerPlayerId && item.playerId !== input.loserPlayerId && item.change !== 0)) {
        return "\u660E\u6760\u53EA\u80FD\u7531\u653E\u6760\u8005\u652F\u4ED8";
      }
    } else {
      if (eventPlayerScore <= 0) return "\u5C40\u5185\u4E8B\u4EF6\u83B7\u5206\u5FC5\u987B\u5927\u4E8E 0";
      if (input.loserPlayerId) return "\u5F53\u524D\u5C40\u5185\u4E8B\u4EF6\u4E0D\u9700\u8981\u6307\u5B9A\u5355\u72EC\u4ED8\u6B3E\u4EBA";
      const payerScores = input.scores.filter((item) => item.playerId !== input.winnerPlayerId).map((item) => item.change);
      if (payerScores.some((score) => score >= 0) || new Set(payerScores).size !== 1 || eventPlayerScore !== -payerScores.reduce((sum, score) => sum + score, 0)) {
        return "\u5C40\u5185\u4E8B\u4EF6\u5E94\u7531\u5176\u4F59\u4E09\u5BB6\u7B49\u989D\u652F\u4ED8";
      }
    }
  }
  if (input.type === "draw") {
    if (input.winnerPlayerId || input.loserPlayerId || outcomes.length || input.scores.some((item) => item.change !== 0)) {
      return "\u6D41\u5C40\u4E0D\u80FD\u6307\u5B9A\u8F93\u8D62\u73A9\u5BB6\uFF0C\u56DB\u4EBA\u5206\u6570\u53D8\u5316\u5FC5\u987B\u4E3A 0";
    }
  }
  if (input.type === "tsumo") {
    if (outcomes.length !== 1 || input.loserPlayerId) return "\u81EA\u6478\u9700\u8981\u4E14\u53EA\u80FD\u6307\u5B9A\u4E00\u4F4D\u80E1\u724C\u8005";
    const winnerId = winnerIds[0];
    const winnerScore = input.scores.find((item) => item.playerId === winnerId)?.change ?? 0;
    const payerScores = input.scores.filter((item) => item.playerId !== winnerId).map((item) => item.change);
    if (winnerScore <= 0 || payerScores.some((score) => score >= 0) || new Set(payerScores).size !== 1 || winnerScore !== -payerScores.reduce((sum, score) => sum + score, 0)) {
      return "\u81EA\u6478\u5E94\u7531\u5176\u4F59\u4E09\u5BB6\u7B49\u989D\u652F\u4ED8";
    }
  }
  if (input.type === "ron") {
    if (!input.loserPlayerId || !validPlayerIds.has(input.loserPlayerId)) return "\u70B9\u70AE\u9700\u8981\u6307\u5B9A\u653E\u70AE\u8005";
    if (outcomes.length > 3 || winnerIds.includes(input.loserPlayerId)) return "\u80E1\u724C\u8005\u548C\u653E\u70AE\u8005\u4E0D\u80FD\u76F8\u540C";
  }
  const outcomeTotal = outcomes.reduce((sum, outcome) => sum + outcome.score, 0);
  for (const outcome of outcomes) {
    const score = input.scores.find((item) => item.playerId === outcome.winnerPlayerId)?.change;
    if (score !== outcome.score) return "\u80E1\u724C\u8005\u5F97\u5206\u4E0E\u8BA1\u5206\u660E\u7EC6\u4E0D\u4E00\u81F4";
    if (outcome.tileRecord && !bigHandPatterns(outcome.note).length) return "\u724C\u8C31\u53EA\u80FD\u8BB0\u5F55\u5728\u5E26\u5927\u80E1\u6807\u7B7E\u7684\u80E1\u724C\u7ED3\u679C\u4E2D";
  }
  if (input.type === "ron") {
    const loserScore = input.scores.find((item) => item.playerId === input.loserPlayerId)?.change;
    if (loserScore !== -outcomeTotal) return "\u653E\u70AE\u8005\u6263\u5206\u5FC5\u987B\u7B49\u4E8E\u6240\u6709\u80E1\u724C\u8005\u5F97\u5206\u4E4B\u548C";
    if (input.scores.some((item) => !winnerIds.includes(item.playerId) && item.playerId !== input.loserPlayerId && item.change !== 0)) {
      return "\u672A\u53C2\u4E0E\u80E1\u724C\u7684\u73A9\u5BB6\u5206\u6570\u5FC5\u987B\u4E3A 0";
    }
  }
  if (input.type === "tsumo" && input.scores.find((item) => item.playerId === winnerIds[0])?.change !== outcomeTotal) {
    return "\u81EA\u6478\u5F97\u5206\u4E0E\u8BA1\u5206\u660E\u7EC6\u4E0D\u4E00\u81F4";
  }
  return null;
}
__name(handInputError, "handInputError");
function registerMatchRoutes(app2) {
  app2.post("/api/matches", async (c) => {
    const startedAt = performance.now();
    const inputs = validatePlayers(await c.req.json().catch(() => null));
    if (!inputs) return jsonError(c, "\u8BF7\u8F93\u5165\u56DB\u4E2A\u4E0D\u91CD\u590D\u7684\u73A9\u5BB6\u59D3\u540D");
    const parsedAt = performance.now();
    const matchId = uid();
    const adminToken = randomHex(24);
    const createdAt = now();
    const user = await currentUser(c);
    const authenticatedAt = performance.now();
    let code = shareCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!await c.env.DB.prepare("SELECT 1 FROM matches WHERE share_code = ?").bind(code).first()) break;
      code = shareCode();
    }
    const resolved = inputs.map((input) => {
      if (!user) return { name: input.name, avatarSeed: avatarSeed(input.name), friendId: null, userId: null };
      if (input.isSelf) return { name: input.name, avatarSeed: avatarSeed(input.name), friendId: null, userId: user.id };
      return null;
    });
    if (user) {
      const friendStatements = [];
      const friendSelections = [];
      inputs.forEach((input, seat) => {
        if (input.isSelf) return;
        const generatedFriendId = uid();
        friendStatements.push(c.env.DB.prepare(`
          INSERT OR IGNORE INTO friends(id, user_id, name, avatar_seed, created_at, updated_at, last_played_at)
          VALUES(?, ?, ?, ?, ?, ?, ?)
        `).bind(
          generatedFriendId,
          user.id,
          input.name,
          avatarSeed(input.name),
          createdAt,
          createdAt,
          createdAt
        ));
        const resultIndex = friendStatements.length;
        friendStatements.push(c.env.DB.prepare(`
          SELECT id, name, avatar_seed
          FROM friends
          WHERE user_id = ? AND (id = ? OR name = ? COLLATE NOCASE)
          ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
          LIMIT 1
        `).bind(user.id, input.friendId ?? "", input.name, input.friendId ?? ""));
        friendSelections.push({ seat, resultIndex });
      });
      const friendResults = friendStatements.length ? await c.env.DB.batch(friendStatements) : [];
      for (const selection of friendSelections) {
        const friend = friendResults[selection.resultIndex].results[0];
        if (!friend) return jsonError(c, "\u4FDD\u5B58\u724C\u53CB\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", 500);
        resolved[selection.seat] = {
          name: friend.name,
          avatarSeed: Number(friend.avatar_seed),
          friendId: friend.id,
          userId: null
        };
      }
    }
    const friendsResolvedAt = performance.now();
    const players = resolved;
    const adminTokenHash = await sha2562(adminToken);
    await c.env.DB.batch([
      ...players.flatMap((player) => player.friendId ? [c.env.DB.prepare("UPDATE friends SET last_played_at = ?, updated_at = ? WHERE id = ?").bind(createdAt, createdAt, player.friendId)] : []),
      c.env.DB.prepare(`
        INSERT INTO matches(id, share_code, admin_token_hash, owner_user_id, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(matchId, code, adminTokenHash, user?.id ?? null, createdAt, createdAt),
      ...players.map((player, seat) => c.env.DB.prepare(`
        INSERT INTO players(id, match_id, name, avatar_seed, friend_id, user_id, seat, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(uid(), matchId, player.name, player.avatarSeed, player.friendId, player.userId, seat, createdAt))
    ]);
    const writtenAt = performance.now();
    const match2 = await getMatch(c.env.DB, matchId);
    const completedAt = performance.now();
    c.header("Server-Timing", [
      `parse;dur=${(parsedAt - startedAt).toFixed(1)}`,
      `auth;dur=${(authenticatedAt - parsedAt).toFixed(1)}`,
      `friends;dur=${(friendsResolvedAt - authenticatedAt).toFixed(1)}`,
      `write;dur=${(writtenAt - friendsResolvedAt).toFixed(1)}`,
      `match;dur=${(completedAt - writtenAt).toFixed(1)}`
    ].join(", "));
    return c.json({ match: match2, adminToken }, 201);
  });
  app2.get("/api/matches/:id", async (c) => {
    const startedAt = performance.now();
    const idOrCode = c.req.param("id");
    const includeStatistics = c.req.query("includeStatistics") === "1";
    const readOnly = c.req.query("readonly") === "1";
    let matchDuration = 0;
    let permissionDuration = 0;
    const matchRequest = getMatchBundle(c.env.DB, idOrCode, includeStatistics).finally(() => {
      matchDuration = performance.now() - startedAt;
    });
    const permissionStartedAt = performance.now();
    const permissionRequest = readOnly ? Promise.resolve(false) : canWrite(c, idOrCode).finally(() => {
      permissionDuration = performance.now() - permissionStartedAt;
    });
    const [result, editable] = await Promise.all([matchRequest, permissionRequest]);
    if (!result) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    c.header("Server-Timing", [
      `match;dur=${matchDuration.toFixed(1)}`,
      `permission;dur=${permissionDuration.toFixed(1)}`,
      `total;dur=${(performance.now() - startedAt).toFixed(1)}`
    ].join(", "));
    return c.json({ ...result, canEdit: editable });
  });
  app2.post("/api/matches/:id/claim", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const token = c.req.header("x-admin-token");
    if (!token) return jsonError(c, "\u7F3A\u5C11\u724C\u5C40\u7BA1\u7406\u5458\u4EE4\u724C", 401);
    const row = await c.env.DB.prepare(
      "SELECT owner_user_id, admin_token_hash FROM matches WHERE id = ?"
    ).bind(id).first();
    if (!row) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    if (row.owner_user_id && row.owner_user_id !== user.id) return jsonError(c, "\u8BE5\u724C\u5C40\u5DF2\u5C5E\u4E8E\u5176\u4ED6\u8D26\u53F7", 409);
    if (!safeEqual(row.admin_token_hash, await sha2562(token))) return jsonError(c, "\u724C\u5C40\u7BA1\u7406\u5458\u4EE4\u724C\u65E0\u6548", 401);
    await c.env.DB.prepare("UPDATE matches SET owner_user_id = ?, updated_at = ? WHERE id = ?").bind(user.id, now(), id).run();
    return c.json({ ok: true });
  });
  app2.post("/api/matches/:id/hands", async (c) => {
    const startedAt = performance.now();
    const id = c.req.param("id");
    if (!await canWrite(c, id)) return jsonError(c, "\u6CA1\u6709\u8BE5\u724C\u5C40\u7684\u4FEE\u6539\u6743\u9650", 401);
    const authorizedAt = performance.now();
    const input = validateHand(await c.req.json().catch(() => null));
    if (!input) return jsonError(c, "\u8BA1\u5206\u6570\u636E\u683C\u5F0F\u65E0\u6548");
    if (input.type === "custom") return jsonError(c, "\u81EA\u5B9A\u4E49\u8BA1\u5206\u5DF2\u505C\u7528\uFF0C\u8BF7\u4F7F\u7528\u81EA\u6478\u3001\u70B9\u70AE\u3001\u6D41\u5C40\u6216\u5C40\u5185\u4E8B\u4EF6");
    if (input.clientRequestId) {
      const existing = await existingHandMutation(c.env.DB, id, input.clientRequestId);
      if (existing) return c.json(existing, 201);
    }
    const [matchResult, playerResult, sequenceResult, currentHandEventsResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        "SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?"
      ).bind(id),
      c.env.DB.prepare("SELECT id, seat FROM players WHERE match_id = ?").bind(id),
      c.env.DB.prepare(
        "SELECT COALESCE(MAX(sequence), 0) + 1 next FROM hands WHERE match_id = ?"
      ).bind(id),
      c.env.DB.prepare(`
        SELECT note FROM hands
        WHERE match_id = ? AND result_type = 'event'
          AND sequence > COALESCE((
            SELECT MAX(sequence) FROM hands
            WHERE match_id = ? AND result_type <> 'event'
          ), 0)
        ORDER BY sequence ASC
      `).bind(id, id)
    ]);
    const match2 = matchResult.results[0];
    if (!match2) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    if (match2.status !== "active") return jsonError(c, "\u672C\u5C06\u5DF2\u7ECF\u7ED3\u675F", 409);
    const playerRows = playerResult;
    const validPlayerIds = new Set(playerRows.results.map((player) => player.id));
    const inputError = handInputError(input, validPlayerIds);
    if (inputError) return jsonError(c, inputError);
    const sequence = Number(sequenceResult.results[0]?.next ?? 1);
    const handId = uid();
    const isNorthFour = match2.current_wind === "north" && match2.current_hand === 4;
    const dealerPlayerId = playerRows.results.find((player) => Number(player.seat) === match2.current_hand - 1)?.id;
    const currentHandEventNotes = currentHandEventsResult.results.map((row) => row.note);
    const retainDealer = shouldRetainDealer(input, dealerPlayerId, isNorthFour, currentHandEventNotes);
    const finishesMatch = input.type !== "event" && isNorthFour && !retainDealer;
    const next = input.type === "event" || retainDealer || finishesMatch ? { wind: match2.current_wind, hand: match2.current_hand } : nextPosition(match2.current_wind, match2.current_hand);
    const createdAt = now();
    const nextStatus = finishesMatch ? "finished" : "active";
    const finishedAt = finishesMatch ? createdAt : null;
    const outcomes = responseOutcomes(input);
    const primaryOutcome = outcomes[0];
    const hand = {
      id: handId,
      sequence,
      wind: match2.current_wind,
      hand_number: match2.current_hand,
      result_type: input.type,
      winner_player_id: primaryOutcome?.winner_player_id ?? input.winnerPlayerId ?? null,
      loser_player_id: input.loserPlayerId ?? null,
      note: primaryOutcome?.note ?? input.note ?? null,
      tile_record: primaryOutcome?.tile_record ?? input.tileRecord ?? null,
      outcomes,
      scores: input.scores,
      created_at: createdAt
    };
    const preparedAt = performance.now();
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`
        INSERT INTO hands(id, match_id, sequence, wind, hand_number, result_type,
          winner_player_id, loser_player_id, note, tile_record, request_key, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
          hand.id,
          id,
          hand.sequence,
          hand.wind,
          hand.hand_number,
          hand.result_type,
          hand.winner_player_id,
          hand.loser_player_id,
          hand.note,
          hand.tile_record ? JSON.stringify(hand.tile_record) : null,
          input.clientRequestId ?? null,
          hand.created_at
        ),
        ...hand.scores.map((score) => c.env.DB.prepare(
          "INSERT INTO hand_scores(hand_id, player_id, score_change) VALUES(?, ?, ?)"
        ).bind(hand.id, score.playerId, score.change)),
        ...hand.outcomes.map((outcome, index) => c.env.DB.prepare(`
        INSERT INTO hand_outcomes(hand_id, winner_player_id, score_gain, note, tile_record, outcome_order)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(
          hand.id,
          outcome.winner_player_id,
          outcome.score,
          outcome.note,
          outcome.tile_record ? JSON.stringify(outcome.tile_record) : null,
          index
        )),
        c.env.DB.prepare(`
        UPDATE matches
        SET current_wind = ?, current_hand = ?, status = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(next.wind, next.hand, nextStatus, finishedAt, createdAt, id),
        ...finishesMatch ? [c.env.DB.prepare(`
          UPDATE group_sessions SET status = 'finished', updated_at = ?
          WHERE match_id = ? AND status = 'active'
        `).bind(createdAt, id)] : []
      ]);
    } catch (error) {
      if (input.clientRequestId) {
        const existing = await existingHandMutation(c.env.DB, id, input.clientRequestId);
        if (existing) return c.json(existing, 201);
      }
      throw error;
    }
    if (finishesMatch) await publishGroupMatchFinished(c, id);
    const completedAt = performance.now();
    c.header("Server-Timing", [
      `authorize;dur=${(authorizedAt - startedAt).toFixed(1)}`,
      `prepare;dur=${(preparedAt - authorizedAt).toFixed(1)}`,
      `write;dur=${(completedAt - preparedAt).toFixed(1)}`,
      `total;dur=${(completedAt - startedAt).toFixed(1)}`
    ].join(", "));
    const response = {
      hand,
      current_wind: next.wind,
      current_hand: next.hand,
      status: nextStatus,
      finished_at: finishedAt,
      retained_dealer: retainDealer
    };
    if (c.req.header("x-match-response") === "hand-delta-v1") return c.json(response, 201);
    return c.json({ ...response, match: await getMatch(c.env.DB, id) }, 201);
  });
  app2.put("/api/matches/:id/hands/:handId", async (c) => {
    const startedAt = performance.now();
    const id = c.req.param("id");
    const handId = c.req.param("handId");
    if (!await canWrite(c, id)) return jsonError(c, "\u6CA1\u6709\u8BE5\u724C\u5C40\u7684\u4FEE\u6539\u6743\u9650", 401);
    const authorizedAt = performance.now();
    const input = validateHand(await c.req.json().catch(() => null));
    if (!input) return jsonError(c, "\u8BA1\u5206\u6570\u636E\u683C\u5F0F\u65E0\u6548");
    if (input.type === "custom") return jsonError(c, "\u81EA\u5B9A\u4E49\u8BA1\u5206\u5DF2\u505C\u7528\uFF0C\u8BF7\u6539\u4E3A\u53D7\u652F\u6301\u7684\u8BA1\u5206\u7C7B\u578B");
    const [matchResult, handResult, playerResult] = await c.env.DB.batch([
      c.env.DB.prepare(
        "SELECT id, status, current_wind, current_hand FROM matches WHERE id = ?"
      ).bind(id),
      c.env.DB.prepare(`
        SELECT id, sequence, wind, hand_number, result_type, created_at
        FROM hands WHERE id = ? AND match_id = ?
      `).bind(handId, id),
      c.env.DB.prepare("SELECT id FROM players WHERE match_id = ?").bind(id)
    ]);
    const match2 = matchResult.results[0];
    if (!match2) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    if (match2.status !== "active") return jsonError(c, "\u672C\u5C06\u5DF2\u7ECF\u7ED3\u675F\uFF0C\u4E0D\u80FD\u518D\u4FEE\u6539\u8BA1\u5206", 409);
    const storedHand = handResult.results[0];
    if (!storedHand) return jsonError(c, "\u8BE5\u5C40\u8BB0\u5F55\u4E0D\u5B58\u5728", 404);
    if (storedHand.result_type === "event" !== (input.type === "event")) {
      return jsonError(c, "\u5C40\u5185\u4E8B\u4EF6\u548C\u672C\u5C40\u7ED3\u679C\u4E0D\u80FD\u4E92\u76F8\u8F6C\u6362");
    }
    const playerRows = playerResult;
    const validPlayerIds = new Set(playerRows.results.map((player) => player.id));
    const inputError = handInputError(input, validPlayerIds);
    if (inputError) return jsonError(c, inputError);
    const outcomes = responseOutcomes(input);
    const primaryOutcome = outcomes[0];
    const hand = {
      ...storedHand,
      result_type: input.type,
      winner_player_id: primaryOutcome?.winner_player_id ?? input.winnerPlayerId ?? null,
      loser_player_id: input.loserPlayerId ?? null,
      note: primaryOutcome?.note ?? input.note ?? null,
      tile_record: primaryOutcome?.tile_record ?? input.tileRecord ?? null,
      outcomes,
      scores: input.scores
    };
    const fullMatch = await getMatch(c.env.DB, id);
    if (!fullMatch) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    const replay = replayMatchProgress(fullMatch, hand);
    if (replay.error) return jsonError(c, replay.error, 409);
    const updatedAt = now();
    const preparedAt = performance.now();
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE hands
        SET result_type = ?, winner_player_id = ?, loser_player_id = ?, note = ?, tile_record = ?
        WHERE id = ? AND match_id = ?
      `).bind(
        hand.result_type,
        hand.winner_player_id,
        hand.loser_player_id,
        hand.note,
        hand.tile_record ? JSON.stringify(hand.tile_record) : null,
        hand.id,
        id
      ),
      c.env.DB.prepare("DELETE FROM hand_scores WHERE hand_id = ?").bind(hand.id),
      c.env.DB.prepare("DELETE FROM hand_outcomes WHERE hand_id = ?").bind(hand.id),
      ...hand.scores.map((score) => c.env.DB.prepare(
        "INSERT INTO hand_scores(hand_id, player_id, score_change) VALUES(?, ?, ?)"
      ).bind(hand.id, score.playerId, score.change)),
      ...hand.outcomes.map((outcome, index) => c.env.DB.prepare(`
        INSERT INTO hand_outcomes(hand_id, winner_player_id, score_gain, note, tile_record, outcome_order)
        VALUES(?, ?, ?, ?, ?, ?)
      `).bind(
        hand.id,
        outcome.winner_player_id,
        outcome.score,
        outcome.note,
        outcome.tile_record ? JSON.stringify(outcome.tile_record) : null,
        index
      )),
      ...replay.changedPositions.map((position) => c.env.DB.prepare(`
        UPDATE hands SET wind = ?, hand_number = ? WHERE id = ? AND match_id = ?
      `).bind(position.wind, position.handNumber, position.id, id)),
      c.env.DB.prepare(`
        UPDATE matches
        SET current_wind = ?, current_hand = ?, status = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(replay.currentWind, replay.currentHand, replay.status, replay.finishedAt, updatedAt, id),
      ...replay.status === "finished" ? [c.env.DB.prepare(`
        UPDATE group_sessions SET status = 'finished', updated_at = ?
        WHERE match_id = ? AND status = 'active'
      `).bind(updatedAt, id)] : []
    ]);
    if (replay.status === "finished") await publishGroupMatchFinished(c, id);
    const completedAt = performance.now();
    c.header("Server-Timing", [
      `authorize;dur=${(authorizedAt - startedAt).toFixed(1)}`,
      `prepare;dur=${(preparedAt - authorizedAt).toFixed(1)}`,
      `write;dur=${(completedAt - preparedAt).toFixed(1)}`,
      `total;dur=${(completedAt - startedAt).toFixed(1)}`
    ].join(", "));
    const response = {
      hand: {
        ...hand,
        wind: replay.changedPositions.find((position) => position.id === hand.id)?.wind ?? hand.wind,
        hand_number: replay.changedPositions.find((position) => position.id === hand.id)?.handNumber ?? hand.hand_number
      },
      current_wind: replay.currentWind,
      current_hand: replay.currentHand,
      status: replay.status,
      finished_at: replay.finishedAt,
      repositionedHands: replay.changedPositions.map((position) => ({ id: position.id, wind: position.wind, hand_number: position.handNumber }))
    };
    if (c.req.header("x-match-response") === "hand-delta-v1") return c.json(response);
    return c.json({ ...response, match: await getMatch(c.env.DB, id) });
  });
  app2.delete("/api/matches/:id/hands/last", async (c) => {
    const id = c.req.param("id");
    if (!await canWrite(c, id)) return jsonError(c, "\u6CA1\u6709\u8BE5\u724C\u5C40\u7684\u4FEE\u6539\u6743\u9650", 401);
    const match2 = await c.env.DB.prepare(
      "SELECT status FROM matches WHERE id = ?"
    ).bind(id).first();
    if (!match2) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    if (match2.status !== "active") return jsonError(c, "\u672C\u5C06\u5DF2\u7ECF\u7ED3\u675F\uFF0C\u4E0D\u80FD\u64A4\u9500\u8BB0\u5F55", 409);
    const last = await c.env.DB.prepare(`
      SELECT id, wind, hand_number FROM hands
      WHERE match_id = ? ORDER BY sequence DESC LIMIT 1
    `).bind(id).first();
    if (!last) return jsonError(c, "\u6682\u65E0\u53EF\u64A4\u9500\u7684\u8BB0\u5F55");
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM hands WHERE id = ?").bind(last.id),
      c.env.DB.prepare(
        "UPDATE matches SET current_wind = ?, current_hand = ?, updated_at = ? WHERE id = ?"
      ).bind(last.wind, last.hand_number, now(), id)
    ]);
    return c.json({ match: await getMatch(c.env.DB, id) });
  });
  app2.post("/api/matches/:id/finish", async (c) => {
    const id = c.req.param("id");
    if (!await canWrite(c, id)) return jsonError(c, "\u6CA1\u6709\u8BE5\u724C\u5C40\u7684\u4FEE\u6539\u6743\u9650", 401);
    const match2 = await c.env.DB.prepare(
      "SELECT status FROM matches WHERE id = ?"
    ).bind(id).first();
    if (!match2) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
    if (match2.status !== "active") return jsonError(c, "\u672C\u5C06\u5DF2\u7ECF\u7ED3\u675F", 409);
    const timestamp = now();
    await c.env.DB.batch([
      c.env.DB.prepare(`
        UPDATE matches SET status = 'finished', finished_at = ?, updated_at = ? WHERE id = ?
      `).bind(timestamp, timestamp, id),
      c.env.DB.prepare(`
        UPDATE group_sessions SET status = 'finished', updated_at = ?
        WHERE match_id = ? AND status = 'active'
      `).bind(timestamp, id)
    ]);
    await publishGroupMatchFinished(c, id);
    return c.json({ match: await getMatch(c.env.DB, id) });
  });
  app2.get("/api/matches/:id/statistics", async (c) => {
    const startedAt = performance.now();
    const stats = await getMatchStatistics(c.env.DB, c.req.param("id"));
    c.header("Server-Timing", `statistics;dur=${(performance.now() - startedAt).toFixed(1)}`);
    return stats ? c.json(stats) : jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728", 404);
  });
}
__name(registerMatchRoutes, "registerMatchRoutes");

// worker/relationship-statistics.ts
function splitPatterns(value) {
  return typeof value === "string" ? value.split("\u3001").map((item) => item.trim()).filter(Boolean) : [];
}
__name(splitPatterns, "splitPatterns");
function incrementPatterns(target, note) {
  for (const pattern of splitPatterns(note).filter((item) => recordedPatterns.has(item))) {
    target.set(pattern, (target.get(pattern) || 0) + 1);
  }
}
__name(incrementPatterns, "incrementPatterns");
function sortedPatterns(values) {
  return [...values.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}
__name(sortedPatterns, "sortedPatterns");
async function relationshipStatisticsForUser(db, currentUserId, currentPlayerName, targetUserId) {
  if (!targetUserId || targetUserId === currentUserId) return null;
  const [targetResult, rowsResult, trendResult] = await db.batch([
    db.prepare(`
      SELECT id, COALESCE(NULLIF(TRIM(display_name), ''), username) display_name, avatar_url, gender
      FROM users WHERE id = ?
    `).bind(targetUserId),
    db.prepare(`
      SELECT m.id match_id, h.id hand_id, h.result_type, h.loser_player_id,
        selfp.id self_player_id, targetp.id target_player_id,
        ho.winner_player_id outcome_winner_player_id,
        h.winner_player_id legacy_winner_player_id,
        ho.note outcome_note
      FROM matches m
      JOIN players selfp ON selfp.match_id = m.id AND (
        selfp.user_id = ? OR (
          m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
        )
      )
      JOIN players targetp ON targetp.match_id = m.id AND targetp.user_id = ?
      LEFT JOIN hands h ON h.match_id = m.id
      LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
      ORDER BY h.created_at ASC, ho.outcome_order ASC
    `).bind(currentUserId, currentUserId, currentPlayerName, targetUserId),
    db.prepare(`
      SELECT m.id match_id, m.created_at,
        COALESCE(SUM(hs.score_change), 0) score
      FROM matches m
      JOIN players selfp ON selfp.match_id = m.id AND (
        selfp.user_id = ? OR (
          m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
        )
      )
      JOIN players targetp ON targetp.match_id = m.id AND targetp.user_id = ?
      LEFT JOIN hand_scores hs ON hs.player_id = selfp.id
      GROUP BY m.id, m.created_at
      ORDER BY m.created_at ASC
    `).bind(currentUserId, currentUserId, currentPlayerName, targetUserId)
  ]);
  const target = targetResult.results[0];
  if (!target) return null;
  const rows = rowsResult.results;
  const trendRows = trendResult.results;
  if (!trendRows.length && !rows.some((row) => row.match_id)) return null;
  const handIds = /* @__PURE__ */ new Set();
  const targetWinHands = /* @__PURE__ */ new Set();
  const targetRonWinHands = /* @__PURE__ */ new Set();
  const targetTsumoWinHands = /* @__PURE__ */ new Set();
  const targetDealInHands = /* @__PURE__ */ new Set();
  const myWinHands = /* @__PURE__ */ new Set();
  const myDealInToTarget = /* @__PURE__ */ new Set();
  const targetDealInToMe = /* @__PURE__ */ new Set();
  const winPatterns = /* @__PURE__ */ new Map();
  const dealInPatterns = /* @__PURE__ */ new Map();
  const countedWinPatternOutcomes = /* @__PURE__ */ new Set();
  const countedDealPatternOutcomes = /* @__PURE__ */ new Set();
  for (const row of rows) {
    if (!row.hand_id || row.result_type === "event") continue;
    const handId = String(row.hand_id);
    handIds.add(handId);
    const selfPlayerId = String(row.self_player_id);
    const targetPlayerId = String(row.target_player_id);
    const outcomeWinnerId = row.outcome_winner_player_id ? String(row.outcome_winner_player_id) : "";
    const winnerId = outcomeWinnerId || (row.legacy_winner_player_id ? String(row.legacy_winner_player_id) : "");
    const loserId = row.loser_player_id ? String(row.loser_player_id) : "";
    if (winnerId === targetPlayerId) {
      targetWinHands.add(handId);
      if (row.result_type === "tsumo") targetTsumoWinHands.add(handId);
      if (row.result_type === "ron") targetRonWinHands.add(handId);
      const outcomeKey = `${handId}:${outcomeWinnerId || "legacy"}`;
      if (!countedWinPatternOutcomes.has(outcomeKey)) {
        countedWinPatternOutcomes.add(outcomeKey);
        incrementPatterns(winPatterns, row.outcome_note);
      }
    }
    if (winnerId === selfPlayerId) myWinHands.add(handId);
    if (row.result_type === "ron" && loserId === targetPlayerId) {
      targetDealInHands.add(handId);
      if (winnerId === selfPlayerId) targetDealInToMe.add(handId);
      const outcomeKey = `${handId}:${outcomeWinnerId || winnerId || "legacy"}`;
      if (!countedDealPatternOutcomes.has(outcomeKey)) {
        countedDealPatternOutcomes.add(outcomeKey);
        incrementPatterns(dealInPatterns, row.outcome_note);
      }
    }
    if (row.result_type === "ron" && loserId === selfPlayerId && winnerId === targetPlayerId) myDealInToTarget.add(handId);
  }
  const trend = trendRows.map((row) => ({
    matchId: String(row.match_id),
    createdAt: String(row.created_at),
    score: Number(row.score ?? 0)
  }));
  const netScore = trend.reduce((total, point) => total + point.score, 0);
  const lastPlayedAt = trend.length ? trend[trend.length - 1].createdAt : null;
  const displayName2 = String(target.display_name);
  const gender = target.gender === "male" || target.gender === "female" ? target.gender : null;
  return {
    friend: {
      id: `wechat:${targetUserId}`,
      source: "wechat",
      name: displayName2,
      avatar_seed: 0,
      linkedUserId: targetUserId,
      wechatName: displayName2,
      wechatAvatarUrl: target.avatar_url ? String(target.avatar_url) : null,
      wechatGender: gender,
      jointMatches: trend.length,
      netScore,
      gangKaiWins: winPatterns.get("\u6760\u5F00") || 0,
      gangKaiAgainst: dealInPatterns.get("\u6760\u5F00") || 0,
      lastPlayedAt
    },
    totalHands: handIds.size,
    wins: targetWinHands.size,
    ronWins: targetRonWinHands.size,
    tsumoWins: targetTsumoWinHands.size,
    dealIns: targetDealInHands.size,
    winPatterns: sortedPatterns(winPatterns),
    dealInPatterns: sortedPatterns(dealInPatterns),
    myWins: myWinHands.size,
    friendWins: targetWinHands.size,
    myDealInsToFriend: myDealInToTarget.size,
    friendDealInsToMe: targetDealInToMe.size,
    netScore,
    trend
  };
}
__name(relationshipStatisticsForUser, "relationshipStatisticsForUser");

// worker/routes/me.ts
var FRIEND_AVATAR_CONTENT_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var MAX_FRIEND_AVATAR_BYTES = 512 * 1024;
function registerMeRoutes(app2) {
  app2.get("/api/me/users/:id/statistics", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const statistics = await relationshipStatisticsForUser(c.env.DB, user.id, user.display_name?.trim() || user.username, c.req.param("id"));
    return statistics ? c.json(statistics) : jsonError(c, "\u6CA1\u6709\u627E\u5230\u5171\u540C\u724C\u5C40", 404);
  });
  app2.get("/api/me/matches", async (c) => {
    const startedAt = performance.now();
    const user = await currentUser(c);
    const authenticatedAt = performance.now();
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const requestedLimit = Number(c.req.query("limit") || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.round(requestedLimit))) : 100;
    const playerName = user.display_name?.trim() || user.username;
    const result = await c.env.DB.prepare(`
      WITH visible_matches AS (
        SELECT m.id, m.share_code, m.status, m.current_wind, m.current_hand, m.created_at, m.updated_at, m.finished_at, m.owner_user_id
        FROM matches m
        WHERE m.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM players visible_player WHERE visible_player.match_id = m.id AND visible_player.user_id = ?
        )
        ORDER BY m.created_at DESC
        LIMIT ?
      ),
      hand_counts AS (
        SELECT h.match_id, COUNT(*) hand_count
        FROM hands h
        JOIN visible_matches m ON m.id = h.match_id
        WHERE h.result_type <> 'event'
        GROUP BY h.match_id
      ),
      player_names AS (
        SELECT p.match_id, GROUP_CONCAT(p.name) player_names
        FROM players p
        JOIN visible_matches m ON m.id = p.match_id
        GROUP BY p.match_id
      ),
      self_scores AS (
        SELECT p.match_id, COALESCE(SUM(hs.score_change), 0) self_score
        FROM players p
        JOIN visible_matches m ON m.id = p.match_id
        LEFT JOIN hand_scores hs ON hs.player_id = p.id
        WHERE p.user_id = ? OR (
          p.user_id IS NULL AND p.friend_id IS NULL AND m.owner_user_id = ? AND p.name = ? COLLATE NOCASE
        )
        GROUP BY p.match_id
      )
      SELECT m.id, m.share_code, m.status, m.current_wind, m.current_hand,
             CASE WHEN m.owner_user_id = ? THEN 1 ELSE 0 END is_owner,
             m.created_at, m.updated_at, m.finished_at,
             COALESCE(h.hand_count, 0) hand_count,
             COALESCE(s.self_score, 0) self_score,
             COALESCE(p.player_names, '') player_names
      FROM visible_matches m
      LEFT JOIN hand_counts h ON h.match_id = m.id
      LEFT JOIN player_names p ON p.match_id = m.id
      LEFT JOIN self_scores s ON s.match_id = m.id
      ORDER BY m.created_at DESC
    `).bind(user.id, user.id, limit, user.id, user.id, playerName, user.id).all();
    const queriedAt = performance.now();
    const matches = result.results.map((row) => ({
      id: String(row.id),
      share_code: String(row.share_code),
      status: row.status,
      is_owner: Number(row.is_owner ?? 0) === 1,
      current_wind: row.current_wind,
      current_hand: Number(row.current_hand),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      finished_at: row.finished_at ? String(row.finished_at) : null,
      hand_count: Number(row.hand_count ?? 0),
      self_score: Number(row.self_score ?? 0),
      player_names: typeof row.player_names === "string" ? row.player_names.split(",") : []
    }));
    const mappedAt = performance.now();
    c.header("Server-Timing", [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`
    ].join(", "));
    return c.json({ matches });
  });
  app2.delete("/api/me/matches/:id", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const id = c.req.param("id");
    const owned = await c.env.DB.prepare(
      "SELECT id FROM matches WHERE id = ? AND owner_user_id = ?"
    ).bind(id, user.id).first();
    if (!owned) return jsonError(c, "\u724C\u5C40\u4E0D\u5B58\u5728\u6216\u65E0\u6743\u5220\u9664", 404);
    await c.env.DB.prepare("DELETE FROM matches WHERE id = ?").bind(id).run();
    return c.json({ ok: true });
  });
  app2.get("/api/me/friends", async (c) => {
    const startedAt = performance.now();
    const user = await currentUser(c);
    const authenticatedAt = performance.now();
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const summaryOnly = c.req.query("summary") === "1";
    const playerName = user.display_name?.trim() || user.username;
    const result = summaryOnly ? await c.env.DB.prepare(`
          WITH visible_matches AS (
            SELECT m.id, m.created_at
            FROM matches m
            WHERE m.owner_user_id = ? OR EXISTS (
              SELECT 1 FROM players selfp WHERE selfp.match_id = m.id AND selfp.user_id = ?
            )
          )
          SELECT f.id, f.name, f.avatar_seed, f.note, f.avatar_url, f.linked_user_id,
            COALESCE(NULLIF(TRIM(lu.display_name), ''), lu.username) wechat_name,
            lu.avatar_url wechat_avatar_url, lu.gender wechat_gender,
            COALESCE(MAX(CASE WHEN p.id IS NOT NULL THEN m.created_at END), f.last_played_at) last_played_at,
            COUNT(DISTINCT CASE WHEN m.id IS NOT NULL THEN p.match_id END) joint_matches,
            0 gang_kai_wins,
            0 gang_kai_against
          FROM friends f
          LEFT JOIN users lu ON lu.id = f.linked_user_id
          LEFT JOIN players p ON (
            p.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND p.user_id = f.linked_user_id)
          )
          LEFT JOIN visible_matches m ON m.id = p.match_id
          WHERE f.user_id = ?
          GROUP BY f.id
          ORDER BY last_played_at DESC, f.updated_at DESC, f.name ASC
          LIMIT 100
        `).bind(user.id, user.id, user.id).all() : await c.env.DB.prepare(`
          WITH visible_matches AS (
            SELECT m.id, m.created_at
            FROM matches m
            WHERE m.owner_user_id = ? OR EXISTS (
              SELECT 1 FROM players selfp WHERE selfp.match_id = m.id AND selfp.user_id = ?
            )
          )
          SELECT f.id, f.name, f.avatar_seed, f.note, f.avatar_url, f.linked_user_id,
            COALESCE(NULLIF(TRIM(lu.display_name), ''), lu.username) wechat_name,
            lu.avatar_url wechat_avatar_url, lu.gender wechat_gender,
            COALESCE(MAX(CASE WHEN p.id IS NOT NULL THEN m.created_at END), f.last_played_at) last_played_at,
            COUNT(DISTINCT CASE WHEN m.id IS NOT NULL THEN p.match_id END) joint_matches,
            SUM(CASE WHEN m.id IS NOT NULL AND p.id IS NOT NULL AND EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id AND INSTR(COALESCE(ho.note, ''), '\u6760\u5F00') > 0
            ) THEN 1 ELSE 0 END) gang_kai_wins,
            SUM(CASE WHEN m.id IS NOT NULL AND p.id IS NOT NULL AND h.result_type = 'ron' AND h.loser_player_id = p.id AND EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND INSTR(COALESCE(ho.note, ''), '\u6760\u5F00') > 0
            ) THEN 1 ELSE 0 END) gang_kai_against
          FROM friends f
          LEFT JOIN users lu ON lu.id = f.linked_user_id
          LEFT JOIN players p ON (
            p.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND p.user_id = f.linked_user_id)
          )
          LEFT JOIN visible_matches m ON m.id = p.match_id
          LEFT JOIN hands h ON h.match_id = m.id
          WHERE f.user_id = ?
          GROUP BY f.id
          ORDER BY last_played_at DESC, f.updated_at DESC, f.name ASC
          LIMIT 100
        `).bind(user.id, user.id, user.id).all();
    const wechatResult = await c.env.DB.prepare(`
      WITH shared_wechat_users AS (
        SELECT targetp.user_id target_user_id,
          COUNT(DISTINCT m.id) joint_matches,
          MAX(m.created_at) last_played_at
        FROM matches m
        JOIN players selfp ON selfp.match_id = m.id AND (
          selfp.user_id = ? OR (
            m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
          )
        )
        JOIN players targetp ON targetp.match_id = m.id
          AND targetp.user_id IS NOT NULL AND targetp.user_id <> ?
        WHERE NOT EXISTS (
          SELECT 1 FROM friends linked
          WHERE linked.user_id = ? AND linked.linked_user_id = targetp.user_id
        )
        GROUP BY targetp.user_id
      )
      SELECT u.id user_id,
        COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) display_name,
        u.avatar_url, u.gender, shared.joint_matches, shared.last_played_at
      FROM shared_wechat_users shared
      JOIN users u ON u.id = shared.target_user_id
      ORDER BY shared.last_played_at DESC
      LIMIT 100
    `).bind(user.id, user.id, playerName, user.id, user.id).all();
    const [manualNetResult, wechatNetResult, manualWinResult, wechatWinResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        WITH shared_matches AS (
          SELECT DISTINCT f.id friend_id, m.id match_id, selfp.id self_player_id
          FROM friends f
          JOIN players targetp ON (
            targetp.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND targetp.user_id = f.linked_user_id)
          )
          JOIN matches m ON m.id = targetp.match_id
          JOIN players selfp ON selfp.match_id = m.id AND (
            selfp.user_id = ? OR (
              m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
            )
          )
          WHERE f.user_id = ?
        )
        SELECT sm.friend_id, COALESCE(SUM(hs.score_change), 0) net_score
        FROM shared_matches sm
        LEFT JOIN hand_scores hs ON hs.player_id = sm.self_player_id
        GROUP BY sm.friend_id
      `).bind(user.id, user.id, playerName, user.id),
      c.env.DB.prepare(`
        WITH shared_matches AS (
          SELECT DISTINCT targetp.user_id target_user_id, m.id match_id, selfp.id self_player_id
          FROM matches m
          JOIN players selfp ON selfp.match_id = m.id AND (
            selfp.user_id = ? OR (
              m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
            )
          )
          JOIN players targetp ON targetp.match_id = m.id
            AND targetp.user_id IS NOT NULL AND targetp.user_id <> ?
          WHERE NOT EXISTS (
            SELECT 1 FROM friends linked
            WHERE linked.user_id = ? AND linked.linked_user_id = targetp.user_id
          )
        )
        SELECT sm.target_user_id, COALESCE(SUM(hs.score_change), 0) net_score
        FROM shared_matches sm
        LEFT JOIN hand_scores hs ON hs.player_id = sm.self_player_id
        GROUP BY sm.target_user_id
      `).bind(user.id, user.id, playerName, user.id, user.id),
      c.env.DB.prepare(`
        WITH shared_players AS (
          SELECT DISTINCT f.id friend_id, m.id match_id, targetp.id target_player_id
          FROM friends f
          JOIN players targetp ON (
            targetp.friend_id = f.id OR (f.linked_user_id IS NOT NULL AND targetp.user_id = f.linked_user_id)
          )
          JOIN matches m ON m.id = targetp.match_id
          WHERE f.user_id = ? AND EXISTS (
            SELECT 1 FROM players selfp WHERE selfp.match_id = m.id AND (
              selfp.user_id = ? OR (
                m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
              )
            )
          )
        )
        SELECT sp.friend_id,
          COUNT(DISTINCT h.id) total_hands,
          COUNT(DISTINCT CASE WHEN ho.winner_player_id = sp.target_player_id THEN h.id END) wins
        FROM shared_players sp
        JOIN hands h ON h.match_id = sp.match_id AND h.result_type <> 'event'
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        GROUP BY sp.friend_id
      `).bind(user.id, user.id, user.id, playerName),
      c.env.DB.prepare(`
        WITH shared_players AS (
          SELECT DISTINCT targetp.user_id target_user_id, m.id match_id, targetp.id target_player_id
          FROM matches m
          JOIN players targetp ON targetp.match_id = m.id
            AND targetp.user_id IS NOT NULL AND targetp.user_id <> ?
          WHERE EXISTS (
            SELECT 1 FROM players selfp WHERE selfp.match_id = m.id AND (
              selfp.user_id = ? OR (
                m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
              )
            )
          ) AND NOT EXISTS (
            SELECT 1 FROM friends linked
            WHERE linked.user_id = ? AND linked.linked_user_id = targetp.user_id
          )
        )
        SELECT sp.target_user_id,
          COUNT(DISTINCT h.id) total_hands,
          COUNT(DISTINCT CASE WHEN ho.winner_player_id = sp.target_player_id THEN h.id END) wins
        FROM shared_players sp
        JOIN hands h ON h.match_id = sp.match_id AND h.result_type <> 'event'
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        GROUP BY sp.target_user_id
      `).bind(user.id, user.id, user.id, playerName, user.id)
    ]);
    const manualNetByFriend = new Map(
      manualNetResult.results.map((row) => [String(row.friend_id), Number(row.net_score ?? 0)])
    );
    const wechatNetByUser = new Map(
      wechatNetResult.results.map((row) => [String(row.target_user_id), Number(row.net_score ?? 0)])
    );
    const manualWinRateByFriend = new Map(
      manualWinResult.results.map((row) => {
        const totalHands = Number(row.total_hands ?? 0);
        return [String(row.friend_id), totalHands ? Number(row.wins ?? 0) / totalHands : 0];
      })
    );
    const wechatWinRateByUser = new Map(
      wechatWinResult.results.map((row) => {
        const totalHands = Number(row.total_hands ?? 0);
        return [String(row.target_user_id), totalHands ? Number(row.wins ?? 0) / totalHands : 0];
      })
    );
    const queriedAt = performance.now();
    const manualFriends = result.results.map((row) => ({
      id: String(row.id),
      source: "manual",
      name: String(row.name),
      avatar_seed: Number(row.avatar_seed),
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      note: row.note ? String(row.note) : null,
      linkedUserId: row.linked_user_id ? String(row.linked_user_id) : null,
      wechatName: row.wechat_name ? String(row.wechat_name) : null,
      wechatAvatarUrl: row.wechat_avatar_url ? String(row.wechat_avatar_url) : null,
      wechatGender: row.wechat_gender === "male" || row.wechat_gender === "female" ? row.wechat_gender : null,
      jointMatches: Number(row.joint_matches ?? 0),
      winRate: manualWinRateByFriend.get(String(row.id)) ?? 0,
      netScore: manualNetByFriend.get(String(row.id)) ?? 0,
      gangKaiWins: Number(row.gang_kai_wins ?? 0),
      gangKaiAgainst: Number(row.gang_kai_against ?? 0),
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null
    }));
    const wechatFriends = wechatResult.results.map((row) => ({
      id: `wechat:${String(row.user_id)}`,
      source: "wechat",
      name: String(row.display_name),
      avatar_seed: 0,
      linkedUserId: String(row.user_id),
      wechatName: String(row.display_name),
      wechatAvatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      wechatGender: row.gender === "male" || row.gender === "female" ? row.gender : null,
      jointMatches: Number(row.joint_matches ?? 0),
      winRate: wechatWinRateByUser.get(String(row.user_id)) ?? 0,
      netScore: wechatNetByUser.get(String(row.user_id)) ?? 0,
      gangKaiWins: 0,
      gangKaiAgainst: 0,
      lastPlayedAt: row.last_played_at ? String(row.last_played_at) : null
    }));
    const friends = [...manualFriends, ...wechatFriends].sort((left, right) => (right.lastPlayedAt ? Date.parse(right.lastPlayedAt) : 0) - (left.lastPlayedAt ? Date.parse(left.lastPlayedAt) : 0) || right.jointMatches - left.jointMatches).slice(0, 100);
    const mappedAt = performance.now();
    c.header("Server-Timing", [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`
    ].join(", "));
    return c.json({ friends });
  });
  app2.post("/api/me/friends", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const body = await c.req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const note = typeof body?.note === "string" ? body.note.trim() : "";
    if (!name || name.length > 12 || /[\u0000-\u001f\u007f]/.test(name)) return jsonError(c, "\u724C\u53CB\u6635\u79F0\u9700\u4E3A 1\u201312 \u4E2A\u5B57\u7B26");
    if (note.length > 30 || /[\u0000-\u001f\u007f]/.test(note)) return jsonError(c, "\u5907\u6CE8\u6700\u591A 30 \u4E2A\u5B57\u7B26");
    const duplicate = await c.env.DB.prepare("SELECT id FROM friends WHERE user_id = ? AND name = ? COLLATE NOCASE").bind(user.id, name).first();
    if (duplicate) return jsonError(c, "\u8FD9\u4E2A\u724C\u53CB\u5DF2\u7ECF\u5B58\u5728");
    const id = uid();
    const createdAt = now();
    await c.env.DB.prepare(`
      INSERT INTO friends(id, user_id, name, avatar_seed, note, avatar_url, created_at, updated_at, last_played_at)
      VALUES(?, ?, ?, ?, ?, NULL, ?, ?, NULL)
    `).bind(id, user.id, name, avatarSeed(name), note || null, createdAt, createdAt).run();
    const friend = {
      id,
      source: "manual",
      name,
      avatar_seed: avatarSeed(name),
      avatarUrl: null,
      note: note || null,
      linkedUserId: null,
      wechatName: null,
      wechatAvatarUrl: null,
      wechatGender: null,
      jointMatches: 0,
      winRate: 0,
      netScore: 0,
      gangKaiWins: 0,
      gangKaiAgainst: 0,
      lastPlayedAt: null
    };
    return c.json({ friend }, 201);
  });
  app2.post("/api/me/friends/:id/avatar", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const friendId = c.req.param("id");
    const owned = await c.env.DB.prepare("SELECT id FROM friends WHERE id = ? AND user_id = ?").bind(friendId, user.id).first();
    if (!owned) return jsonError(c, "\u724C\u53CB\u4E0D\u5B58\u5728", 404);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError(c, "\u8BF7\u9009\u62E9\u5934\u50CF\u56FE\u7247");
    if (!FRIEND_AVATAR_CONTENT_TYPES.has(file.type)) return jsonError(c, "\u5934\u50CF\u4EC5\u652F\u6301 JPG\u3001PNG \u6216 WebP");
    if (!file.size || file.size > MAX_FRIEND_AVATAR_BYTES) return jsonError(c, "\u5934\u50CF\u538B\u7F29\u540E\u9700\u5C0F\u4E8E 512KB");
    const content = await file.arrayBuffer();
    const updatedAt = now();
    const etag = crypto.randomUUID().replace(/-/g, "");
    await c.env.DB.prepare(`
      INSERT INTO friend_avatars(friend_id, content_type, content, etag, updated_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(friend_id) DO UPDATE SET
        content_type = excluded.content_type,
        content = excluded.content,
        etag = excluded.etag,
        updated_at = excluded.updated_at
    `).bind(friendId, file.type, content, etag, updatedAt).run();
    const avatarUrl = `/assets/friend-avatar/${encodeURIComponent(friendId)}?v=${Date.now().toString(36)}`;
    await c.env.DB.prepare("UPDATE friends SET avatar_url = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(avatarUrl, updatedAt, friendId, user.id).run();
    return c.json({ avatarUrl });
  });
  app2.get("/assets/friend-avatar/:friendId", async (c) => {
    const friendId = c.req.param("friendId");
    if (!friendId || friendId.length > 100 || friendId.includes("/") || friendId.includes("..")) return jsonError(c, "\u5934\u50CF\u4E0D\u5B58\u5728", 404);
    const avatar = await c.env.DB.prepare("SELECT content_type, content, etag FROM friend_avatars WHERE friend_id = ?").bind(friendId).first();
    if (!avatar) return jsonError(c, "\u5934\u50CF\u4E0D\u5B58\u5728", 404);
    const quotedEtag = `"${avatar.etag}"`;
    if (c.req.header("if-none-match") === quotedEtag) return new Response(null, { status: 304, headers: { etag: quotedEtag } });
    return new Response(new Uint8Array(avatar.content), {
      headers: {
        "content-type": avatar.content_type,
        "cache-control": "public, max-age=31536000, immutable",
        "etag": quotedEtag,
        "x-content-type-options": "nosniff"
      }
    });
  });
  app2.get("/api/me/friends/:id/statistics", async (c) => {
    const startedAt = performance.now();
    const user = await currentUser(c);
    const authenticatedAt = performance.now();
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const friendId = c.req.param("id");
    const playerName = user.display_name?.trim() || user.username;
    const [friendResult, rowsResult, relationResult, trendResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT f.id, f.name, f.avatar_seed, f.note, f.avatar_url, f.linked_user_id, f.last_played_at,
          COALESCE(NULLIF(TRIM(u.display_name), ''), u.username) wechat_name,
          u.avatar_url wechat_avatar_url, u.gender wechat_gender
        FROM friends f
        LEFT JOIN users u ON u.id = f.linked_user_id
        WHERE f.id = ? AND f.user_id = ?
      `).bind(friendId, user.id),
      c.env.DB.prepare(`
        SELECT p.id player_id, p.match_id, h.id hand_id, h.result_type,
          h.loser_player_id, ho.winner_player_id outcome_winner_player_id, ho.note outcome_note
        FROM players p
        JOIN matches m ON m.id = p.match_id
        LEFT JOIN hands h ON h.match_id = p.match_id
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        WHERE (p.friend_id = ? OR p.user_id = (
          SELECT linked_user_id FROM friends WHERE id = ? AND user_id = ?
        )) AND EXISTS (
          SELECT 1 FROM players selfp
          WHERE selfp.match_id = m.id AND (
            selfp.user_id = ? OR (
              m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
            )
          )
        )
        ORDER BY h.created_at ASC, ho.outcome_order ASC
      `).bind(friendId, friendId, user.id, user.id, user.id, playerName),
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.result_type, h.loser_player_id,
          selfp.id self_player_id, friendp.id friend_player_id,
          ho.winner_player_id outcome_winner_player_id,
          h.winner_player_id legacy_winner_player_id
        FROM matches m
        JOIN players selfp ON selfp.match_id = m.id AND (
          selfp.user_id = ? OR (
            m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
          )
        )
        JOIN players friendp ON friendp.match_id = m.id AND (
          friendp.friend_id = ? OR friendp.user_id = (
            SELECT linked_user_id FROM friends WHERE id = ? AND user_id = ?
          )
        )
        JOIN hands h ON h.match_id = m.id AND h.result_type <> 'event'
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id
        ORDER BY h.created_at ASC, ho.outcome_order ASC
      `).bind(user.id, user.id, playerName, friendId, friendId, user.id),
      c.env.DB.prepare(`
        SELECT m.id match_id, m.created_at,
          COALESCE(SUM(hs.score_change), 0) score,
          MAX(gs.location) location
        FROM matches m
        JOIN players selfp ON selfp.match_id = m.id AND (
          selfp.user_id = ? OR (
            m.owner_user_id = ? AND selfp.user_id IS NULL AND selfp.friend_id IS NULL AND selfp.name = ? COLLATE NOCASE
          )
        )
        LEFT JOIN hand_scores hs ON hs.player_id = selfp.id
        LEFT JOIN group_sessions gs ON gs.match_id = m.id
        WHERE EXISTS (
          SELECT 1 FROM players friendp
          WHERE friendp.match_id = m.id AND (
            friendp.friend_id = ? OR friendp.user_id = (
              SELECT linked_user_id FROM friends WHERE id = ? AND user_id = ?
            )
          )
        )
        GROUP BY m.id, m.created_at
        ORDER BY m.created_at ASC
      `).bind(user.id, user.id, playerName, friendId, friendId, user.id)
    ]);
    const queriedAt = performance.now();
    const friend = friendResult.results[0];
    if (!friend) return jsonError(c, "\u724C\u53CB\u4E0D\u5B58\u5728", 404);
    const rows = rowsResult;
    const relationRows = relationResult;
    const trendRows = trendResult;
    const matchIds = /* @__PURE__ */ new Set();
    const handIds = /* @__PURE__ */ new Set();
    const winPatterns = /* @__PURE__ */ new Map();
    const dealInPatterns = /* @__PURE__ */ new Map();
    let wins = 0;
    let ronWins = 0;
    let tsumoWins = 0;
    let dealIns = 0;
    let gangKaiWins = 0;
    let gangKaiAgainst = 0;
    const countedDealInHands = /* @__PURE__ */ new Set();
    const addPatterns = /* @__PURE__ */ __name((target, note) => {
      if (typeof note !== "string") return;
      const patterns = [...new Set(
        note.split("\u3001").map((item) => item.trim()).filter((item) => recordedPatterns.has(item))
      )];
      if (!patterns.length) return;
      const label = patterns.join(" \xB7 ");
      target.set(label, (target.get(label) ?? 0) + 1);
    }, "addPatterns");
    for (const row of rows.results) {
      matchIds.add(String(row.match_id));
      if (!row.hand_id || row.result_type === "event") continue;
      handIds.add(String(row.hand_id));
      const handId = String(row.hand_id);
      const playerId = String(row.player_id);
      const isWin = row.outcome_winner_player_id === playerId;
      const isDealIn = row.result_type === "ron" && row.loser_player_id === playerId;
      if (isWin) {
        wins += 1;
        if (row.result_type === "ron") ronWins += 1;
        if (row.result_type === "tsumo") tsumoWins += 1;
        if (typeof row.outcome_note === "string" && row.outcome_note.split("\u3001").includes("\u6760\u5F00")) gangKaiWins += 1;
        addPatterns(winPatterns, row.outcome_note);
      }
      if (isDealIn) {
        if (!countedDealInHands.has(handId)) {
          countedDealInHands.add(handId);
          dealIns += 1;
        }
        if (typeof row.outcome_note === "string" && row.outcome_note.split("\u3001").includes("\u6760\u5F00")) gangKaiAgainst += 1;
        addPatterns(dealInPatterns, row.outcome_note);
      }
    }
    const myWinHands = /* @__PURE__ */ new Set();
    const friendWinHands = /* @__PURE__ */ new Set();
    const myDealInHands = /* @__PURE__ */ new Set();
    const friendDealInHands = /* @__PURE__ */ new Set();
    for (const row of relationRows.results) {
      const handId = String(row.hand_id);
      const selfPlayerId = String(row.self_player_id);
      const friendPlayerId = String(row.friend_player_id);
      const winnerId = row.outcome_winner_player_id ? String(row.outcome_winner_player_id) : row.legacy_winner_player_id ? String(row.legacy_winner_player_id) : "";
      const loserId = row.loser_player_id ? String(row.loser_player_id) : "";
      if (winnerId === selfPlayerId) myWinHands.add(handId);
      if (winnerId === friendPlayerId) friendWinHands.add(handId);
      if (row.result_type === "ron" && loserId === selfPlayerId && winnerId === friendPlayerId) myDealInHands.add(handId);
      if (row.result_type === "ron" && loserId === friendPlayerId && winnerId === selfPlayerId) friendDealInHands.add(handId);
    }
    const trend = trendRows.results.map((row) => ({
      matchId: String(row.match_id),
      createdAt: String(row.created_at),
      score: Number(row.score ?? 0),
      location: row.location ? String(row.location) : null
    }));
    const netScore = trend.reduce((total, point) => total + point.score, 0);
    const sortPatterns = /* @__PURE__ */ __name((patterns) => [...patterns.entries()].map(([name, count]) => ({ name, count })).sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, "zh-CN")), "sortPatterns");
    const response = {
      friend: {
        id: String(friend.id),
        source: "manual",
        name: String(friend.name),
        avatar_seed: Number(friend.avatar_seed),
        avatarUrl: friend.avatar_url ? String(friend.avatar_url) : null,
        note: friend.note ? String(friend.note) : null,
        linkedUserId: friend.linked_user_id ? String(friend.linked_user_id) : null,
        wechatName: friend.wechat_name ? String(friend.wechat_name) : null,
        wechatAvatarUrl: friend.wechat_avatar_url ? String(friend.wechat_avatar_url) : null,
        wechatGender: friend.wechat_gender === "male" || friend.wechat_gender === "female" ? friend.wechat_gender : null,
        jointMatches: matchIds.size,
        winRate: handIds.size ? wins / handIds.size : 0,
        netScore,
        gangKaiWins,
        gangKaiAgainst,
        lastPlayedAt: friend.last_played_at ? String(friend.last_played_at) : null
      },
      totalHands: handIds.size,
      wins,
      ronWins,
      tsumoWins,
      dealIns,
      winPatterns: sortPatterns(winPatterns),
      dealInPatterns: sortPatterns(dealInPatterns),
      myWins: myWinHands.size,
      friendWins: friendWinHands.size,
      myDealInsToFriend: myDealInHands.size,
      friendDealInsToMe: friendDealInHands.size,
      netScore,
      trend
    };
    const mappedAt = performance.now();
    c.header("Server-Timing", [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`
    ].join(", "));
    return c.json(response);
  });
  app2.get("/api/me/daily-statistics", async (c) => {
    const startedAt = performance.now();
    const user = await currentUser(c);
    const authenticatedAt = performance.now();
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const period = resolveStatisticsPeriod("day", c.req.query("date"), c.req.query("timezoneOffset"));
    if (!period) return jsonError(c, "\u65E5\u671F\u6216\u65F6\u533A\u65E0\u6548");
    const date = period.value;
    const start = period.startAt;
    const end = period.endAt;
    const [summaryResult, playersResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT COUNT(DISTINCT h.match_id) match_count,
          COUNT(DISTINCT CASE WHEN h.result_type <> 'event' THEN h.id END) hand_count
        FROM hands h
        JOIN matches m ON m.id = h.match_id
        WHERE h.created_at >= ? AND h.created_at < ? AND (
          m.owner_user_id = ? OR EXISTS (
            SELECT 1 FROM players visible_player WHERE visible_player.match_id = m.id AND visible_player.user_id = ?
          )
        )
      `).bind(start, end, user.id, user.id),
      c.env.DB.prepare(`
        SELECT p.name,
          MAX(CASE WHEN p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND p.name = ? COLLATE NOCASE
          ) THEN 1 ELSE 0 END) is_self,
          COALESCE(SUM(hs.score_change), 0) score,
          SUM(CASE WHEN h.result_type IN ('ron', 'tsumo') AND (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
            ) OR (
              h.winner_player_id = p.id AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          ) THEN 1 ELSE 0 END) wins,
          SUM(CASE WHEN h.result_type = 'tsumo' AND (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id
            ) OR (
              h.winner_player_id = p.id AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          ) THEN 1 ELSE 0 END) tsumo,
          SUM(CASE WHEN h.result_type = 'ron' AND h.loser_player_id = p.id THEN 1 ELSE 0 END) deal_in,
          SUM(CASE WHEN (
            EXISTS (
              SELECT 1 FROM hand_outcomes ho
              WHERE ho.hand_id = h.id AND ho.winner_player_id = p.id AND COALESCE(ho.note, '') <> ''
            ) OR (
              h.winner_player_id = p.id AND COALESCE(h.note, '') <> '' AND NOT EXISTS (
                SELECT 1 FROM hand_outcomes existing_outcome WHERE existing_outcome.hand_id = h.id
              )
            )
          ) THEN 1 ELSE 0 END) big_hands
        FROM matches m
        JOIN players p ON p.match_id = m.id
        JOIN hands h ON h.match_id = m.id AND h.created_at >= ? AND h.created_at < ?
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        WHERE m.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM players visible_player WHERE visible_player.match_id = m.id AND visible_player.user_id = ?
        )
        GROUP BY p.name
        ORDER BY score DESC, wins DESC, p.name ASC
      `).bind(
        user.id,
        user.id,
        user.display_name?.trim() || user.username,
        start,
        end,
        user.id,
        user.id
      )
    ]);
    const queriedAt = performance.now();
    const summary = summaryResult.results[0];
    const players = playersResult;
    const stats = {
      date,
      matchCount: Number(summary?.match_count ?? 0),
      handCount: Number(summary?.hand_count ?? 0),
      players: players.results.map((row) => ({
        name: String(row.name),
        score: Number(row.score ?? 0),
        wins: Number(row.wins ?? 0),
        tsumo: Number(row.tsumo ?? 0),
        deal_in: Number(row.deal_in ?? 0),
        bigHands: Number(row.big_hands ?? 0),
        isSelf: Number(row.is_self ?? 0) === 1
      }))
    };
    const mappedAt = performance.now();
    c.header("Server-Timing", [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `map;dur=${(mappedAt - queriedAt).toFixed(1)}`
    ].join(", "));
    return c.json(stats);
  });
  app2.get("/api/me/statistics", async (c) => {
    const startedAt = performance.now();
    const user = await currentUser(c);
    const authenticatedAt = performance.now();
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const period = resolveStatisticsPeriod(
      c.req.query("dimension"),
      c.req.query("value"),
      c.req.query("timezoneOffset")
    );
    if (!period) return jsonError(c, "\u7EDF\u8BA1\u65F6\u95F4\u8303\u56F4\u65E0\u6548");
    const playerName = user.display_name?.trim() || user.username;
    const [rowsResult, featuredResult, trendResult, recentBigResult, previousRowsResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.result_type, h.loser_player_id,
          p.id player_id,
          ho.winner_player_id outcome_winner_player_id,
          ho.note outcome_note
        FROM hands h
        JOIN matches m ON m.id = h.match_id
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND
            p.name = ? COLLATE NOCASE
          )
        )
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id AND ho.winner_player_id = p.id
        WHERE h.created_at >= ? AND h.created_at < ?
        ORDER BY h.created_at DESC
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.match_id, h.result_type, h.created_at,
          COALESCE(hs.score_change, 0) score_change,
          ho.note outcome_note, ho.tile_record outcome_tile_record
        FROM hands h
        JOIN matches m ON m.id = h.match_id
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND
            p.name = ? COLLATE NOCASE
          )
        )
        JOIN hand_outcomes ho ON ho.hand_id = h.id AND ho.winner_player_id = p.id
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        WHERE h.created_at >= ? AND h.created_at < ?
          AND ho.tile_record IS NOT NULL AND ho.tile_record <> ''
        ORDER BY COALESCE(hs.score_change, 0) DESC, h.created_at DESC
        LIMIT 1
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
      c.env.DB.prepare(`
        SELECT m.id match_id, MIN(h.created_at) created_at,
          COALESCE(SUM(hs.score_change), 0) score
        FROM matches m
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND p.name = ? COLLATE NOCASE
          )
        )
        JOIN hands h ON h.match_id = m.id
          AND h.created_at >= ? AND h.created_at < ?
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        GROUP BY m.id
        ORDER BY MIN(h.created_at) ASC
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.match_id, h.result_type, h.created_at,
          COALESCE(hs.score_change, 0) score_change,
          ho.note outcome_note, ho.tile_record outcome_tile_record
        FROM hands h
        JOIN matches m ON m.id = h.match_id
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND
            p.name = ? COLLATE NOCASE
          )
        )
        JOIN hand_outcomes ho ON ho.hand_id = h.id AND ho.winner_player_id = p.id
        LEFT JOIN hand_scores hs ON hs.hand_id = h.id AND hs.player_id = p.id
        WHERE h.created_at >= ? AND h.created_at < ?
          AND COALESCE(TRIM(ho.note), '') <> ''
        ORDER BY h.created_at DESC
        LIMIT 100
      `).bind(user.id, user.id, playerName, period.startAt, period.endAt),
      c.env.DB.prepare(`
        SELECT h.id hand_id, h.result_type, h.loser_player_id,
          p.id player_id,
          ho.winner_player_id outcome_winner_player_id,
          ho.note outcome_note
        FROM hands h
        JOIN matches m ON m.id = h.match_id
        JOIN players p ON p.match_id = m.id AND (
          p.user_id = ? OR (
            m.owner_user_id = ? AND p.user_id IS NULL AND p.friend_id IS NULL AND
            p.name = ? COLLATE NOCASE
          )
        )
        LEFT JOIN hand_outcomes ho ON ho.hand_id = h.id AND ho.winner_player_id = p.id
        WHERE h.created_at >= ? AND h.created_at < ?
        ORDER BY h.created_at DESC
      `).bind(user.id, user.id, playerName, period.previousStartAt, period.previousEndAt)
    ]);
    const queriedAt = performance.now();
    const rows = rowsResult;
    const featuredRow = featuredResult.results[0];
    const trendRows = trendResult;
    const recentBigRows = recentBigResult;
    const previousRows = previousRowsResult;
    let wins = 0;
    let dealIns = 0;
    let tsumoWins = 0;
    let bigHands = 0;
    const patternCounts = /* @__PURE__ */ new Map();
    let featuredBigHand = null;
    for (const row of rows.results) {
      const playerId = String(row.player_id);
      const isWin = row.outcome_winner_player_id === playerId;
      const isDealIn = row.result_type === "ron" && row.loser_player_id === playerId;
      const patterns = bigHandPatterns(row.outcome_note);
      if (isWin) {
        wins += 1;
        if (row.result_type === "tsumo") tsumoWins += 1;
        if (patterns.length) {
          bigHands += 1;
          const patternLabel = [...new Set(patterns)].join("");
          patternCounts.set(patternLabel, (patternCounts.get(patternLabel) ?? 0) + 1);
        }
      }
      if (isDealIn) dealIns += 1;
    }
    let previousWins = 0;
    let previousDealIns = 0;
    let previousTsumoWins = 0;
    for (const row of previousRows.results) {
      const playerId = String(row.player_id);
      const isWin = row.outcome_winner_player_id === playerId;
      if (isWin) {
        previousWins += 1;
        if (row.result_type === "tsumo") previousTsumoWins += 1;
      }
      if (row.result_type === "ron" && row.loser_player_id === playerId) previousDealIns += 1;
    }
    const totalHands = rows.results.filter((row) => row.result_type !== "event").length;
    const previousTotalHands = previousRows.results.filter((row) => row.result_type !== "event").length;
    const ratePercent = /* @__PURE__ */ __name((part, total) => total ? part / total * 100 : 0, "ratePercent");
    const comparison = {
      label: period.comparisonLabel,
      totalHandsDelta: totalHands - previousTotalHands,
      winRateDelta: Math.round(ratePercent(wins, totalHands) - ratePercent(previousWins, previousTotalHands)),
      tsumoRateDelta: Math.round(ratePercent(tsumoWins, totalHands) - ratePercent(previousTsumoWins, previousTotalHands)),
      dealInRateDelta: Math.round(ratePercent(dealIns, totalHands) - ratePercent(previousDealIns, previousTotalHands))
    };
    if (featuredRow) {
      const tileRecord = parseStoredTileRecord(featuredRow.outcome_tile_record);
      if (tileRecord && (featuredRow.result_type === "ron" || featuredRow.result_type === "tsumo")) {
        featuredBigHand = {
          handId: String(featuredRow.hand_id),
          matchId: String(featuredRow.match_id),
          resultType: featuredRow.result_type,
          note: typeof featuredRow.outcome_note === "string" ? featuredRow.outcome_note : "",
          score: Number(featuredRow.score_change ?? 0),
          createdAt: String(featuredRow.created_at),
          tileRecord
        };
      }
    }
    const trend = trendRows.results.map((row) => ({
      matchId: String(row.match_id),
      createdAt: String(row.created_at),
      score: Number(row.score ?? 0)
    }));
    const netScore = trend.reduce((total, point) => total + point.score, 0);
    const bigHandRecords = recentBigRows.results.filter((row) => bigHandPatterns(row.outcome_note).length > 0 && (row.result_type === "ron" || row.result_type === "tsumo")).slice(0, 30).map((row) => ({
      handId: String(row.hand_id),
      matchId: String(row.match_id),
      resultType: row.result_type,
      note: typeof row.outcome_note === "string" ? row.outcome_note : "",
      score: Number(row.score_change ?? 0),
      createdAt: String(row.created_at),
      tileRecord: parseStoredTileRecord(row.outcome_tile_record)
    }));
    const response = {
      dimension: period.dimension,
      value: period.value,
      label: period.label,
      totalHands,
      wins,
      dealIns,
      tsumoWins,
      bigHands,
      netScore,
      trend,
      patterns: [...patternCounts.entries()].map(([name, count]) => ({ name, count })).sort((first, second) => second.count - first.count || first.name.localeCompare(second.name, "zh-CN")),
      featuredBigHand,
      bigHandRecords,
      comparison
    };
    const aggregatedAt = performance.now();
    c.header("Server-Timing", [
      `auth;dur=${(authenticatedAt - startedAt).toFixed(1)}`,
      `query;dur=${(queriedAt - authenticatedAt).toFixed(1)}`,
      `aggregate;dur=${(aggregatedAt - queriedAt).toFixed(1)}`
    ].join(", "));
    return c.json(response);
  });
}
__name(registerMeRoutes, "registerMeRoutes");

// worker/routes/profile.ts
var AVATAR_CONTENT_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var MAX_AVATAR_BYTES = 512 * 1024;
async function refreshedUser(c) {
  return currentUser(c);
}
__name(refreshedUser, "refreshedUser");
function registerProfileRoutes(app2) {
  app2.put("/api/me/profile", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const body = await c.req.json().catch(() => null);
    const displayName2 = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const gender = body?.gender === "male" || body?.gender === "female" ? body.gender : null;
    if (!displayName2 || displayName2.length > 12 || /[\u0000-\u001f\u007f]/.test(displayName2)) {
      return jsonError(c, "\u6635\u79F0\u9700\u4E3A 1\u201312 \u4E2A\u5B57\u7B26");
    }
    if (!gender) return jsonError(c, "\u8BF7\u9009\u62E9\u6027\u522B");
    await c.env.DB.prepare("UPDATE users SET display_name = ?, gender = ? WHERE id = ?").bind(displayName2, gender, user.id).run();
    const updated = await refreshedUser(c);
    return c.json({ user: updated ?? { ...user, display_name: displayName2, gender } });
  });
  app2.post("/api/me/avatar", async (c) => {
    const user = await currentUser(c);
    if (!user) return jsonError(c, "\u8BF7\u5148\u767B\u5F55", 401);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return jsonError(c, "\u8BF7\u9009\u62E9\u5934\u50CF\u56FE\u7247");
    if (!AVATAR_CONTENT_TYPES.has(file.type)) return jsonError(c, "\u5934\u50CF\u4EC5\u652F\u6301 JPG\u3001PNG \u6216 WebP");
    if (!file.size || file.size > MAX_AVATAR_BYTES) return jsonError(c, "\u5934\u50CF\u538B\u7F29\u540E\u9700\u5C0F\u4E8E 512KB");
    const content = await file.arrayBuffer();
    const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    const etag = crypto.randomUUID().replace(/-/g, "");
    await c.env.DB.prepare(`
      INSERT INTO user_avatars(user_id, content_type, content, etag, updated_at)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        content_type = excluded.content_type,
        content = excluded.content,
        etag = excluded.etag,
        updated_at = excluded.updated_at
    `).bind(user.id, file.type, content, etag, updatedAt).run();
    const avatarUrl = `/assets/avatar/${encodeURIComponent(user.id)}?v=${Date.now().toString(36)}`;
    await c.env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").bind(avatarUrl, user.id).run();
    return c.json({ user: { ...user, avatar_url: avatarUrl } });
  });
  app2.get("/assets/avatar/:userId", async (c) => {
    const userId = c.req.param("userId");
    if (!userId || userId.length > 100 || userId.includes("/") || userId.includes("..")) return jsonError(c, "\u5934\u50CF\u4E0D\u5B58\u5728", 404);
    const avatar = await c.env.DB.prepare(`
      SELECT content_type, content, etag FROM user_avatars WHERE user_id = ?
    `).bind(userId).first();
    if (!avatar) return jsonError(c, "\u5934\u50CF\u4E0D\u5B58\u5728", 404);
    const quotedEtag = `"${avatar.etag}"`;
    if (c.req.header("if-none-match") === quotedEtag) return new Response(null, { status: 304, headers: { etag: quotedEtag } });
    return new Response(new Uint8Array(avatar.content), {
      headers: {
        "content-type": avatar.content_type,
        "cache-control": "public, max-age=31536000, immutable",
        "etag": quotedEtag,
        "x-content-type-options": "nosniff"
      }
    });
  });
}
__name(registerProfileRoutes, "registerProfileRoutes");

// src/mahjong/engine.ts
var TILE_NAMES = [
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}\u4E07`),
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}\u7B52`),
  ...Array.from({ length: 9 }, (_, i) => `${i + 1}\u6761`),
  "\u4E1C",
  "\u5357",
  "\u897F",
  "\u5317",
  "\u4E2D",
  "\u53D1",
  "\u767D"
];
function validateHand2(hand) {
  if (hand.length > 14) return false;
  const counts = Array(34).fill(0);
  for (const tile of hand) {
    if (!Number.isInteger(tile) || tile < 0 || tile > 33 || ++counts[tile] > 4) return false;
  }
  return true;
}
__name(validateHand2, "validateHand");

// src/mahjong/normalizeTileName.ts
function normalizeTileName(raw2) {
  if (typeof raw2 !== "string") return "";
  let name = raw2.trim().replace(/[\s、，。·\-]/g, "").replace(/[萬万]/g, "\u4E07").replace(/[餅饼]/g, "\u7B52").replace(/[索竹]/g, "\u6761").replace(/發/g, "\u53D1");
  const aliases = {
    \u4E07: "1\u4E07",
    \u7EA2\u4E2D: "\u4E2D",
    \u767D\u677F: "\u767D",
    \u53D1\u8D22: "\u53D1",
    \u4E1C\u98CE: "\u4E1C",
    \u5357\u98CE: "\u5357",
    \u897F\u98CE: "\u897F",
    \u5317\u98CE: "\u5317"
  };
  if (aliases[name]) return aliases[name];
  const cn = "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D";
  return name.replace(/^[一二三四五六七八九]/, (digit) => String(cn.indexOf(digit) + 1));
}
__name(normalizeTileName, "normalizeTileName");

// worker/routes/recognize.ts
var MODEL = "Qwen/Qwen3-VL-8B-Instruct";
var TILE_MODEL = "@cf/google/gemma-4-26b-a4b-it";
var SINGLE_TILE_PROMPT = "\u8FD9\u5F20\u56FE\u53EA\u6709\u4E00\u5F20\u9EBB\u5C06\u724C\uFF0C\u8BF7\u4ED4\u7EC6\u89C2\u5BDF\u5E76\u6570\u6E05\u5168\u90E8\u5706\u5708\uFF08\u5305\u62EC\u7EA2\u8272\u5706\u5708\uFF09\uFF0C\u53EA\u80FD\u56DE\u7B541-9\u7B52\u30011-9\u4E07\u30011-9\u6761\u6216\u4E1C\u5357\u897F\u5317\u4E2D\u53D1\u767D\u3002\u5982\u679C\u4E0A2\u4E2A\u5706\u3001\u4E2D1\u4E2A\u7EA2\u5706\u3001\u4E0B2\u4E2A\u5706\u5219\u662F5\u7B52\uFF1B\u5982\u679C\u4E0A2\u4E2A\u5706\u3001\u4E2D2\u4E2A\u5706\u3001\u4E0B2\u4E2A\u5706\u5219\u662F6\u7B52\uFF1B\u5982\u679C\u4E0A\u4E2D\u4E0B\u54043\u4E2A\u5706\u5219\u662F9\u7B52\u3002\u5982\u679C\u4E0A\u4E0B\u54042\u4E2A\u4E14\u6CA1\u6709\u4E2D\u95F4\u5706\u5219\u662F4\u7B52\u3002\u4E0D\u8981\u6F0F\u6570\u7EA2\u5708\u3002\u53EA\u8F93\u51FA\u724C\u540D\uFF0C\u4E0D\u89E3\u91CA\u3002";
var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
var PROMPT = `\u4EFB\u52A1\uFF1A\u9010\u5F20\u8BFB\u53D6\u73A9\u5BB6\u81EA\u5DF1\u7684\u9EBB\u5C06\u624B\u724C\uFF0C\u4E0D\u662F\u5224\u65AD\u724C\u578B\uFF0C\u4E5F\u4E0D\u8981\u7ED9\u6253\u724C\u5EFA\u8BAE\u3002
\u56FE\u50CF\u5E94\u5DF2\u88C1\u526A\u4E3A\u6700\u524D\u65B9\u7684\u4E00\u6392\u6B63\u9762\u624B\u724C\uFF1B\u82E5\u6709\u80CC\u666F\uFF0C\u53EA\u5173\u6CE8\u6700\u9760\u8FD1\u955C\u5934\u3001\u6A2A\u5411\u6392\u6210\u4E00\u884C\u7684\u6B63\u9762\u724C\u3002\u5FFD\u7565\u724C\u5899\u3001\u724C\u80CC\u3001\u5F03\u724C\u548C\u5176\u4ED6\u73A9\u5BB6\u7684\u724C\u3002
\u5148\u627E\u5230\u6BCF\u5F20\u7AD6\u76F4\u724C\u9762\u7684\u8FB9\u754C\uFF0C\u4ECE\u5DE6\u5411\u53F3\u4E00\u5F20\u5F20\u6570\u6E05\u695A\uFF0C\u518D\u5206\u522B\u770B\u6BCF\u5F20\u724C\u7684\u56FE\u6848\uFF1A
- \u7EA2\u8272\u201C\u4E07\u201D\u548C\u4E0A\u65B9\u6570\u5B57\u662F\u4E07\u5B50\uFF1B\u5706\u70B9\u662F\u7B52\u5B50\uFF1B\u7AF9\u6761\u662F\u6761\u5B50\uFF1B\u6C49\u5B57\u4E1C\u5357\u897F\u5317\u4E2D\u53D1\u548C\u7A7A\u767D\u662F\u5B57\u724C\u3002
- \u7279\u522B\u6CE8\u610F\u4E09\u5F20\u5B8C\u5168\u76F8\u540C\u7684\u724C\u5C31\u662F\u91CD\u590D\u4E09\u6B21\uFF0C\u7EDD\u4E0D\u80FD\u4E3A\u4E86\u51D1\u987A\u5B50\u800C\u628A\u76F8\u540C\u724C\u6539\u6210\u4E00\u3001\u4E8C\u3001\u4E09\u3002
- \u724C\u9762\u53EF\u80FD\u7ECF\u8FC7\u6A2A\u5411\u88C1\u526A\uFF0C\u5343\u4E07\u4E0D\u8981\u628A\u9876\u7AEF\u7684\u9634\u5F71\u3001\u80CC\u666F\u6216\u724C\u5899\u5F53\u6210\u9EBB\u5C06\u56FE\u6848\uFF1B\u4F9D\u6B21\u8BFB\u53D6\u6BCF\u4E2A\u5B8C\u6574\u7684\u7AD6\u76F4\u724C\u9762\u3002
- \u4EC5\u4F9D\u636E\u5B9E\u9645\u56FE\u6848\u8BC6\u522B\uFF0C\u4E0D\u6839\u636E\u9EBB\u5C06\u89C4\u5219\u731C\u724C\u6216\u8865\u51FA13/14\u5F20\u3002
\u724C\u540D\u53EA\u5141\u8BB8\uFF1A1\u4E07~9\u4E07\u30011\u7B52~9\u7B52\u30011\u6761~9\u6761\u3001\u4E1C\u3001\u5357\u3001\u897F\u3001\u5317\u3001\u4E2D\u3001\u53D1\u3001\u767D\u3002\u770B\u4E0D\u6E05\u7684\u724C\u5199"?"\uFF0C\u4FDD\u7559\u5176\u5360\u4F4D\u3002
\u53EA\u8F93\u51FA\u4E00\u4E2AJSON\u5BF9\u8C61\uFF1A{"tiles":["1\u4E07","1\u4E07","1\u4E07","4\u7B52","?","\u4E1C"],"uncertain":[5]}\u3002uncertain\u4E3A\u4ECE1\u5F00\u59CB\u7684\u5B58\u7591\u4F4D\u7F6E\u3002
\u6309\u7167\u7247\u539F\u59CB\u4ECE\u5DE6\u5230\u53F3\u987A\u5E8F\u8F93\u51FA\uFF0C\u4E0D\u8981\u89E3\u91CA\u3001\u4EE3\u7801\u5757\u6216\u989D\u5916\u6587\u5B57\u3002`;
var recentRequests = /* @__PURE__ */ new Map();
function allowOrigin(origin) {
  if (!origin) return null;
  if (origin === "https://mahjong-helper-6wy.pages.dev" || /^https:\/\/[a-z0-9-]+\.mahjong-helper-6wy\.pages\.dev$/.test(origin)) return origin;
  return null;
}
__name(allowOrigin, "allowOrigin");
function responseHeaders(origin) {
  return origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}
__name(responseHeaders, "responseHeaders");
function base64(bytes) {
  let result = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(result);
}
__name(base64, "base64");
function modelText(raw2) {
  if (typeof raw2 === "string") return raw2;
  if (Array.isArray(raw2)) return raw2.map(modelText).filter(Boolean).join("");
  if (raw2 && typeof raw2 === "object") {
    const data = raw2;
    if (Array.isArray(data.tiles)) return JSON.stringify(data);
    return modelText(data.content) || modelText(data.text) || modelText(data.response) || modelText(data.output);
  }
  return "";
}
__name(modelText, "modelText");
function parseTiles(raw2) {
  let value;
  for (let start = raw2.indexOf("{"); start >= 0; start = raw2.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < raw2.length; end++) {
      const char = raw2[end];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          const candidate = JSON.parse(raw2.slice(start, end + 1));
          if (candidate && typeof candidate === "object" && "tiles" in candidate) value = candidate;
        } catch {
        }
        break;
      }
    }
    if (value) break;
  }
  if (!value) throw new Error("\u89C6\u89C9\u6A21\u578B\u672A\u8FD4\u56DE\u6709\u6548\u624B\u724C JSON");
  if (!value || typeof value !== "object" || !("tiles" in value) || !Array.isArray(value.tiles)) {
    throw new Error("\u89C6\u89C9\u6A21\u578B\u672A\u8FD4\u56DE\u624B\u724C\u5217\u8868");
  }
  const given = value.tiles;
  if (given.length > 14) throw new Error("\u56FE\u4E2D\u68C0\u6D4B\u5230\u8D85\u8FC714\u5F20\u724C\uFF0C\u8BF7\u53EA\u62CD\u81EA\u5DF1\u7684\u624B\u724C");
  const tiles = [];
  const slots = [];
  const uncertain = [];
  for (let i = 0; i < given.length; i++) {
    const name = normalizeTileName(given[i]);
    const tile = TILE_NAMES.indexOf(name);
    slots.push(tile < 0 ? null : tile);
    if (tile < 0) uncertain.push(i + 1);
    else tiles.push(tile);
  }
  if (!validateHand2(tiles)) throw new Error("\u8BC6\u522B\u7ED3\u679C\u542B\u8D85\u8FC74\u5F20\u76F8\u540C\u724C\uFF0C\u8BF7\u91CD\u65B0\u62CD\u6444");
  return { tiles, slots, recognized: tiles.length, detected: given.length, uncertain };
}
__name(parseTiles, "parseTiles");
function registerRecognizeRoutes(app2) {
  app2.options("/api/recognize", (c) => {
    const origin = allowOrigin(c.req.header("origin"));
    if (!origin) return c.body(null, 403);
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600"
      }
    });
  });
  app2.post("/api/recognize", async (c) => {
    const headers = responseHeaders(allowOrigin(c.req.header("origin")));
    const error = /* @__PURE__ */ __name((message, status) => c.json({ error: message }, status, headers), "error");
    const secret = c.env.SILICONFLOW_API_KEY;
    if (!secret && !c.env.AI) return error("\u8BC6\u522B\u670D\u52A1\u5C1A\u672A\u914D\u7F6E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", 503);
    if (!(c.req.header("content-type") || "").startsWith("multipart/form-data")) {
      return error("\u8BF7\u4E0A\u4F20\u624B\u724C\u56FE\u7247", 400);
    }
    const size = Number(c.req.header("content-length") || 0);
    if (size > MAX_IMAGE_BYTES + 3e3) return error("\u56FE\u7247\u8D85\u8FC72MB\uFF0C\u8BF7\u538B\u7F29\u6216\u88C1\u526A\u540E\u91CD\u8BD5", 400);
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const now2 = Date.now();
    if (recentRequests.size > 500) recentRequests.clear();
    if (now2 - (recentRequests.get(ip) || 0) < 12e3) return error("\u64CD\u4F5C\u592A\u9891\u7E41\uFF0C\u8BF712\u79D2\u540E\u91CD\u8BD5", 429);
    try {
      const form = await c.req.formData();
      const image = form.get("image");
      if (!(image instanceof File) || image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
        return error("\u8BF7\u4E0A\u4F202MB\u4EE5\u5185\u7684 JPG\u3001PNG \u6216 WebP \u56FE\u7247", 400);
      }
      recentRequests.set(ip, now2);
      const bytes = new Uint8Array(await image.arrayBuffer());
      const mime = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? "image/png" : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp" : null;
      if (!mime) return error("\u56FE\u7247\u683C\u5F0F\u9519\u8BEF\uFF0C\u8BF7\u4F7F\u7528 JPG\u3001PNG \u6216 WebP", 400);
      const boundaryCount = Number(form.get("expected_count"));
      const detectedCount = boundaryCount === 13 || boundaryCount === 14 ? boundaryCount : null;
      const prompt = detectedCount ? `${PROMPT}
\u724C\u9762\u63A5\u7F1D\u68C0\u6D4B\u663E\u793A\u5927\u7EA6${detectedCount}\u4E2A\u72EC\u7ACB\u4F4D\u7F6E\u3002\u5FC5\u987B\u9010\u4E2A\u4F4D\u7F6E\u9605\u8BFB\uFF0C\u5982\u8FA8\u8BA4\u4E0D\u6E05\u5C31\u7528\u201C?\u201D\uFF0C\u4E0D\u8981\u4E3A\u51D1\u724C\u6570\u634F\u9020\u724C\u540D\u3002` : PROMPT;
      const payload = {
        model: MODEL,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mime};base64,${base64(bytes)}`, detail: "high" } }
          ]
        }],
        temperature: 0,
        max_tokens: 350,
        stream: false
      };
      let content = "";
      let model = MODEL;
      if (secret) {
        const result = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3e4)
        });
        if (result.ok) {
          const data = await result.json();
          content = data.choices?.[0]?.message?.content || "";
        } else if (result.status !== 402) {
          console.error("siliconflow_recognize_error", result.status);
          if (!c.env.AI) return error("\u8BC6\u522B\u670D\u52A1\u6682\u4E0D\u53EF\u7528", result.status === 429 ? 429 : 502);
        }
      }
      if (!content && c.env.AI) {
        try {
          const fallback = await c.env.AI.run("@cf/google/gemma-4-26b-a4b-it", {
            messages: payload.messages,
            stream: false,
            max_tokens: 420,
            temperature: 0,
            chat_template_kwargs: { enable_thinking: false }
          });
          content = modelText(fallback.response) || modelText(fallback.choices?.[0]?.message?.content);
          model = "@cf/google/gemma-4-26b-a4b-it";
        } catch (cause) {
          console.error("workers_ai_recognize_error", cause instanceof Error ? cause.name : "unknown");
          return error("\u5F53\u524D\u8BC6\u522B\u989D\u5EA6\u4E0D\u8DB3\u6216\u670D\u52A1\u7E41\u5FD9\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", 503);
        }
      }
      if (!content) return error("\u8BC6\u522B\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u7ED3\u679C\uFF0C\u8BF7\u91CD\u8BD5", 502);
      let parsed;
      try {
        parsed = parseTiles(content);
      } catch (cause) {
        return error(cause instanceof Error ? cause.message : "\u65E0\u6CD5\u89E3\u6790\u8BC6\u522B\u7ED3\u679C", 422);
      }
      if (!parsed.recognized) return error("\u6CA1\u6709\u8BC6\u522B\u51FA\u624B\u724C\uFF0C\u8BF7\u9760\u8FD1\u624B\u724C\u91CD\u65B0\u62CD\u6444", 422);
      const warnings = [];
      if (parsed.uncertain.length) warnings.push(`\u7B2C${parsed.uncertain.join("\u3001")}\u5F20\u724C\u672A\u770B\u6E05\uFF0C\u8BF7\u624B\u52A8\u8865\u5145`);
      if (parsed.detected !== 13 && parsed.detected !== 14) warnings.push(`\u68C0\u6D4B\u5230${parsed.detected}\u5F20\u724C\uFF0C\u8BF7\u6838\u5BF9\u624B\u724C\u6570\u91CF`);
      return c.json({ ...parsed, warnings, model, needConfirmation: true }, 200, headers);
    } catch (cause) {
      if (cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")) {
        return error("\u6A21\u578B\u54CD\u5E94\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5", 504);
      }
      console.error("recognize_error", cause instanceof Error ? cause.message : "unknown");
      return error("\u8BC6\u522B\u5931\u8D25\uFF0C\u8BF7\u91CD\u65B0\u62CD\u7167", 500);
    }
  });
  app2.options("/api/recognize-tiles", (c) => {
    const origin = allowOrigin(c.req.header("origin"));
    if (!origin) return c.body(null, 403);
    return new Response(null, {
      status: 204,
      headers: {
        ...responseHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600"
      }
    });
  });
  app2.post("/api/recognize-tiles", async (c) => {
    const headers = responseHeaders(allowOrigin(c.req.header("origin")));
    const fail = /* @__PURE__ */ __name((message, status) => c.json({ error: message }, status, headers), "fail");
    if (!c.env.AI) return fail("\u89C6\u89C9\u8BC6\u522B\u670D\u52A1\u5C1A\u672A\u914D\u7F6E", 503);
    if (!(c.req.header("content-type") || "").startsWith("application/json")) {
      return fail("\u8BF7\u6C42\u5FC5\u987B\u662F JSON", 400);
    }
    if (Number(c.req.header("content-length") || 0) > 16e5) {
      return fail("\u7167\u7247\u6570\u636E\u8FC7\u5927\uFF0C\u8BF7\u91CD\u65B0\u88C1\u526A", 400);
    }
    let images;
    try {
      const data = await c.req.json();
      images = data?.images;
    } catch {
      return fail("\u56FE\u7247\u6570\u636E\u65E0\u6548", 400);
    }
    if (!Array.isArray(images) || ![13, 14].includes(images.length) || !images.every((img) => typeof img === "string" && img.length > 100 && img.length <= 12e4 && img.startsWith("/9j/") && /^[A-Za-z0-9+/]+={0,2}$/.test(img))) {
      return fail("\u9700\u898113\u621614\u5F20\u6709\u6548\u7684\u5355\u724C JPG \u56FE\u7247", 400);
    }
    const ip = c.req.header("cf-connecting-ip") || "unknown";
    const now2 = Date.now();
    if (recentRequests.size > 500) recentRequests.clear();
    if (now2 - (recentRequests.get(ip) || 0) < 12e3) return fail("\u64CD\u4F5C\u592A\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", 429);
    recentRequests.set(ip, now2);
    const slots = Array(images.length).fill(null);
    for (let start = 0; start < images.length; start += 3) {
      await Promise.all(images.slice(start, start + 3).map(async (encoded, offset) => {
        const index = start + offset;
        try {
          const output = await c.env.AI.run(TILE_MODEL, {
            messages: [{ role: "user", content: [
              { type: "text", text: SINGLE_TILE_PROMPT },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${encoded}` } }
            ] }],
            max_tokens: 90,
            temperature: 0,
            chat_template_kwargs: { enable_thinking: false },
            stream: false
          });
          const raw2 = modelText(output.response) || modelText(output.choices?.[0]?.message?.content);
          const match2 = raw2.match(/(?:[1-9一二三四五六七八九][万萬筒餅饼条索竹]|[东東南西北中发發白]|萬)/);
          const tile = TILE_NAMES.indexOf(normalizeTileName(match2?.[0] || raw2));
          if (tile >= 0) slots[index] = tile;
        } catch (cause) {
          console.error("single_tile_recognize_error", index, cause instanceof Error ? cause.name : "unknown");
        }
      }));
    }
    const seen = Array(34).fill(0);
    const warnings = [];
    for (let i = 0; i < slots.length; i++) {
      const tile = slots[i];
      if (tile !== null && ++seen[tile] > 4) {
        slots[i] = null;
        warnings.push(`\u7B2C${i + 1}\u5F20\u4E0E\u540C\u7C7B\u724C\u7D2F\u8BA1\u8D85\u8FC74\u5F20\uFF0C\u8BF7\u4EBA\u5DE5\u6838\u5BF9`);
      }
    }
    const tiles = slots.filter((tile) => tile !== null);
    if (!tiles.length) return fail("\u89C6\u89C9\u6A21\u578B\u672A\u8BC6\u522B\u51FA\u9EBB\u5C06\u724C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", 503);
    const uncertain = slots.flatMap((tile, i) => tile === null ? [i + 1] : []);
    if (uncertain.length) warnings.push(`\u7B2C${uncertain.join("\u3001")}\u5F20\u672A\u8BC6\u522B\uFF0C\u8BF7\u70B9\u51FB\u95EE\u53F7\u624B\u52A8\u4FEE\u6B63`);
    return c.json({
      tiles,
      slots,
      recognized: tiles.length,
      detected: slots.length,
      uncertain,
      warnings,
      model: TILE_MODEL,
      needConfirmation: true
    }, 200, headers);
  });
}
__name(registerRecognizeRoutes, "registerRecognizeRoutes");

// worker/group-chat-room.ts
import { DurableObject } from "cloudflare:workers";
function mapMessage2(row) {
  let payload = null;
  if (row.payload) {
    try {
      const parsed = JSON.parse(row.payload);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
    } catch {
      payload = null;
    }
  }
  return {
    ...row,
    sequence: Number(row.sequence),
    payload
  };
}
__name(mapMessage2, "mapMessage");
function socketPayload(type, value) {
  return JSON.stringify({ type, ...value });
}
__name(socketPayload, "socketPayload");
var GroupChatRoom = class extends DurableObject {
  constructor() {
    super(...arguments);
    this.writeTail = Promise.resolve();
  }
  static {
    __name(this, "GroupChatRoom");
  }
  enqueue(operation) {
    const result = this.writeTail.then(operation, operation);
    this.writeTail = result.then(() => void 0, () => void 0);
    return result;
  }
  async ensureRoom(roomId) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    await this.env.DB.prepare(`
      INSERT OR IGNORE INTO group_chat_rooms(id, group_session_id, status, next_sequence, created_at)
      VALUES(?, ?, 'active', 0, ?)
    `).bind(roomId, roomId, timestamp).run();
  }
  async activeMember(roomId, userId) {
    return Boolean(await this.env.DB.prepare(`
      SELECT 1 FROM group_chat_members
      WHERE room_id = ? AND user_id = ? AND left_at IS NULL
      LIMIT 1
    `).bind(roomId, userId).first());
  }
  async storedMessageByClientId(roomId, userId, clientMessageId) {
    return await this.env.DB.prepare(`
      SELECT id, room_id, sender_user_id, sender_name, sequence, message_type, content,
             event_type, payload, client_message_id, created_at, recalled_at
      FROM group_chat_messages
      WHERE room_id = ? AND sender_user_id = ? AND client_message_id = ?
      LIMIT 1
    `).bind(roomId, userId, clientMessageId).first();
  }
  async persistMessage(input) {
    return this.enqueue(async () => {
      await this.ensureRoom(input.roomId);
      if (input.senderUserId && input.clientMessageId) {
        const existing = await this.storedMessageByClientId(input.roomId, input.senderUserId, input.clientMessageId);
        if (existing) return mapMessage2(existing);
      }
      const sequenceRow = await this.env.DB.prepare(`
        UPDATE group_chat_rooms
        SET next_sequence = next_sequence + 1
        WHERE id = ?
        RETURNING next_sequence
      `).bind(input.roomId).first();
      if (!sequenceRow) throw new Error("CHAT_ROOM_NOT_FOUND");
      const message = {
        id: crypto.randomUUID(),
        room_id: input.roomId,
        sender_user_id: input.senderUserId,
        sender_name: input.senderName,
        sequence: Number(sequenceRow.next_sequence),
        message_type: input.messageType,
        content: input.content,
        event_type: input.eventType,
        payload: input.payload,
        client_message_id: input.clientMessageId,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        recalled_at: null
      };
      await this.env.DB.prepare(`
        INSERT INTO group_chat_messages(
          id, room_id, sender_user_id, sender_name, sequence, message_type, content,
          event_type, payload, client_message_id, created_at, recalled_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        message.id,
        message.room_id,
        message.sender_user_id,
        message.sender_name,
        message.sequence,
        message.message_type,
        message.content,
        message.event_type,
        message.payload ? JSON.stringify(message.payload) : null,
        message.client_message_id,
        message.created_at
      ).run();
      return message;
    });
  }
  broadcast(message) {
    const data = socketPayload("message", { message });
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(data);
      } catch (error) {
        console.error(JSON.stringify({
          event: "group_chat_broadcast_failed",
          roomId: message.room_id,
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }
  }
  async fetch(request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const roomId = request.headers.get("x-chat-room-id")?.trim() || "";
    const userId = request.headers.get("x-chat-user-id")?.trim() || "";
    const userName = request.headers.get("x-chat-user-name")?.trim() || "";
    if (!roomId || !userId || !userName) return new Response("Missing chat identity", { status: 401 });
    await this.ensureRoom(roomId);
    if (!await this.activeMember(roomId, userId)) return new Response("Chat membership required", { status: 403 });
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.serializeAttachment({ roomId, userId, userName });
    this.ctx.acceptWebSocket(server);
    server.send(socketPayload("ready", { roomId }));
    return new Response(null, { status: 101, webSocket: client });
  }
  async publishText(input) {
    const content = input.content.trim();
    if (!content || content.length > 500) throw new Error("CHAT_MESSAGE_INVALID");
    if (!input.clientMessageId || input.clientMessageId.length > 80) throw new Error("CHAT_CLIENT_ID_INVALID");
    if (!await this.activeMember(input.roomId, input.userId)) throw new Error("CHAT_MEMBERSHIP_REQUIRED");
    const room = await this.env.DB.prepare("SELECT status FROM group_chat_rooms WHERE id = ?").bind(input.roomId).first();
    if (room?.status === "readonly") throw new Error("CHAT_ROOM_READONLY");
    const message = await this.persistMessage({
      roomId: input.roomId,
      senderUserId: input.userId,
      senderName: input.userName,
      messageType: "text",
      content,
      eventType: null,
      payload: null,
      clientMessageId: input.clientMessageId
    });
    this.broadcast(message);
    return message;
  }
  async publishSystem(input) {
    const message = await this.persistMessage({
      roomId: input.roomId,
      senderUserId: null,
      senderName: null,
      messageType: "system",
      content: input.content.trim().slice(0, 500),
      eventType: input.eventType.trim().slice(0, 80),
      payload: input.payload ?? null,
      clientMessageId: null
    });
    this.broadcast(message);
    return message;
  }
  async setRoomStatus(roomId, status) {
    await this.ensureRoom(roomId);
    await this.env.DB.prepare(`
      UPDATE group_chat_rooms
      SET status = ?, archived_at = CASE WHEN ? = 'readonly' THEN ? ELSE NULL END
      WHERE id = ?
    `).bind(status, status, (/* @__PURE__ */ new Date()).toISOString(), roomId).run();
  }
  async disconnectUser(userId) {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment();
      if (attachment?.userId === userId) socket.close(1008, "Chat membership ended");
    }
  }
  async webSocketMessage(socket, message) {
    if (typeof message !== "string") return;
    try {
      const value = JSON.parse(message);
      if (value.type === "ping") {
        socket.send(socketPayload("pong", { timestamp: Date.now() }));
        return;
      }
      if (value.type === "read" && Number.isFinite(value.sequence)) {
        const attachment = socket.deserializeAttachment();
        if (!attachment) return;
        await this.env.DB.prepare(`
          UPDATE group_chat_members
          SET last_read_sequence = MAX(last_read_sequence, ?)
          WHERE room_id = ? AND user_id = ? AND left_at IS NULL
        `).bind(Math.max(0, Number(value.sequence)), attachment.roomId, attachment.userId).run();
      }
    } catch {
      socket.send(socketPayload("error", { message: "\u6D88\u606F\u683C\u5F0F\u65E0\u6548" }));
    }
  }
  webSocketClose(_socket, _code, _reason, _wasClean) {
  }
  webSocketError(socket, error) {
    console.error(JSON.stringify({
      event: "group_chat_socket_error",
      message: error instanceof Error ? error.message : String(error)
    }));
    socket.close(1011, "Socket error");
  }
};

// worker/index.ts
var app = new Hono2();
var mahjongAssetFiles = /* @__PURE__ */ new Set([
  "Back.png",
  "Chun.png",
  "Haku.png",
  "Hatsu.png",
  "Man1.png",
  "Man2.png",
  "Man3.png",
  "Man4.png",
  "Man5.png",
  "Man6.png",
  "Man7.png",
  "Man8.png",
  "Man9.png",
  "Pin1.png",
  "Pin2.png",
  "Pin3.png",
  "Pin4.png",
  "Pin5.png",
  "Pin6.png",
  "Pin7.png",
  "Pin8.png",
  "Pin9.png",
  "Sou1.png",
  "Sou2.png",
  "Sou3.png",
  "Sou4.png",
  "Sou5.png",
  "Sou6.png",
  "Sou7.png",
  "Sou8.png",
  "Sou9.png",
  "Ton.png",
  "Nan.png",
  "Shaa.png",
  "Pei.png"
]);
app.get("/assets/mahjong/:file", async (c) => {
  const file = c.req.param("file");
  if (!mahjongAssetFiles.has(file)) return jsonError(c, "\u9EBB\u5C06\u724C\u8D44\u6E90\u4E0D\u5B58\u5728", 404);
  const source = `https://cdn.jsdelivr.net/gh/FluffyStuff/riichi-mahjong-tiles@master/Export/Regular/${file}`;
  const response = await fetch(source);
  if (!response.ok || !response.body) return jsonError(c, "\u9EBB\u5C06\u724C\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25", 502);
  return new Response(response.body, {
    headers: {
      "content-type": response.headers.get("content-type") || "image/png",
      "cache-control": "public, max-age=31536000, immutable",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff"
    }
  });
});
app.get("/api/health", (c) => c.json({ ok: true, service: "mahjong-score-wechat", timestamp: now() }));
registerAuthRoutes(app);
registerProfileRoutes(app);
registerFriendLinkRoutes(app);
registerLobbyRoutes(app);
registerMeRoutes(app);
registerGroupRoutes(app);
registerChatRoutes(app);
registerMatchRoutes(app);
registerRecognizeRoutes(app);
app.notFound((c) => jsonError(c, "\u63A5\u53E3\u4E0D\u5B58\u5728", 404));
app.onError((error, c) => {
  console.error(JSON.stringify({ event: "unhandled_error", message: String(error) }));
  return jsonError(c, "\u670D\u52A1\u5668\u5904\u7406\u5931\u8D25", 500);
});
var index_default = app;
export {
  GroupChatRoom,
  index_default as default
};
//# sourceMappingURL=index.js.map
