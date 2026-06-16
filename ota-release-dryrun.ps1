# ota-release-dryrun.ps1
# Dry run validator for ota-release.ps1
# Location: C:\Projects\03-BusinessApps\leadlens\ota-release-dryrun.ps1
#
# USAGE:
#   powershell -ExecutionPolicy Bypass -File .\ota-release-dryrun.ps1 -Beta "BETA-51" -Message "Fix map clustering"

param(
  [string]$Beta    = "",
  [string]$Message = ""
)

Set-Location $PSScriptRoot

$script:errors = 0
$script:warns  = 0

function Pass($msg)    { Write-Host "  [PASS] $msg" -ForegroundColor Green }
function Fail($msg)    { Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:errors++ }
function Warn($msg)    { Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:warns++ }
function Skip($msg)    { Write-Host "  [SKIP] $msg" -ForegroundColor Gray }
function Section($msg) { Write-Host ""; Write-Host "-- $msg" -ForegroundColor Cyan }

if (-not $Beta)    { $Beta    = Read-Host "Beta version (e.g. BETA-51)" }
if (-not $Message) { $Message = Read-Host "Commit message" }

$BetaNum       = [int]($Beta -replace "[^0-9]", "")
$VersionString = "2.0.$BetaNum"
$CommitMsg     = "${Beta}: ${Message}"

Write-Host ""
Write-Host "========================================"
Write-Host " LeadLens OTA Release -- DRY RUN"
Write-Host " $CommitMsg"
Write-Host " Version: $VersionString"
Write-Host "========================================"

# -- 1. Environment
Section "1. Environment"

if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeVer = node --version
  Pass "Node.js found: $nodeVer"
} else {
  Fail "Node.js not found"
}

if (Get-Command git -ErrorAction SilentlyContinue) {
  $gitVer = git --version
  Pass "Git found: $gitVer"
} else {
  Fail "Git not found"
}

if (Get-Command npx -ErrorAction SilentlyContinue) {
  Pass "npx found"
} else {
  Fail "npx not found"
}

$easCheck = npx eas-cli --version 2>&1
if ($LASTEXITCODE -eq 0) {
  Pass "eas-cli found: $easCheck"
} else {
  Warn "eas-cli not found or not logged in. Run: npm install -g eas-cli then: eas login"
}

if ($env:EXPO_TOKEN) {
  Pass "EXPO_TOKEN is set"
} else {
  Warn "EXPO_TOKEN not set -- EAS commands may require interactive login"
}

# -- 2. Git State
Section "2. Git State"

$branch = git rev-parse --abbrev-ref HEAD 2>&1
if ($branch -eq "main") {
  Pass "On branch: main"
} else {
  Warn "Not on main branch -- currently on: $branch"
}

$remoteCheck = git remote get-url origin 2>&1
if ($LASTEXITCODE -eq 0) {
  Pass "Remote origin: $remoteCheck"
} else {
  Fail "No remote origin configured"
}

$gitStatus = git status --porcelain 2>&1
if ($gitStatus) {
  Pass "Uncommitted changes detected (will be committed)"
  $gitStatus -split "`n" | Where-Object { $_ } | ForEach-Object {
    Write-Host "     $_" -ForegroundColor Gray
  }
} else {
  Warn "No uncommitted changes found -- nothing to release"
}

# -- 3. Native File Guard
Section "3. Native File Guard (OTA safety check)"

$dirty     = git diff --name-only HEAD 2>&1
$staged    = git diff --cached --name-only 2>&1
$protected = @("app.json", "package.json", "package-lock.json")
$violations = @()

foreach ($file in $protected) {
  if ($dirty -contains $file -or $staged -contains $file) {
    $violations += $file
  }
}

if ($violations.Count -gt 0) {
  foreach ($v in $violations) {
    Fail "Protected file modified: $v"
  }
  Write-Host "     Revert with: git checkout -- app.json package.json" -ForegroundColor Red
} else {
  Pass "No protected files modified (app.json, package.json, package-lock.json)"
}

# -- 4. Required Files
Section "4. Required Files"

$requiredFiles = @("app.json", "package.json", "eas.json", "release.js", "scripts/generate-changelog.js")

foreach ($f in $requiredFiles) {
  $fullPath = Join-Path $PSScriptRoot $f
  if (Test-Path $fullPath) {
    Pass "Found: $f"
  } else {
    Fail "Missing: $f"
  }
}

$changelogPath = Join-Path $PSScriptRoot "CHANGELOG.md"
if (Test-Path $changelogPath) {
  Pass "Found: CHANGELOG.md"
} else {
  Warn "CHANGELOG.md not found -- will be created on first run"
}

# -- 5. app.json Validation
Section "5. app.json Validation"

