# 筆電（RTX 4060）：只做自我對弈，開 4 個主控（各 8 個 Node 行程）把 CPU 與 GPU 用滿；
# 每 5 分鐘把下完的棋局傳給 DGX、並抓 DGX 最新權重
#   powershell -File train\start_laptop.ps1
# 要停：Get-Process python,node | Stop-Process
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:PYTHONIOENCODING = 'utf8'
$env:CONC_MULT = '2'   # 每個行程同時下兩倍局數，GPU 每次算更大一批
$env:NODE_MEM = '384'; $env:NODE_MEM_BG = '1024'   # 筆電 32 GB：限制每個行程的記憶體
foreach ($i in 1..4) {
  Start-Process -WindowStyle Hidden -FilePath python -ArgumentList "-u train/selfplay.py --mode worker --procs 8 --remote dgx:projects/chess-ai/repo/runs --out runs_laptop$i" -RedirectStandardOutput "runs_laptop$i.log" -RedirectStandardError "runs_laptop$i.err"
}
"筆電自我對弈已開始（log：runs_laptop1～4.log）"
