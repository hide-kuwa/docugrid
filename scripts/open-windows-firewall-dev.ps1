# Allow DocuGrid dev servers on the local network (run as Administrator).
# Usage: npm run dev:lan:firewall

$ErrorActionPreference = "Stop"

function Add-DevFirewallRule {
    param(
        [string]$Name,
        [int]$Port
    )
    $existing = Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Already exists: $Name (TCP $Port)"
        return
    }
    New-NetFirewallRule `
        -DisplayName $Name `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $Port `
        -Profile Private,Domain | Out-Null
    Write-Host "Added: $Name (TCP $Port)"
}

Add-DevFirewallRule -Name "DocuGrid Dev Frontend" -Port 3000
Add-DevFirewallRule -Name "DocuGrid Dev Backend" -Port 8000

Write-Host ""
Write-Host "Done. Re-run: npm run dev:lan"
