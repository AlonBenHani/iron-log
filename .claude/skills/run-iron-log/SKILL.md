---
name: run-iron-log
description: Build, run, and drive Iron Log. Use when asked to start Iron Log, serve it, take a screenshot of the app, smoke-test it, or interact with the running PWA.
---

Iron Log is a dependency-free static PWA (plain `<script>` tags, `localStorage`,
no build step). There is nothing to compile and no package manager. To *drive*
it you need a browser: this skill ships a Windows-native harness — a PowerShell
static server plus a Chrome DevTools Protocol client — because this machine has
no Node, no Python (only the Windows Store stub), and no `chromium-cli`.

Primary agent path: run `.claude/skills/run-iron-log/smoke.ps1`. It launches the
app for real, logs a workout through the UI, verifies the Today/Progress screens
update, and screenshots each step.

All paths below are relative to the repo root.

## Prerequisites

- Windows PowerShell 5.1 (built in — `powershell.exe`).
- Google Chrome **or** Microsoft Edge installed in a standard location. The
  scripts auto-detect `%ProgramFiles%\Google\Chrome\Application\chrome.exe`,
  the x86 path, `%LOCALAPPDATA%`, and the two Edge paths.

No `apt-get` / `npm install` / build step. `git clone` and go.

## Run (agent path)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/run-iron-log/smoke.ps1
```

What it does, in order:

1. Starts `serve.ps1` (a `System.Net.HttpListener` static server) on
   `http://localhost:8080/` if that port is free.
2. Launches headless Chrome/Edge (`--headless=new`) with a throwaway profile
   and `--remote-debugging-port=9222`.
3. Connects over CDP (raw `ClientWebSocket`, see `cdp-lib.ps1`) and runs:
   load app → `localStorage.clear()` → log a Bench Press session (2 sets,
   "Hard" feeling) → assert Today shows "1 / 3" + "1 exercise logged today" →
   open the Progress detail, assert the canvas chart and history row render →
   tap the Rest Timer, assert the picker opens → assert zero uncaught JS
   exceptions.
4. Screenshots each step to `.claude/skills/run-iron-log/shots/`
   (`01-today.png` … `06-rest-timer.png`).
5. Tears down the server + browser it started.

Exit code 0 and `SMOKE PASSED` on success; exit 1 and `SMOKE FAILED (...)`
listing the failed checks otherwise. Look at the screenshots — a blank frame
means the app did not actually paint.

### Iterating / driving it yourself

```powershell
# leave the server (:8080) and Chrome (:9222) up after the run
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/run-iron-log/smoke.ps1 -Keep

# then, in a PowerShell session:
. .claude/skills/run-iron-log/cdp-lib.ps1
Connect-CDP
Eval "location.hash = '#/progress'; true"
Eval "document.body.innerText.slice(0,300)"
Shot "$env:TEMP\iron-log\poke.png"
Disconnect-CDP
```

`cdp-lib.ps1` helpers: `Connect-CDP [-Port 9222]`, `Eval <js>` (returns the
value, or `"JS-ERROR: ..."`), `Wait-For <js-bool> [-TimeoutMs]`, `Shot <path>`,
`Get-CDPExceptions`, `Disconnect-CDP`. `Send-CDP <method> <params-hashtable>`
for anything else (`Page.navigate`, `DOM.*`, …).

Serve without a browser (e.g. to open it in a real Chrome window yourself):

```powershell
Start-Process powershell -WindowStyle Hidden -ArgumentList `
  '-NoProfile','-File','.claude/skills/run-iron-log/serve.ps1'
# http://localhost:8080/
```

## Run (human path)

Any static server works; the README suggests `python -m http.server 8080`, but
this box has only the Windows Store python stub, so use `serve.ps1` above (or
the live site at <https://alonbenhani.github.io/iron-log/>).

## Test

No test suite in the repo. `smoke.ps1` is the closest thing — treat a passing
run as the regression check.

## App structure (for writing assertions)

- Routes are hash-based: `#/log`, `#/progress`, and detail routes
  `#/log/<id>` / `#/progress/<id>`. Everything else (`#/today`, `#/lifts`, …)
  falls back to the Today view — do **not** assert on those as distinct routes.
- Picker rows: `.exercise-card` (role=button; `.click()` works). They're seeded
  with a default exercise list, so `Bench Press` exists on a fresh
  `localStorage`.
- Log-entry screen: `.set-row` (3 are pre-rendered), `.w-input` / `.r-input`
  number fields, `.add-set-btn`, `.feeling-btn` (`.active` once chosen),
  `.primary-btn` = "Save exercise". Save routes back to `#/today`.
- State lives entirely in `localStorage` under the `Store` global — reset with
  `localStorage.clear()` then reload.

## Gotchas

- **`.w-input` / `.r-input` are plain inputs but the app reads `.value`
  directly on save.** Setting `el.value` is enough for the save to pick it up,
  but use the native-setter + `input` event trick (see `smoke.ps1`) so the
  prefill listeners also fire — matches how a user would type.
- **3 set rows are pre-rendered and pre-filled** (`80 × 5`). Untouched rows are
  saved as real sets, so a "2-set" workout you type actually persists 4 sets.
  That's app behaviour, not a harness bug — account for it in assertions
  (the history string is `80kg×5, 82.5kg×5, 80kg×5, 80kg×5`).
- **PRs tile stays `0` after the first-ever session** — a PR needs a prior
  session to beat. Don't assert PRs ≥ 1 on a fresh store.
- **Service worker (`sw.js`) registers only over http://, not file://.** Always
  go through `serve.ps1`; opening `index.html` as a `file://` URL half-works
  and skips the SW entirely.
- **`Send-CDP` is synchronous and single-flight** — it blocks reading the
  socket until the matching response id comes back, buffering
  `Runtime.exceptionThrown` events along the way. Don't call it re-entrantly.
- **The `chrome.exe` process tree**: the launcher process may exit immediately
  and hand off to a child. `smoke.ps1` kills by `--user-data-dir=<temp profile>`
  match, not PID, so a `-Keep` run leaves exactly that profile's Chrome to
  clean up (`Get-CimInstance Win32_Process` filtered on the profile path).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `No Chrome or Edge found.` | Install Chrome, or edit the `$chrome` path list at the top of `smoke.ps1`. |
| `CDP: no page target on port 9222` | A previous headless Chrome is wedged. `Get-Process chrome \| Where-Object { $_.Path -like '*Chrome*' }` and kill the one with `--user-data-dir` pointing at `%TEMP%\iron-log-smoke-profile`. |
| `server did not come up on :8080` | Port already taken. Pass `-Port 8090` (and `-CdpPort` if 9222 is busy too). |
| Screenshots are blank / all-dark with no tiles | The static server isn't serving `js/` — check `serve.ps1`'s `$Root` resolved to the repo root (it walks three parents up from the skill dir). |
| `SMOKE FAILED (history row shows the session)` | The seeded exercise list changed; update the `Bench Press` name in `smoke.ps1` step 2. |

## Note: this skill is gitignored

`.gitignore` excludes `.claude/`, so these files are local-only. To version the
harness, add an exception:

```
!.claude/skills/
```
