# 仕掛け道中 - インターネット公開スクリプト
# 使い方: PowerShellで実行 → 表示されたURLを友達に共有

param(
    [string]$Method = "cloudflare"  # "cloudflare" or "ngrok"
)

# サーバーが既に起動中か確認
$existing = netstat -ano | findstr ":3000 " | Select-String "LISTENING"
if (-not $existing) {
    Write-Host "サーバーを起動中..." -ForegroundColor Cyan
    Start-Process -FilePath "node" -ArgumentList "server/index.js" -WindowStyle Minimized
    Start-Sleep -Seconds 2
    Write-Host "サーバー起動完了 (http://localhost:3000)" -ForegroundColor Green
} else {
    Write-Host "サーバーは既に起動中です" -ForegroundColor Yellow
}

Write-Host ""

if ($Method -eq "ngrok") {
    # ngrok を使う場合 (要: https://ngrok.com でアカウント作成 + authtoken設定)
    Write-Host "ngrok でトンネルを開始中..." -ForegroundColor Cyan
    Write-Host "表示された 'Forwarding' のURLを友達に共有してください" -ForegroundColor Yellow
    Write-Host ""
    ngrok http 3000
} else {
    # cloudflared を使う場合 (アカウント不要)
    $cf = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cf) {
        Write-Host "Cloudflare Tunnel でトンネルを開始中..." -ForegroundColor Cyan
        Write-Host "表示された trycloudflare.com のURLを友達に共有してください" -ForegroundColor Yellow
        Write-Host ""
        cloudflared tunnel --url http://localhost:3000
    } else {
        Write-Host "cloudflared が見つかりません。" -ForegroundColor Red
        Write-Host ""
        Write-Host "【インストール方法】" -ForegroundColor White
        Write-Host "winget install Cloudflare.cloudflared" -ForegroundColor Cyan
        Write-Host ""
        Write-Host 'または ngrok を使う場合:' -ForegroundColor White
        Write-Host '  1. https://ngrok.com でアカウント作成'
        Write-Host '  2. ngrok をインストール: winget install ngrok'
        Write-Host '  3. ngrok config add-authtoken [YOUR_TOKEN]'
        Write-Host '  4. このスクリプトを -Method ngrok で再実行'
        Write-Host '     例: .\start-public.ps1 -Method ngrok'
    }
}