$appJsonPath = Join-Path $PSScriptRoot "app.json"
if (Test-Path $appJsonPath) {
  $appJsonRaw = Get-Content $appJsonPath -Raw
  $appJson    = $appJsonRaw | ConvertFrom-Json

  $currentVersion     = $appJson.expo.version
  $currentVersionCode = $appJson.expo.android.versionCode
  $currentBetaBuild   = $appJson.expo.extra.betaBuild
  $runtimeVersion     = $appJson.expo.runtimeVersion

  Pass "Current version: $currentVersion"
  Pass "Current versionCode: $currentVersionCode"
  Pass "Current betaBuild: $currentBetaBuild"

  if ($currentVersionCode -eq $currentBetaBuild) {
    Pass "versionCode and betaBuild are in sync"
  } else {
    Warn "versionCode ($currentVersionCode) and betaBuild ($currentBetaBuild) are out of sync"
  }

  if ($runtimeVersion) {
    Pass "runtimeVersion: $runtimeVersion"
  } else {
    Warn "runtimeVersion not set in app.json"
  }
} else {
  Fail "app.json not found -- cannot validate"
}

# -- 6. eas.json Validation
Section "6. eas.json Validation"

$easJsonPath = Join-Path $PSScriptRoot "eas.json"
if (Test-Path $easJsonPath) {
  $easJson = Get-Content $easJsonPath -Raw | ConvertFrom-Json

  if ($easJson.updates.production) {
    Pass "EAS production update channel configured"
  } else {
    Warn "No production channel found in eas.json updates"
  }

  if ($easJson.build.production) {
    Pass "EAS production build profile configured"
    $buildType = $easJson.build.production.android.buildType
    if ($buildType -eq "apk") {
      Pass "Build type: APK (correct)"
    } else {
      Warn "Build type is '$buildType' -- testers need APK not AAB"
    }
  } else {
    Warn "No production build profile found in eas.json"
  }
} else {
  Fail "eas.json not found"
}

# -- 7. Supabase + Claude API Key
Section "7. Supabase + Claude API Key"

if ($env:LEADLENS_SERVICE_ROLE_KEY) {
  Pass "LEADLENS_SERVICE_ROLE_KEY is set"

  $tempScript = Join-Path $env:TEMP "ll_check_key.js"
  $nodeScript = @'
var https = require('https');
var key = process.env.LEADLENS_SERVICE_ROLE_KEY;
var options = {
  hostname: 'qkbvwryucaakkkqaqvka.supabase.co',
  path: '/rest/v1/app_config?select=claude_api_key&limit=1',
  method: 'GET',
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
};
var req = https.request(options, function(res) {
  var d = '';
  res.on('data', function(c) { d += c; });
  res.on('end', function() {
    try {
      var rows = JSON.parse(d);
      process.stdout.write(rows[0] && rows[0].claude_api_key ? 'FOUND' : 'MISSING');
    } catch(e) { process.stdout.write('ERROR'); }
  });
});
req.on('error', function() { process.stdout.write('ERROR'); });
req.end();
'@
  Set-Content -Path $tempScript -Value $nodeScript -Encoding UTF8
  $keyResult = node $tempScript 2>&1
  Remove-Item $tempScript -ErrorAction SilentlyContinue

  if ($keyResult -eq "FOUND") {
    Pass "claude_api_key found in Supabase app_config"
  } elseif ($keyResult -eq "MISSING") {
    Fail "claude_api_key missing from Supabase app_config"
  } else {
    Warn "Could not verify claude_api_key -- Supabase may be unreachable"
  }
} else {
  Warn "LEADLENS_SERVICE_ROLE_KEY not set"
  if ($env:CLAUDE_API_KEY) {
    Pass "CLAUDE_API_KEY env var set as fallback"
  } else {
    Fail "Neither LEADLENS_SERVICE_ROLE_KEY nor CLAUDE_API_KEY is set -- changelog generation will fail"
  }
}

# -- 8-11. Dry run steps
Section "8. Changelog Generator (dry run)"
Skip "Would run: node scripts/generate-changelog.js $Beta $VersionString ota"
Write-Host "     Would prepend entry to CHANGELOG.md" -ForegroundColor Gray

Section "9. Git Commit (dry run)"
Skip "Would run: git add -A"
Skip "Would run: git commit -m `"$CommitMsg`""
Skip "Would run: git push origin main"

Section "10. EAS OTA Update (dry run)"
Skip "Would run: npx eas-cli update --branch production --message `"$CommitMsg`" --non-interactive"

Section "11. Tester Notifications (dry run)"
if (Test-Path (Join-Path $PSScriptRoot "release.js")) {
  Skip "Would run: node release.js"
} else {
  Fail "release.js not found"
}

# -- Summary
Write-Host ""
Write-Host "========================================"
Write-Host " DRY RUN COMPLETE"
if ($script:errors -gt 0) {
  Write-Host " $($script:errors) error(s) -- fix before running release" -ForegroundColor Red
} elseif ($script:warns -gt 0) {
  Write-Host " 0 errors, $($script:warns) warning(s) -- review before release" -ForegroundColor Yellow
} else {
  Write-Host " All checks passed. Safe to run ota-release.ps1" -ForegroundColor Green
}
Write-Host ""
if ($script:errors -eq 0) {
  Write-Host " To release:"
  Write-Host "   .\ota-release.ps1 -Beta `"$Beta`" -Message `"$Message`""
}
Write-Host "========================================"
