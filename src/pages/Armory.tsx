import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { parse } from 'smol-toml'
import { ShowcaseRenderer } from '../three/showcase'
import rawContent from './armory-content.toml?raw'

/** 文案全部来自 armory-content.toml，直接编辑该文件即可改文案 */
interface ArmoryContent {
  name: string
  nickname: string
  stars: number
  price: number
  reserved: string[]
  details: string[]
}

function loadContent(): ArmoryContent {
  const fallback: ArmoryContent = {
    name: '武直-10',
    nickname: '霹雳火',
    stars: 5,
    price: 9999,
    reserved: [],
    details: [],
  }
  try {
    const parsed = parse(rawContent) as unknown as Partial<ArmoryContent>
    return { ...fallback, ...parsed }
  } catch (err) {
    console.warn('[Armory] armory-content.toml 解析失败，使用默认文案', err)
    return fallback
  }
}

const content = loadContent()

export default function Armory() {
  const navigate = useNavigate()
  const mountRef = useRef<HTMLDivElement>(null)
  const showcaseRef = useRef<ShowcaseRenderer | null>(null)
  const [showPay, setShowPay] = useState(false)
  const [day, setDay] = useState(false)

  useEffect(() => {
    if (!mountRef.current) return
    const showcase = new ShowcaseRenderer(mountRef.current)
    showcaseRef.current = showcase
    return () => {
      showcaseRef.current = null
      showcase.dispose()
    }
  }, [])

  const toggleDay = () => {
    const next = !day
    setDay(next)
    showcaseRef.current?.setDayMode(next)
  }

  // B 键快速返回飞行页（与飞行页按 B 进本页对称），T 键切换白天 / 黑夜
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.code === 'KeyB') navigate('/')
      if (e.code === 'KeyT') toggleDay()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black font-sans">
      {/* 顶栏：仅返回入口 */}
      <div className="flex h-12 shrink-0 items-center border-b border-cyan-400/20 bg-black/60 px-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 rounded border border-cyan-400/30 bg-cyan-950/40 px-3 py-1.5 text-xs tracking-widest text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-900/50"
        >
          ◀ 返回飞行 <Key>B</Key>
        </button>
        <button
          onClick={toggleDay}
          className="ml-auto flex items-center gap-2 rounded border border-cyan-400/30 bg-cyan-950/40 px-3 py-1.5 text-xs tracking-widest text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-900/50"
        >
          {day ? '切回黑夜 🌙' : '切换白天 ☀️'} <Key>T</Key>
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 3D 展示视口 */}
        <div className="relative min-w-0 flex-1">
          <div ref={mountRef} className="absolute inset-0" />
          <div className="pointer-events-none absolute bottom-4 left-4 text-[10px] tracking-widest text-cyan-300/50">
            拖动旋转 · 滚轮缩放 · T 昼夜切换 · B 返回飞行
          </div>
        </div>

        {/* 右侧信息面板 */}
        <div className="flex w-[380px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-cyan-400/20 bg-black/50 p-6 backdrop-blur-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-wider text-cyan-50">
              {content.name}
              <span className="ml-2 text-lg text-cyan-300/80">「{content.nickname}」</span>
            </h1>
            <div className="mt-1 text-sm tracking-[0.3em] text-amber-300">
              {'★'.repeat(Math.max(0, Math.min(5, content.stars)))}
            </div>
          </div>

          <Divider />

          {/* 预留区：文案在 armory-content.toml 的 reserved 中填写 */}
          <section>
            <SectionTitle>配置</SectionTitle>
            {content.reserved.length > 0 ? (
              <ul className="space-y-1 text-xs leading-6 text-cyan-100/85">
                {content.reserved.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            ) : (
              <Placeholder>预留位 · 请在 src/pages/armory-content.toml 的 reserved 中填写</Placeholder>
            )}
          </section>

          <Divider />

          {/* 详细介绍：文案在 armory-content.toml 的 details 中填写 */}
          <section>
            <SectionTitle>详细介绍</SectionTitle>
            {content.details.length > 0 ? (
              <div className="space-y-3 text-xs leading-6 text-cyan-100/85">
                {content.details.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : (
              <Placeholder>详细介绍预留 · 请在 src/pages/armory-content.toml 的 details 中填写</Placeholder>
            )}
          </section>

          <Divider />

          {/* 价格 + 购买 */}
          <div className="mt-auto flex items-center justify-between pt-2">
            <div className="font-mono text-2xl font-bold text-amber-300 drop-shadow-[0_0_10px_rgba(250,190,60,0.45)]">
              ￥{content.price.toLocaleString()}
            </div>
            <button
              onClick={() => setShowPay(true)}
              className="rounded border border-amber-300/50 bg-amber-500/15 px-6 py-2 text-sm font-bold tracking-widest text-amber-200 transition-colors hover:border-amber-200 hover:bg-amber-400/25"
            >
              立即购买
            </button>
          </div>
        </div>
      </div>

      {showPay && <PayModal price={content.price} onClose={() => setShowPay(false)} />}
    </div>
  )
}

/** 支付弹窗：假二维码占位，无真实支付逻辑 */
function PayModal({ price, onClose }: { price: number; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[320px] rounded-lg border border-cyan-300/40 bg-[#070b14] p-6 text-center shadow-[0_0_40px_rgba(60,200,255,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold tracking-[0.4em] text-cyan-100">扫码支付</h2>
        <div className="mt-2 font-mono text-2xl font-bold text-amber-300">￥{price.toLocaleString()}</div>

        <div className="mx-auto mt-4 w-fit rounded border border-cyan-400/20 bg-white p-2">
          <FakeQR />
        </div>
        <p className="mt-2 text-[10px] tracking-widest text-cyan-300/60">
          付款码预留位 · 后续接入真实支付
        </p>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded border border-cyan-400/30 bg-cyan-950/40 py-1.5 text-xs tracking-widest text-cyan-100 transition-colors hover:border-cyan-300/60"
        >
          取消
        </button>
      </div>
    </div>
  )
}

/** 伪二维码纹样：固定种子的伪随机方块 + 三个定位角，纯装饰占位 */
function FakeQR() {
  const N = 21
  const cells: boolean[] = []
  let seed = 20260803
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (inFinder(x, y)) {
        const lx = x >= N - 7 ? x - (N - 7) : x
        const ly = y >= N - 7 ? y - (N - 7) : y
        const ring = Math.max(Math.abs(lx - 3), Math.abs(ly - 3))
        cells.push(ring === 3 || ring <= 1)
      } else {
        cells.push(rand() < 0.42)
      }
    }
  }
  return (
    <svg width={168} height={168} viewBox={`0 0 ${N} ${N}`} shapeRendering="crispEdges">
      {cells.map(
        (on, i) =>
          on && (
            <rect key={i} x={i % N} y={Math.floor(i / N)} width={1} height={1} fill="#0a0e14" />
          )
      )}
    </svg>
  )
}

function Divider() {
  return <div className="h-px bg-gradient-to-r from-cyan-400/40 via-cyan-400/10 to-transparent" />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[10px] tracking-[0.35em] text-cyan-300/70">{children}</h3>
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-cyan-400/25 px-3 py-4 text-center text-[10px] leading-5 tracking-widest text-cyan-300/40">
      {children}
    </div>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-cyan-400/40 bg-cyan-950/60 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">
      {children}
    </kbd>
  )
}
