import * as THREE from 'three'
import { makeRotorDiscTexture } from './textures'

export interface Helicopter {
  group: THREE.Group
  mainRotor: THREE.Group
  mainBlades: THREE.Group
  mainDisc: THREE.Mesh
  tailRotor: THREE.Group
  tailBlades: THREE.Group
  tailDisc: THREE.Mesh
  /** 根据转速 0..1 切换桨叶 / 残影盘 */
  setRotorBlur: (rpm: number) => void
}

const camo = new THREE.MeshStandardMaterial({ color: 0x4a5741, roughness: 0.7, metalness: 0.3 })
const camoDark = new THREE.MeshStandardMaterial({ color: 0x353f2e, roughness: 0.78, metalness: 0.25 })
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.45, metalness: 0.7 })
const glass = new THREE.MeshStandardMaterial({ color: 0x0d1f1a, roughness: 0.12, metalness: 0.85 })
const bladeMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6, metalness: 0.4 })

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, seg = 10): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
}

/** 旋翼组件（主旋翼 5 叶 + 尾旋翼 4 叶，含高速残影盘），可独立挂载到 GLB 模型上 */
export function buildRotorAssembly() {
  const discTex = makeRotorDiscTexture()

  const mainRotor = new THREE.Group()
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), darkMetal)
  mainRotor.add(hub)
  const mainBlades = new THREE.Group()
  for (let i = 0; i < 5; i++) {
    const blade = box(0.34, 0.05, 6.1, bladeMat, 0, 0, 3.15)
    const holder = new THREE.Group()
    holder.add(blade)
    holder.rotation.y = (i / 5) * Math.PI * 2
    mainBlades.add(holder)
  }
  mainRotor.add(mainBlades)
  const mainDisc = new THREE.Mesh(
    new THREE.CircleGeometry(6.4, 40),
    new THREE.MeshBasicMaterial({ map: discTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.85 })
  )
  mainDisc.rotation.x = -Math.PI / 2
  mainDisc.visible = false
  mainRotor.add(mainDisc)

  const tailRotor = new THREE.Group()
  tailRotor.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), darkMetal))
  const tailBlades = new THREE.Group()
  for (let i = 0; i < 4; i++) {
    const blade = box(0.02, 1.35, 0.16, bladeMat, 0, 0.72, 0)
    const holder = new THREE.Group()
    holder.add(blade)
    holder.rotation.x = (i / 4) * Math.PI * 2
    tailBlades.add(holder)
  }
  tailRotor.add(tailBlades)
  const tailDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 28),
    new THREE.MeshBasicMaterial({ map: discTex.clone(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.7 })
  )
  tailDisc.rotation.y = Math.PI / 2
  tailDisc.visible = false
  tailRotor.add(tailDisc)

  const setRotorBlur = (rpm: number) => {
    const blur = rpm > 0.62
    mainBlades.visible = !blur
    mainDisc.visible = blur
    tailBlades.visible = !blur
    tailDisc.visible = blur
    if (blur) {
      ;(mainDisc.material as THREE.MeshBasicMaterial).opacity = 0.45 + rpm * 0.4
      ;(tailDisc.material as THREE.MeshBasicMaterial).opacity = 0.35 + rpm * 0.35
    }
  }

  return { mainRotor, mainBlades, mainDisc, tailRotor, tailBlades, tailDisc, setRotorBlur }
}

