# Deploy the Kriky server to Vercel (the cloud the machine talks to).
#
#   1) Run this once with -Login, it opens a browser so you can sign in.
#   2) Run it again with no arguments to push your changes.
#
#   powershell -ExecutionPolicy Bypass -File deploy.ps1 -Login
#   powershell -ExecutionPolicy Bypass -File deploy.ps1
#   powershell -ExecutionPolicy Bypass -File deploy.ps1 -Prod
#
# Nothing has to be uploaded to the handheld when you add a game or change an
# answer. Only the machine firmware needs upload_lite.ps1.

$ErrorActionPreference = "Stop"
$src = $PSScriptRoot

Write-Host "Sending: $src"
Get-ChildItem $src -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\(\.vercel|node_modules|__pycache__)\\' -and $_.Extension -ne ".pyc" } |
    ForEach-Object { Write-Host ("  " + $_.FullName.Substring($src.Length + 1)) }

if ($args -contains "-Login") {
    Write-Host ""
    Write-Host "Logging in to Vercel, a browser will open..."
    npx --yes vercel@latest login
}

$target = "vercel"
if ($args -contains "-Prod") { $target = "vercel --prod" }

Write-Host ""
Write-Host "Deploying to https://krikymachine.vercel.app"
npx --yes vercel@latest $target --yes

Write-Host ""
Write-Host "Done. Check it:"
Write-Host "  npx --yes vercel@latest ls"
Write-Host "  https://krikymachine.vercel.app/games"
Write-Host "  https://krikymachine.vercel.app/game?id=tunnel"
