# API route that reaches a `'use client'` module leaks the dev server's heap

A new SDK 58 app (`create-expo-app --template default@sdk-58`) with `web.output: "server"` and `experiments.reactServerFunctions: true`. It adds two API routes:

- `src/app/api/leak+api.ts` imports `expo`.
- `src/app/api/plain+api.ts` imports nothing.

Each request to `/api/leak` keeps about 12 MB on the `expo start` heap. The memory is never freed, so `expo start` stops with "JavaScript heap out of memory". In a larger app the route bundle is bigger, and each request keeps about 190 MB.

## Steps

1. Install the packages:

   ```sh
   bun install
   ```

2. Start the dev server with the heap logger. The logger prints the heap after a forced GC every 10 s.

   ```sh
   NODE_OPTIONS="--expose-gc --require ./measure.cjs" npx expo start --port 8095
   ```

3. In a second terminal, send requests to each route:

   ```sh
   PORT=8095 ./hammer.sh plain 200
   PORT=8095 ./hammer.sh leak 200
   ```

## Result

@expo/cli 58.1.21, Node 24.15, macOS. Heap after a forced GC:

| Step | Heap |
|---|---|
| After the first requests | 61 MB |
| After 200 requests to `/api/plain` | 61 MB |
| After 200 requests to `/api/leak` | 2,455 MB |
| During the next 200 requests to `/api/leak` | Crash at about 4,000 MB |

## Cause

1. `MetroBundlerDevServer.ssrImportApiRoute` calls `evalMetroNoHandling` with `cache: false`. As a result, each request evaluates the route bundle again. A file change also clears the bundle cache.
2. `expo` imports `expo-modules-core`. `expo-modules-core/build/EventEmitter.js` starts with `'use client'`. In a `react-server` bundle, a `'use client'` module pulls in `react-server-dom-webpack/server.edge`.
3. In development, that module calls `patchConsole(console, …)` for each console method when it loads. Each wrapper calls the method that was there before it.
4. Each evaluation adds one more wrapper to the chain. The chain keeps every evaluated copy of the bundle alive, and with it the `Module` and the source map that Node parsed for it. Heap snapshot retainer path: `console.info` → `wrapperMethod` → `originalMethod` → `wrapperMethod` → … → `Module`.

## A fix that works here

Save the console before the evaluation in `MetroBundlerDevServer.ssrImportApiRoute`, and put it back after the evaluation (`@expo/cli/build/src/start/server/metro/MetroBundlerDevServer.js`):

```js
const consoleBeforeEval = Object.getOwnPropertyDescriptors(console);
try {
    return (0, _getStaticRenderFunctions.evalMetroNoHandling)(this.projectRoot, apiRoute.src, apiRoute.filename, apiRoute.map);
} finally {
    Object.defineProperties(console, consoleBeforeEval);
}
```

With this change, 300 requests to `/api/leak` move the heap from 60 MB to 69 MB.

The restore is in `ssrImportApiRoute` and not in `evalMetroNoHandling`, because `evalMetroNoHandling` also loads the RSC renderer one time. On that path, React's console forwarding is intended. Caching the evaluated route module also prevents the leak while no files change (expo/expo#49259 tried this, and it was closed without a merge). But a file change still evaluates the route again.