/** 程序化搭建武直-10（机头朝 -Z），主旋翼 / 尾旋翼独立可旋转 */
export function buildHelicopter(): Helicopter {
  const g = new THREE.Group()

  // ---- 机身主舱 ----
  g.add(box(1.5, 1.5, 5.0, camo, 0, 1.55, 0.3))
  // 机腹收窄
  const belly = cyl(0.55, 0.75, 4.6, camoDark, 6)
  belly.rotation.x = Math.PI / 2
  belly.scale.set(1.2, 1, 1)
  belly.position.set(0, 1.0, 0.3)
  g.add(belly)

  // ---- 机头（菱形截面锥体，武直十标志性窄机头）----
  const nose = cyl(0.28, 0.78, 2.6, camo, 4)
  nose.rotation.x = -Math.PI / 2
  nose.rotation.y = Math.PI / 4
  nose.scale.set(1, 1, 1.15)
  nose.position.set(0, 1.45, -3.3)
  g.add(nose)

  // ---- 串列双座座舱（前低后高，阶梯式）----
  const canopyF = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 10), glass)
  canopyF.scale.set(0.85, 0.72, 1.5)
  canopyF.position.set(0, 2.2, -1.7)
  g.add(canopyF)
  const canopyR = new THREE.Mesh(new THREE.SphereGeometry(0.78, 14, 10), glass)
  canopyR.scale.set(0.88, 0.78, 1.35)
  canopyR.position.set(0, 2.48, -0.2)
  g.add(canopyR)

  // ---- 机鼻光电转塔 + 机头下方机炮 ----
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), darkMetal)
  sensor.position.set(0, 2.05, -4.15)
  g.add(sensor)
  const turret = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), darkMetal)
  turret.position.set(0, 0.85, -3.9)
  g.add(turret)
  const gun = cyl(0.06, 0.06, 1.1, darkMetal, 6)
  gun.rotation.x = Math.PI / 2 - 0.1
  gun.position.set(0, 0.8, -4.5)
  g.add(gun)

  // ---- 发动机舱（机身两侧顶部）----
  for (const s of [-1, 1]) {
    g.add(box(0.62, 0.66, 2.0, camoDark, s * 0.98, 2.35, 0.9))
    const exhaust = cyl(0.2, 0.26, 0.7, darkMetal, 8)
    exhaust.rotation.z = s * (Math.PI / 2 - 0.5)
    exhaust.position.set(s * 1.35, 2.6, 1.75)
    g.add(exhaust)
  }

  // ---- 短翼 + 挂架 + 武器 ----
  g.add(box(4.6, 0.14, 1.0, camo, 0, 1.85, -0.4))
  for (const s of [-1, 1]) {
    for (const zp of [-0.55, -0.15]) {
      g.add(box(0.1, 0.42, 0.3, darkMetal, s * 1.9, 1.6, zp))
    }
    // 外侧：反坦克导弹挂架（4 联装导轨简模）
    const rail = box(0.5, 0.16, 1.1, darkMetal, s * 1.9, 1.42, -0.6)
    g.add(rail)
    for (let i = 0; i < 4; i++) {
      const missile = cyl(0.07, 0.07, 1.1, camoDark, 6)
      missile.rotation.x = Math.PI / 2
      missile.position.set(s * (1.72 + (i % 2) * 0.36), 1.33 + Math.floor(i / 2) * 0.18, -0.6)
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 6), darkMetal)
      tip.rotation.x = -Math.PI / 2
      tip.position.set(0, -0.66, 0)
      missile.add(tip)
      g.add(missile)
    }
    // 内侧：火箭巢
    const pod = cyl(0.22, 0.22, 1.3, camoDark, 8)
    pod.rotation.x = Math.PI / 2
    pod.position.set(s * 1.9, 1.38, 0.35)
    g.add(pod)
  }

  // ---- 尾梁（上翘收窄）----
  const boom = cyl(0.24, 0.52, 6.6, camo, 8)
  boom.rotation.x = Math.PI / 2 + 0.1
  boom.position.set(0, 2.05, 5.9)
  g.add(boom)
  // 垂尾
  const fin = box(0.12, 1.7, 1.0, camo, 0, 3.1, 8.6)
  fin.rotation.x = 0.25
  g.add(fin)
  const finTip = box(0.12, 0.5, 0.7, camoDark, 0, 3.95, 8.85)
  finTip.rotation.x = 0.25
  g.add(finTip)
  // 平尾
  const stab = box(2.6, 0.1, 0.55, camo, 0, 2.35, 6.2)
  g.add(stab)

  // ---- 起落架（后三点式）----
  for (const s of [-1, 1]) {
    const strut = cyl(0.06, 0.06, 0.9, darkMetal, 6)
    strut.position.set(s * 0.85, 0.45, -0.6)
    strut.rotation.z = s * 0.5
    g.add(strut)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.09, 6, 12), darkMetal)
    wheel.position.set(s * 1.1, 0.22, -0.6)
    wheel.rotation.y = Math.PI / 2
    g.add(wheel)
  }
  const tailWheel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.07, 6, 12), darkMetal)
  tailWheel.position.set(0, 1.35, 8.2)
  tailWheel.rotation.y = Math.PI / 2
  g.add(tailWheel)

  // ---- 主旋翼 + 尾旋翼（共用组件）----
  const mast = cyl(0.14, 0.2, 0.9, darkMetal, 8)
  mast.position.set(0, 3.35, 0.4)
  g.add(mast)
  const rotors = buildRotorAssembly()
  rotors.mainRotor.position.set(0, 3.85, 0.4)
  g.add(rotors.mainRotor)
  rotors.tailRotor.position.set(-0.32, 2.9, 8.55)
  g.add(rotors.tailRotor)

  // 航行灯：左红右绿尾白
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }))
  navL.position.set(-2.35, 1.85, -0.4)
  g.add(navL)
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0x22ff44 }))
  navR.position.set(2.35, 1.85, -0.4)
  g.add(navR)
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  navT.position.set(0, 4.2, 8.9)
  g.add(navT)

  // 机体补光，让夜航中也能看清机身轮廓
  const fill = new THREE.PointLight(0xbcccff, 60, 60, 1.6)
  fill.position.set(0, 7, 3)
  g.add(fill)

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false
      o.receiveShadow = false
    }
  })

  return {
    group: g,
    mainRotor: rotors.mainRotor,
    mainBlades: rotors.mainBlades,
    mainDisc: rotors.mainDisc,
    tailRotor: rotors.tailRotor,
    tailBlades: rotors.tailBlades,
    tailDisc: rotors.tailDisc,
    setRotorBlur: rotors.setRotorBlur,
  }
}
