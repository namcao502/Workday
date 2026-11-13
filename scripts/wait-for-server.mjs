// `npm run dev`: hold the Vite client until the dev server answers, so the proxy logs no ECONNREFUSED at startup.
// Gives up after a minute and lets Vite start anyway; a server that never comes up shows its own error.
const port = process.env.WORKDAY_PORT ?? '4870'
const url = `http://127.0.0.1:${port}/api/health`
const deadline = Date.now() + 60_000

while (Date.now() < deadline) {
  try {
    const response = await fetch(url)
    if (response.ok) {
      process.exit(0)
    }
  } catch {
    // not listening yet
  }
  await new Promise((resolve) => setTimeout(resolve, 300))
}
console.log(`wait-for-server: no answer from ${url}, starting Vite anyway`)
