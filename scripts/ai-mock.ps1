# Helpers for scripts that run browser flows against the running backend: keep the backend on the mock AI provider for the run and
# restore it afterwards, without editing .env (D-086). Dot source it and use try/finally:
#   . (Join-Path $PSScriptRoot 'ai-mock.ps1')
#   Enter-AiMock
#   try { ... } finally { Exit-AiMock }
# Run inside with-wsl.ps1 so Docker stays up. Never prints an environment value.
function Invoke-AiMockScript([string]$Action) {
    $root = Split-Path -Parent $PSScriptRoot
    $distro = if ($env:QAP_WSL_DISTRO) { $env:QAP_WSL_DISTRO } else { 'Ubuntu' }
    $drive = $root.Substring(0, 1).ToLower()
    $wslRoot = '/mnt/' + $drive + ($root.Substring(2) -replace '\\', '/')
    wsl.exe -d $distro --cd $wslRoot --exec sh scripts/ai-mock.sh $Action
    return $LASTEXITCODE
}

function Enter-AiMock {
    $code = Invoke-AiMockScript 'on'
    if ($code -ne 0) { throw "ai-mock: the backend could not be put on the mock AI provider (exit $code)" }
}

function Exit-AiMock {
    Invoke-AiMockScript 'off' | Out-Null
}
