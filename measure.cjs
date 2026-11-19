// Preloaded into `expo start`: prints the CLI's heap after a forced GC every 10 s.
const { isMainThread } = require('node:worker_threads');
if (isMainThread && process.argv.some((arg) => arg.includes('expo'))) {
  const start = Date.now();
  setInterval(() => {
    global.gc();
    const { heapUsed } = process.memoryUsage();
    console.log(`[heap] ${Math.round((Date.now() - start) / 1000)}s ${Math.round(heapUsed / 1e6)} MB`);
  }, 10_000).unref();
}
