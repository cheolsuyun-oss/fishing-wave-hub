$file = "D:\fishing-app\src\routes\points\`$id.tsx"
$c = Get-Content $file -Raw -Encoding UTF8

$c = $c -replace 'import \{ getPoint, RISK_META, type FishingPoint \} from "@/lib/points";', 'import { getPoint, RISK_META, type FishingPoint, type RiskLevel } from "@/lib/points";'

$c = $c -replace 'import \{ getVillageForecast \} from "@/lib/forecast\.functions";', "import { getVillageForecast } from ""@/lib/forecast.functions"";`nimport { getMulddae } from ""@/lib/moonAge"";"

$old = "  const windValue = fcst?.wsd != null ? fcst.wsd : point.windSpeed;`r`n  const waveValue = fcst?.wav != null ? fcst.wav : point.waveHeight;"
$new = "  const windValue = fcst?.wsd != null ? fcst.wsd : point.windSpeed;`r`n  const waveValue = fcst?.wav != null ? fcst.wav : point.waveHeight;`r`n  const wl: RiskLevel = windValue > 10 ? ""danger"" : windValue > 5.6 ? ""caution"" : ""safe"";`r`n  const wvl: RiskLevel = waveValue > 1.4 ? ""danger"" : waveValue > 0.5 ? ""caution"" : ""safe"";`r`n  const rl: RiskLevel = firstRain > 60 ? ""danger"" : firstRain > 30 ? ""caution"" : ""safe"";`r`n  const tl: RiskLevel = (firstTemp <= 4 || firstTemp >= 31) ? ""danger"" : (firstTemp <= 14 || firstTemp >= 26) ? ""caution"" : ""safe"";`r`n  const overallLevel: RiskLevel = [wl,wvl,rl,tl].includes(""danger"") ? ""danger"" : [wl,wvl,rl,tl].includes(""caution"") ? ""caution"" : ""safe"";`r`n  const risk = RISK_META[overallLevel];"
$c = $c.Replace($old, $new)

$c = $c -replace "`r`n  const risk = RISK_META\[point\.risk\];", ""

$c = $c -replace 'label="풍속" value=\{`\$\{windValue\}`\} unit="m/s" />', 'label="풍속" value={`${windValue}`} unit="m/s" level={wl} />'
$c = $c -replace 'label="파고" value=\{`\$\{waveValue\}`\} unit="m" />', 'label="파고" value={`${waveValue}`} unit="m" level={wvl} />'
$c = $c -replace 'label="강수" value=\{`\$\{firstRain\}`\} unit="%" />', 'label="강수" value={`${firstRain}`} unit="%" level={rl} />'
$c = $c -replace 'label="기온" value=\{`\$\{firstTemp\}`\} unit="°" />', 'label="기온" value={`${firstTemp}`} unit="°" level={tl} />'

$c = $c -replace '\{point\.tide\}', '{getMulddae()}'

$c = $c -replace '  unit: string;', "  unit: string;`r`n  level: RiskLevel;"
$c = $c -replace 'className="rounded-xl bg-muted border border-border py-2\.5"', 'className={`rounded-xl border py-2.5 ${level === "danger" ? "bg-red-50 border-red-200" : level === "caution" ? "bg-amber-50 border-amber-200" : "bg-sky-50 border-sky-200"}`}'
$c = $c -replace 'className="flex items-center justify-center text-primary mb-1"', 'className={`flex items-center justify-center mb-1 ${level === "danger" ? "text-red-500" : level === "caution" ? "text-amber-500" : "text-sky-500"}`}'

[System.IO.File]::WriteAllText($file, $c, [System.Text.Encoding]::UTF8)
Write-Host "완료"