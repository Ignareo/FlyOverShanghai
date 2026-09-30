import { useEffect, useRef, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router'
import { FlightEngine } from './three/engine'
import type { HudState } from './three/engine'
import Armory from './pages/Armory'

const HEADINGS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']

/** 主角模型可选项：GLB 放 public/ 下对应路径即生效，加载失败自动回退程序化模型 */
const MODEL_OPTIONS = [
  { label: '武直-10', url: 'models/z10.glb' },
  { label: '鱼', url: 'models/fish.glb' },
]

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FlightPage />} />
      <Route path="/armory" element={<Armory />} />
    </Routes>
  )
}

function FlightPage() {
  const navigate = useNavigate()
  const mountRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<FlightEngine | null>(null)
  const [hud, setHud] = useState<HudState>({ speed: 0, alt: 110, heading: 0, throttle: 0, climbing: 0, muted: true, viewMode: false, day: false, model: MODEL_OPTIONS[0].url })

  useEffect(() => {
    if (!mountRef.current) return
    const engine = new FlightEngine(mountRef.current, setHud)
    engineRef.current = engine
    engine.start()
    return () => {
      engineRef.current = null
      engine.dispose()
    }
  }, [])

  // B 键快速进入装备展示页（与展示页按 B 返回对称）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat) navigate('/armory')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const headingText = HEADINGS[Math.round(hud.heading / 45) % 8]

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black font-sans">
      <div ref={mountRef} className="absolute inset-0" />

      {/* 顶部标题 */}
      <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <h1 className="text-2xl font-bold tracking-[0.35em] text-cyan-100 drop-shadow-[0_0_12px_rgba(80,200,255,0.6)]">
          武直十 · 飞跃上海
        </h1>
        <p className="mt-1 text-xs tracking-widest text-cyan-300/60">CAIC Z-10 × SHANGHAI NIGHT FLIGHT</p>
      </div>

      {/* HUD 仪表盘 */}
      <div className="pointer-events-none absolute bottom-6 left-6 flex gap-3">
        <HudCard label="速度" value={String(hud.speed)} unit="km/h" />
        <HudCard label="高度" value={String(hud.alt)} unit="m" />
        <HudCard label="航向" value={`${hud.heading}° ${headingText}`} unit="" />
        <HudCard
          label="垂直速度"
          value={`${hud.climbing > 0 ? '+' : ''}${hud.climbing}`}
          unit="m/s"
        />
      </div>

      {/* 油门条 */}
      <div className="pointer-events-none absolute bottom-6 right-6 flex flex-col items-center gap-2">
        <span className="text-[10px] tracking-widest text-cyan-300/70">油门</span>
        <div className="flex h-32 w-3 flex-col justify-end overflow-hidden rounded-full border border-cyan-400/30 bg-black/50">
          <div
            className="w-full rounded-full bg-gradient-to-t from-cyan-500 to-amber-400 transition-[height] duration-150"
            style={{ height: `${Math.round(hud.throttle * 100)}%` }}
          />
        </div>
        <span className="text-xs font-mono text-cyan-100">{Math.round(hud.throttle * 100)}%</span>
      </div>

      {/* 右上：装备展示入口 + 机型切换 + 操作说明 */}
      <div className="absolute right-6 top-5 flex flex-col items-end gap-2">
        <button
          onClick={() => navigate('/armory')}
          className="rounded border border-amber-300/40 bg-amber-500/10 px-3 py-1.5 text-xs tracking-widest text-amber-200 backdrop-blur-sm transition-colors hover:border-amber-200/70 hover:bg-amber-400/20"
        >
          🛒 装备展示 <Key>B</Key>
        </button>
        <label className="flex items-center gap-2 rounded border border-cyan-400/20 bg-black/45 px-2 py-1 backdrop-blur-sm">
          <span className="text-[10px] tracking-widest text-cyan-300/70">机型</span>
          <select
            value={hud.model ?? ''}
            onChange={(e) => engineRef.current?.setHelicopter(e.target.value || null)}
            className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-xs text-cyan-100 outline-none"
          >
            <option value="">程序化模型</option>
            {MODEL_OPTIONS.map((m) => (
              <option key={m.url} value={m.url}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="pointer-events-none rounded-lg border border-cyan-400/20 bg-black/45 p-3 text-xs leading-6 text-cyan-100/85 backdrop-blur-sm">
          <div className="mb-1 text-[10px] tracking-widest text-cyan-300/70">飞行操控</div>
          <div><Key>W</Key> 加速前进　<Key>S</Key> 减速</div>
          <div><Key>A</Key> 左转　<Key>D</Key> 右转</div>
          <div><Key>↑</Key> 爬升　<Key>↓</Key> 下降</div>
          <div><Key>空格</Key> 急停悬停　<Key>M</Key> {hud.muted ? '取消静音 🔇' : '静音 🔊'}</div>
          <div><Key>V</Key> {hud.viewMode ? '返回飞行' : '观赏模式'}　<Key>T</Key> {hud.day ? '切回黑夜 🌙' : '切换白天 ☀️'}</div>
        </div>
      </div>

      {/* 观赏模式提示 */}
      {hud.viewMode && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/30 bg-black/55 px-4 py-1.5 text-xs tracking-widest text-amber-200/90 backdrop-blur-sm">
          观赏模式 · 拖动旋转 / 滚轮缩放 · 按 V 返回飞行
        </div>
      )}
    </div>
  )
}

function HudCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="min-w-[92px] rounded-lg border border-cyan-400/20 bg-black/45 px-3 py-2 backdrop-blur-sm">
      <div className="text-[10px] tracking-widest text-cyan-300/70">{label}</div>
      <div className="mt-0.5 font-mono text-lg text-cyan-50">
        {value}
        {unit && <span className="ml-1 text-[10px] text-cyan-300/60">{unit}</span>}
      </div>
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="mr-1 rounded border border-cyan-400/40 bg-cyan-950/60 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
      {children}
    </kbd>
  )
}
