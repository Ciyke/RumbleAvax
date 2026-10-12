/**
 * Render smoke test.
 *
 * `vite build` proves the modules parse and their imports resolve. It does not
 * prove React can render them — a bad hook call, a destructure of undefined, or
 * a bigint hitting string interpolation all build fine and blow up in the
 * browser. This actually renders each app and fails loudly if one throws.
 *
 * Effects do not run under renderToString, so nothing here touches the network
 * or a wallet. It checks the first paint: the state every visitor sees before
 * anything async resolves.
 *
 * Run: node smoke-render.mjs
 */
import { JSDOM } from 'jsdom'
import * as esbuild from 'esbuild'
import { renderToString } from 'react-dom/server'
import React from 'react'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const TMP = path.join(process.cwd(), '.smoke-tmp')
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })

// ── DOM globals, installed before any module is imported ────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
})

globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.localStorage = dom.window.localStorage
globalThis.HTMLElement = dom.window.HTMLElement

// Node 25 defines `navigator` as a getter-only global, so plain assignment
// throws. Redefine it instead.
Object.defineProperty(globalThis, 'navigator', {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
})

// jsdom has no matchMedia; useTheme reads it during its useState initializer.
dom.window.matchMedia = (query) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})

// ── Bundle each entry for node ──────────────────────────────────────────────
async function load(entry) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    jsx: 'automatic',
    mainFields: ['module', 'main'],
    conditions: ['import', 'module', 'default'],
    external: ['react', 'react-dom', 'react/jsx-runtime', 'ethers'],
    loader: { '.css': 'empty', '.svg': 'empty' },
    define: {
      // Vite's import.meta.env is not available outside Vite. Empty addresses
      // are the realistic first-load case anyway: the app must survive them.
      'import.meta.env.VITE_CHAIN_ID': '"43114"',
      'import.meta.env.VITE_GAME_ENGINE_ADDRESS': '""',
      'import.meta.env.VITE_INGREDIENT_NFT_ADDRESS': '""',
      'import.meta.env.VITE_POTION_NFT_ADDRESS': '""',
      'import.meta.env.VITE_PREDICTION_MARKET_ADDRESS': '""',
    },
  })

  // Written to a real file rather than a data: URL — bare specifiers like
  // "react" only resolve from a path inside the project.
  const file = path.join(TMP, `${path.basename(entry)}.mjs`)
  fs.writeFileSync(file, result.outputFiles[0].text)
  return import(pathToFileURL(file).href)
}

const CASES = [
  { name: 'Landing', entry: 'src/Landing.jsx' },
  { name: 'HuntApp', entry: 'src/hunt/HuntApp.jsx' },
  { name: 'BetApp', entry: 'src/bet/BetApp.jsx' },
]

let failed = 0

for (const { name, entry } of CASES) {
  try {
    const mod = await load(entry)
    const Component = mod.default
    if (typeof Component !== 'function') {
      throw new Error(`default export is ${typeof Component}, expected a component`)
    }

    const html = renderToString(React.createElement(Component))

    if (!html || html.length < 50) {
      throw new Error(`rendered only ${html.length} chars — looks empty`)
    }

    console.log(`  PASS  ${name.padEnd(9)} ${html.length} chars`)

    // The unconfigured warning must be visible, or a misconfigured deploy would
    // look fine while silently doing nothing.
    if (name !== 'Landing' && !/not set/i.test(html)) {
      console.log(`        note: no "not set" warning found with empty addresses`)
    }
  } catch (err) {
    failed++
    console.error(`  FAIL  ${name}`)
    console.error(`        ${err.message.split('\n')[0]}`)
  }
}

fs.rmSync(TMP, { recursive: true, force: true })

console.log('')
if (failed) {
  console.error(`${failed} of ${CASES.length} failed to render.`)
  process.exit(1)
}
console.log(`All ${CASES.length} apps render.`)
