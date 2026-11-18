$chrome = Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--headless=new', '--remote-debugging-port=9222', '--user-data-dir=C:\Users\BHIMANI\AppData\Local\Temp\chrome_verify_p3', '--disable-gpu', 'about:blank' -PassThru
Start-Sleep -Seconds 2
try {
  node 'E:\7ANIME_NEW\backend\tests\verify-phase3-browser.mjs'
} finally {
  if ($chrome -and !$chrome.HasExited) {
    Stop-Process -Id $chrome.Id -Force -ErrorAction SilentlyContinue
  }
}
