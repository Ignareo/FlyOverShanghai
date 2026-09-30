import * as THREE from 'three'

/** 生成夜空楼宇窗灯纹理（外墙 + 随机亮灯窗户） */
export function makeWindowTexture(seed: number, litRatio = 0.42, warmBias = 0.7): THREE.CanvasTexture {
  const w = 64
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#0b1020')
  grad.addColorStop(1, '#070a14')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  let rng = seed
  const rand = () => {
    rng = (rng * 16807) % 2147483647
    return (rng & 0xffff) / 0xffff
  }

  const cols = 6
  const rows = 26
  const cw = w / cols
  const rh = h / rows
  for (let r = 1; r < rows; r++) {
    const floorDark = rand() < 0.12
    for (let c = 0; c < cols; c++) {
      if (floorDark || rand() > litRatio) {
        ctx.fillStyle = '#0d1220'
      } else {
        const warm = rand() < warmBias
        const b = 0.55 + rand() * 0.45
        ctx.fillStyle = warm
          ? `rgb(${Math.floor(255 * b)},${Math.floor(196 * b)},${Math.floor(110 * b)})`
          : `rgb(${Math.floor(150 * b)},${Math.floor(190 * b)},${Math.floor(255 * b)})`
      }
      ctx.fillRect(c * cw + 1.5, r * rh + 1, cw - 3, rh - 2.2)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 2
  return tex
}

/** 旋翼高速转动时的半透明残影盘纹理 */
export function makeRotorDiscTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(30,34,40,0.9)')
  g.addColorStop(0.15, 'rgba(60,66,74,0.35)')
  g.addColorStop(0.55, 'rgba(90,96,104,0.28)')
  g.addColorStop(0.85, 'rgba(120,126,134,0.4)')
  g.addColorStop(1, 'rgba(140,146,154,0.0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  ctx.globalCompositeOperation = 'source-atop'
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2
    ctx.strokeStyle = `rgba(200,205,215,${0.05 + (i % 3) * 0.02})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(size / 2, size / 2)
    ctx.lineTo(size / 2 + Math.cos(a) * size / 2, size / 2 + Math.sin(a) * size / 2)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 文字标签 Sprite（地标名称） */
export function makeTextSprite(text: string, color = '#9fd8ff'): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.font = 'bold 56px "PingFang SC", "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.9)'
  ctx.shadowBlur = 12
  ctx.fillStyle = color
  ctx.fillText(text, 256, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(170, 42, 1)
  return sprite
}

/** 水面微光纹理 */
export function makeWaterTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0d1a33'
  ctx.fillRect(0, 0, size, size)
  let rng = 7
  const rand = () => {
    rng = (rng * 16807) % 2147483647
    return (rng & 0xffff) / 0xffff
  }
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size
    const y = rand() * size
    const l = 4 + rand() * 16
    ctx.strokeStyle = `rgba(120,170,235,${0.08 + rand() * 0.2})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + l, y)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(6, 24)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
