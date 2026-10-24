[CmdletBinding()]
param([switch]$IncludeInventory)

$ErrorActionPreference = 'Stop'
$helperPath = Join-Path $PSScriptRoot 'dist/vortex-window-helper.exe'
if (-not (Test-Path -LiteralPath $helperPath)) { throw 'Build the helper first with native/windows/build.ps1.' }

function Assert-Failure {
    param([string[]]$HelperArguments, [string]$ExpectedCode)
    $lines = & $helperPath @HelperArguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) { throw 'Expected a failure exit code.' }
    $result = ($lines -join "`n") | ConvertFrom-Json
    if ($result.ok -ne $false -or $result.code -ne $ExpectedCode) {
        throw "Unexpected error response; expected $ExpectedCode."
    }
}

Assert-Failure -HelperArguments @() -ExpectedCode 'VALIDATION_ERROR'
Assert-Failure -HelperArguments @('unknown') -ExpectedCode 'VALIDATION_ERROR'
Assert-Failure -HelperArguments @('list', 'extra') -ExpectedCode 'VALIDATION_ERROR'
Assert-Failure -HelperArguments @('focus', '0', '1', '2026-01-01T00:00:00.000Z') -ExpectedCode 'VALIDATION_ERROR'
Assert-Failure -HelperArguments @('focus', '1', '-1', '2026-01-01T00:00:00.000Z') -ExpectedCode 'VALIDATION_ERROR'
Assert-Failure -HelperArguments @('focus', '1', '1', 'not-a-timestamp') -ExpectedCode 'VALIDATION_ERROR'
Assert-Failure -HelperArguments @('focus', '9223372036854775808', '1', '2026-01-01T00:00:00.000Z') -ExpectedCode 'VALIDATION_ERROR'

if ($IncludeInventory) {
    $lines = & $helperPath list
    if ($LASTEXITCODE -ne 0) { throw 'Inventory smoke check failed.' }
    $inventory = ($lines -join "`n") | ConvertFrom-Json
    if ($inventory.ok -ne $true -or $null -eq $inventory.windows) { throw 'Inventory shape is invalid.' }
    foreach ($entry in $inventory.windows) {
        if ($entry.handle -notmatch '^\d+$' -or $entry.processId -le 0 -or
            $entry.processStartedAt -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' -or
            [string]::IsNullOrWhiteSpace($entry.title) -or [string]::IsNullOrWhiteSpace($entry.appName)) {
            throw 'Inventory binding metadata is invalid.'
        }
    }
    # Exercise stale-identity validation against a real window without invoking focus.
    if ($inventory.windows.Count -gt 0) {
        $entry = $inventory.windows[0]
        $wrongPid = if ($entry.processId -eq 1) { '2' } else { '1' }
        Assert-Failure -HelperArguments @('focus', $entry.handle, $wrongPid, $entry.processStartedAt) -ExpectedCode 'STALE_STATE'
        Assert-Failure -HelperArguments @('focus', $entry.handle, "$($entry.processId)", '2000-01-01T00:00:00.000Z') -ExpectedCode 'STALE_STATE'
    }
    Write-Output "Read-only Windows inventory verified: $($inventory.windows.Count) visible supported windows. No window was focused."
}

Write-Output 'Native Windows helper validation checks passed.'
