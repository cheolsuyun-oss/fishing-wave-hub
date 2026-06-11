import re

path = r'D:\fishing-app\src\routes\points\$id.tsx'

with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('import { getPoint, RISK_META, type FishingPoint } from "@/lib/points";', 'import { getPoint, RISK_META, type FishingPoint, type RiskLevel } from "@/lib/points";')
c = c.replace('import { getVillageForecast } from "@/lib/forecast.functions";', 'import { getVillageForecast } from "@/lib/forecast.functions";\nimport { getMulddae } from "@/lib/moonAge";')
c = c.replace('const windValue = fcst?.wsd != null ? fcst.wsd : point.windSpeed;\n  const waveValue = fcst?.wav != null ? fcst.wav : point.waveHeight;', 'const windValue = fcst?.wsd != null ? fcst.wsd : point.windSpeed;\n  const waveValue = fcst?.wav != null ? fcst.wav : point.waveHeight;\n  const wl: RiskLevel = windValue > 10 ? "danger" : windValue > 5.6 ? "caution" : "safe";\n  const wvl: RiskLevel = waveValue > 1.4 ? "danger" : waveValue > 0.5 ? "caution" : "safe";\n  const rl: RiskLevel = firstRain > 60 ? "danger" : firstRain > 30 ? "caution" : "safe";\n  const tl: RiskLevel = (firstTemp <= 4 or firstTemp >= 31) ? "danger" : (firstTemp <= 14 or firstTemp >= 26) ? "caution" : "safe";\n  const overallLevel: RiskLevel = [wl,wvl,rl,tl].includes("danger") ? "danger" : [wl,wvl,rl,tl].includes("caution") ? "caution" : "safe";\n  const risk = RISK_META[overallLevel];')
c = c.replace('\n  const risk = RISK_META[point.risk];', '')
c = c.replace('label="풍속" value={${windValue}} unit="m/s" />', 'label="풍속" value={${windValue}} unit="m/s" level={wl} />')
c = c.replace('label="파고" value={${waveValue}} unit="m" />', 'label="파고" value={${waveValue}} unit="m" level={wvl} />')
c = c.replace('label="강수" value={${firstRain}} unit="%" />', 'label="강수" value={${firstRain}} unit="%" level={rl} />')
c = c.replace('label="기온" value={${firstTemp}} unit="deg" />', 'label="기온" value={${firstTemp}} unit="deg" level={tl} />')
c = c.replace('{point.tide}', '{getMulddae()}')
c = c.replace('  unit,\n}:', '  unit,\n  level,\n}:')
c = c.replace('  unit: string;\n})', '  unit: string;\n  level: RiskLevel;\n})')
c = c.replace('className="rounded-xl bg-muted border border-border py-2.5"', 'className={ounded-xl border py-2.5 }')
c = c.replace('className="flex items-center justify-center text-primary mb-1"', 'className={lex items-center justify-center mb-1 }')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('done')

