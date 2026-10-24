[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PSScriptRoot 'WindowHelper.cs'
$outputDirectory = Join-Path $PSScriptRoot 'dist'
$outputPath = Join-Path $outputDirectory 'vortex-window-helper.exe'
$framework64 = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$framework32 = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319'
$frameworkDirectory = if (Test-Path -LiteralPath (Join-Path $framework64 'csc.exe')) { $framework64 } else { $framework32 }
$compilerPath = Join-Path $frameworkDirectory 'csc.exe'
$serializationAssembly = Join-Path $frameworkDirectory 'System.Web.Extensions.dll'

if (-not (Test-Path -LiteralPath $compilerPath) -or -not (Test-Path -LiteralPath $serializationAssembly)) {
    throw 'The Windows .NET Framework C# compiler and System.Web.Extensions are required. No compiler was found; no SDK was installed or system setting changed.'
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
& $compilerPath /nologo /target:exe /optimize+ "/out:$outputPath" "/reference:$serializationAssembly" $sourcePath
if ($LASTEXITCODE -ne 0) { throw "Windows helper compilation failed with exit code $LASTEXITCODE." }
Write-Output "Built native/windows/dist/vortex-window-helper.exe"
