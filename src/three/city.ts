import * as THREE from 'three'
import { makeWindowTexture, makeTextSprite, makeWaterTexture } from './textures'

export interface CityRefs {
  waterTexture: THREE.Texture
  /** 程序化地标，可被外部 GLB 替换（引擎加载成功后隐藏） */
  landmarks: Record<'pearl' | 'shTower' | 'swfc' | 'jinmao', THREE.Object3D>
  /** 整个程序化陆家嘴 + 外滩群组，导入上海城市 GLB 后整组隐藏 */
  proceduralCore: THREE.Group
  /** 昼夜切换需要调色的材质（白天不能保持夜色的纯黑） */
  groundMat: THREE.MeshStandardMaterial
  bridgeDeckMat: THREE.MeshStandardMaterial
  bridgePylonMat: THREE.MeshStandardMaterial
}

/**
 * 黄浦江中心线：S 形弯道，x 随 z 变化。
 * 核心城区段向上海城市 GLB 的河道妥协：模型河道从其地板北缘 (1200, -952)
 * 附近进入、钩形弯过陆家嘴后从南缘 (500, 952) 流出（模型 scale=800、
 * offset=(420,0) 下实测）。我方江面在模型地板范围（z -952..952）内贴合
 * 模型河道中心线，范围外平滑过渡回原 S 弯。模型地板（y 0..9.8）会盖住
 * 我方 y=0 江面，实际只有地板边缘的衔接段可见。
 */
function baseRiverX(z: number): number {
  return 260 * Math.sin(z * 0.0012)
}

/** 模型河道中心线控制点 [z, x]，按 z 升序 */
const MODEL_RIVER: [number, number][] = [
  [-1100, 1200],
  [-500, 1213],
  [-400, 650],
  [-300, 250],
  [-200, 41],
  [-100, -16],
  [0, -50],
  [100, -43],
  [200, 2],
  [300, -30],
  [400, 30],
  [500, 300],
  [600, 380],
  [700, 430],
  [800, 470],
  [912, 498],
  [1100, 500],
]

function modelRiverX(z: number): number {
  if (z <= MODEL_RIVER[0][0]) return MODEL_RIVER[0][1]
  for (let i = 1; i < MODEL_RIVER.length; i++) {
    const [z1, x1] = MODEL_RIVER[i]
    if (z <= z1) {
      const [z0, x0] = MODEL_RIVER[i - 1]
      return x0 + ((x1 - x0) * (z - z0)) / (z1 - z0)
    }
  }
  return MODEL_RIVER[MODEL_RIVER.length - 1][1]
}

function smoothstep(t: number): number {
  t = THREE.MathUtils.clamp(t, 0, 1)
  return t * t * (3 - 2 * t)
}

export function riverX(z: number): number {
  // 过渡窗口：z -952..952 内权重 1，向北 1400m、向南 800m 渐隐到原 S 弯
  const w = Math.min(smoothstep((z + 2400) / 1400), 1 - smoothstep((z - 950) / 800))
  const base = baseRiverX(z)
  if (w <= 0) return base
  return base + (modelRiverX(z) - base) * w
}
const RIVER_HALF = 190

function mulberry(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildCity(scene: THREE.Scene): CityRefs {
  const rand = mulberry(20260803)
  const city = new THREE.Group()

  // ---------- 地面 ----------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 1 })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.5
  city.add(ground)

  // ---------- 黄浦江 ----------
  const waterTexture = makeWaterTexture()
  const riverGeo = new THREE.BufferGeometry()
  const verts: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  const STEP = 40
  const Z0 = -3400
  const Z1 = 3400
  let vi = 0
  for (let z = Z0; z <= Z1; z += STEP) {
    const cx = riverX(z)
    verts.push(cx - RIVER_HALF, 0, z, cx + RIVER_HALF, 0, z)
    uvs.push(0, (z - Z0) / 200, 1, (z - Z0) / 200)
    if (z > Z0) {
      const a = vi - 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    vi += 2
  }
  riverGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  riverGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  riverGeo.setIndex(idx)
  riverGeo.computeVertexNormals()
  const river = new THREE.Mesh(
    riverGeo,
    new THREE.MeshStandardMaterial({
      map: waterTexture,
      roughness: 0.15,
      metalness: 0.7,
      color: 0xd8e6ff,
      emissive: 0x0c1830,
      emissiveIntensity: 0.7,
      side: THREE.DoubleSide,
    })
  )
  city.add(river)

  // ---------- 两岸灯带 ----------
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = []
    for (let z = Z0; z <= Z1; z += 60) {
      pts.push(new THREE.Vector3(riverX(z) + side * (RIVER_HALF + 6), 1.5, z))
    }
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 2.2, 5),
      new THREE.MeshBasicMaterial({ color: side === 1 ? 0xffc873 : 0xffd9a0 })
    )
    city.add(tube)
  }

  // ---------- 窗灯材质变体 ----------
  const windowMats: THREE.MeshStandardMaterial[] = []
  for (let i = 0; i < 6; i++) {
    const tex = makeWindowTexture(1000 + i * 77, 0.3 + rand() * 0.35, 0.45 + rand() * 0.4)
    windowMats.push(
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.9,
        roughness: 0.9,
        metalness: 0.1,
      })
    )
  }

  // ---------- 地标占位（普通楼宇避让） ----------
  const landmarks = [
    new THREE.Vector3(460, 0, -60), // 东方明珠
    new THREE.Vector3(350, 0, 190), // 上海中心
    new THREE.Vector3(300, 0, -280), // 环球金融中心
    new THREE.Vector3(530, 0, 100), // 金茂
  ]
  const nearLandmark = (x: number, z: number, r: number) =>
    landmarks.some((p) => (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z) < r * r)

  // ---------- 城市肌理（街区网格） ----------
  // 注意：核心城区（陆家嘴/外滩）的随机楼宇要避让一个大方块，
  // 给可替换的「上海城市 GLB」预留空位。GLB 以 (420, 0) 为中心、
  // 缩放 800 后占地约 x -500..1340, z -950..950，空位需覆盖该范围。
  const CORE_X0 = -520
  const CORE_X1 = 1360
  const CORE_Z0 = -980
  const CORE_Z1 = 980
  const inCore = (x: number, z: number) => x > CORE_X0 && x < CORE_X1 && z > CORE_Z0 && z < CORE_Z1

  const boxGeo = new THREE.BoxGeometry(1, 1, 1)
  boxGeo.translate(0, 0.5, 0)
  const PITCH = 150
  const EXT = 2500
  const lujCenter = new THREE.Vector2(420, 0)
  for (let gx = -EXT; gx <= EXT; gx += PITCH) {
    for (let gz = -EXT; gz <= EXT; gz += PITCH) {
      const bx = gx + (rand() - 0.5) * 40
      const bz = gz + (rand() - 0.5) * 40
      // 江面与滨江留白
      if (Math.abs(bx - riverX(bz)) < RIVER_HALF + 90) continue
      // 外滩历史建筑群区域留给专用模型
      const inBund = bx < riverX(bz) && bx > riverX(bz) - 320 && bz > -950 && bz < 950
      if (inBund) continue
      // 核心城区让给上海城市 GLB（导入后与程序化核心互换）
      if (inCore(bx, bz)) continue
      if (nearLandmark(bx, bz, 110)) continue

      const dCore = Math.hypot(bx - lujCenter.x, bz - lujCenter.y)
      const east = bx > riverX(bz)
      // 陆家嘴附近高且密，向外渐低；浦西整体较矮
      let hMax = 20 + Math.max(0, 240 - dCore * 0.3)
      if (!east) hMax *= 0.45
      hMax = Math.min(hMax, 300)

      const n = rand() < 0.45 ? 1 : 2 + Math.floor(rand() * 3)
      for (let i = 0; i < n; i++) {
        const w = 26 + rand() * 34
        const d = 26 + rand() * 34
        const h = Math.max(14, hMax * (0.35 + rand() * 0.75))
        const b = new THREE.Mesh(boxGeo, windowMats[Math.floor(rand() * windowMats.length)])
        b.scale.set(w, h, d)
        b.position.set(bx + (rand() - 0.5) * (PITCH - w - 24), 0, bz + (rand() - 0.5) * (PITCH - d - 24))
        city.add(b)
      }
    }
  }

  // ---------- 陆家嘴摩天地标（全部收入 proceduralCore 组，可被上海城市 GLB 整组替换） ----------
  const proceduralCore = new THREE.Group()
  city.add(proceduralCore)

  // 东方明珠广播电视塔
  const pearl = new THREE.Group()
  const pearlPink = new THREE.MeshStandardMaterial({ color: 0x8a5a70, emissive: 0xff4fa3, emissiveIntensity: 0.85, roughness: 0.4 })
  const pearlBody = new THREE.MeshStandardMaterial({ color: 0x4a3d4d, roughness: 0.6, metalness: 0.3 })
  pearl.add(new THREE.Mesh(new THREE.CylinderGeometry(16, 20, 24, 12), pearlBody).translateY(12))
  for (let i = 0; i < 3; i++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 118, 8), pearlBody)
    const a = (i / 3) * Math.PI * 2
    leg.position.set(Math.cos(a) * 13, 70, Math.sin(a) * 13)
    leg.rotation.z = Math.cos(a) * 0.22
    leg.rotation.x = -Math.sin(a) * 0.22
    pearl.add(leg)
  }
  pearl.add(new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 330, 12), pearlBody).translateY(185))
  const s1 = new THREE.Mesh(new THREE.SphereGeometry(25, 20, 16), pearlPink)
  s1.position.y = 118
  pearl.add(s1)
  const s2 = new THREE.Mesh(new THREE.SphereGeometry(17, 18, 14), pearlPink)
  s2.position.y = 245
  pearl.add(s2)
  const s3 = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 10), pearlPink)
  s3.position.y = 305
  pearl.add(s3)
  pearl.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.5, 160, 6), pearlBody).translateY(390))
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3333 }))
  beacon.position.y = 470
  pearl.add(beacon)
  pearl.position.set(460, 0, -60)
  proceduralCore.add(pearl)
  const pearlLabel = makeTextSprite('东方明珠', '#ff9fd0')
  pearlLabel.position.set(460, 510, -60)
  proceduralCore.add(pearlLabel)

  // 上海中心大厦（螺旋扭转）
  const stGeo = new THREE.CylinderGeometry(19, 42, 632, 28, 72, false)
  const pos = stGeo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = (v.y + 316) / 632
    const ang = t * 2.1
    const x = v.x * Math.cos(ang) - v.z * Math.sin(ang)
    const z = v.x * Math.sin(ang) + v.z * Math.cos(ang)
    pos.setXYZ(i, x, v.y, z)
  }
  stGeo.computeVertexNormals()
  const stTex = makeWindowTexture(777, 0.5, 0.15)
  const shTower = new THREE.Mesh(
    stGeo,
    new THREE.MeshStandardMaterial({
      color: 0x0e1a2c,
      emissive: 0xffffff,
      emissiveMap: stTex,
      emissiveIntensity: 0.75,
      roughness: 0.3,
      metalness: 0.85,
    })
  )
  shTower.position.set(350, 316, 190)
  proceduralCore.add(shTower)
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(6, 16, 30, 12), new THREE.MeshBasicMaterial({ color: 0x66d9ff }))
  crown.position.set(350, 648, 190)
  proceduralCore.add(crown)
  const stLabel = makeTextSprite('上海中心大厦', '#7fd4ff')
  stLabel.position.set(350, 700, 190)
  proceduralCore.add(stLabel)

  // 环球金融中心（开瓶器）
  const swfcShape = new THREE.Shape()
  swfcShape.moveTo(-29, 0)
  swfcShape.lineTo(29, 0)
  swfcShape.lineTo(20, 492)
  swfcShape.lineTo(-20, 492)
  swfcShape.closePath()
  const hole = new THREE.Path()
  hole.moveTo(-14, 380)
  hole.lineTo(14, 380)
  hole.lineTo(9, 470)
  hole.lineTo(-9, 470)
  hole.closePath()
  swfcShape.holes.push(hole)
  const swfc = new THREE.Mesh(
    new THREE.ExtrudeGeometry(swfcShape, { depth: 42, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0x14253c, emissive: 0x3d6ea8, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.8 })
  )
  swfc.position.set(300, 0, -280)
  swfc.rotation.y = 0.5
  proceduralCore.add(swfc)
  const swfcLabel = makeTextSprite('环球金融中心', '#a8c8ff')
  swfcLabel.position.set(300, 540, -280)
  proceduralCore.add(swfcLabel)

  // 金茂大厦（宝塔式退台）
  const jinmao = new THREE.Group()
  const jmMat = new THREE.MeshStandardMaterial({ color: 0x2e2718, emissive: 0xc89348, emissiveIntensity: 0.22, roughness: 0.55, metalness: 0.4 })
  let jmW = 48
  let jmY = 0
  const tiers = [70, 60, 55, 50, 42, 36, 30, 26, 22, 18]
  for (const t of tiers) {
    jinmao.add(new THREE.Mesh(new THREE.BoxGeometry(jmW, t, jmW), jmMat).translateY(jmY + t / 2))
    jmY += t
    jmW *= 0.82
  }
  jinmao.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 3, 40, 6), jmMat).translateY(jmY + 20))
  jinmao.position.set(530, 0, 100)
  proceduralCore.add(jinmao)
  const jmLabel = makeTextSprite('金茂大厦', '#ffd9a0')
  jmLabel.position.set(530, jmY + 70, 100)
  proceduralCore.add(jmLabel)

  // ---------- 外滩万国建筑群 ----------
  const bundMatWarm = makeWindowTexture(555, 0.75, 0.95)
  const bundMat = new THREE.MeshStandardMaterial({
    map: bundMatWarm,
    emissive: 0xffffff,
    emissiveMap: bundMatWarm,
    emissiveIntensity: 1.1,
    roughness: 0.8,
  })
  const corniceMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, emissive: 0xffd9a0, emissiveIntensity: 0.6 })
  for (let z = -880; z <= 880; z += 115) {
    const bx = riverX(z) - RIVER_HALF - 70 - rand() * 40
    const h = 20 + rand() * 18
    const w = 60 + rand() * 30
    const b = new THREE.Mesh(boxGeo, bundMat)
    b.scale.set(w, h, 70)
    b.position.set(bx, 0, z + (rand() - 0.5) * 20)
    proceduralCore.add(b)
    const cornice = new THREE.Mesh(boxGeo, corniceMat)
    cornice.scale.set(w + 3, 2.5, 73)
    cornice.position.set(bx, h, b.position.z)
    proceduralCore.add(cornice)
  }
  // 海关大楼（钟楼）
  const chX = riverX(0) - RIVER_HALF - 80
  const customs = new THREE.Group()
  customs.add(new THREE.Mesh(new THREE.BoxGeometry(70, 30, 80), bundMat).translateY(15))
  customs.add(new THREE.Mesh(new THREE.BoxGeometry(24, 55, 24), bundMat).translateY(57))
  customs.add(new THREE.Mesh(new THREE.ConeGeometry(17, 22, 4), corniceMat).translateY(98))
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 2, 20), new THREE.MeshBasicMaterial({ color: 0xfff2cc }))
  clock.rotation.z = Math.PI / 2
  clock.position.set(13, 70, 0)
  customs.add(clock)
  customs.position.set(chX, 0, 0)
  proceduralCore.add(customs)
  const bundLabel = makeTextSprite('外滩', '#ffe2b0')
  bundLabel.position.set(chX, 130, 0)
  proceduralCore.add(bundLabel)

  // ---------- 南浦大桥（简模斜拉桥） ----------
  const bridgeZ = 1500
  const bcx = riverX(bridgeZ)
  const bridgeDeckMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, emissive: 0xfff0c8, emissiveIntensity: 0.25, roughness: 0.7 })
  const bridgePylonMat = new THREE.MeshStandardMaterial({ color: 0x3a4450 })
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(RIVER_HALF * 2 + 220, 3, 26),
    bridgeDeckMat
  )
  deck.position.set(bcx, 14, bridgeZ)
  city.add(deck)
  const cableMat = new THREE.LineBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: 0.85 })
  for (const s of [-1, 1]) {
    const px = bcx + s * (RIVER_HALF - 30)
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 95, 8), bridgePylonMat)
    pylon.position.set(px, 47, bridgeZ)
    city.add(pylon)
    const pts: THREE.Vector3[] = []
    for (let i = 1; i <= 6; i++) {
      pts.push(new THREE.Vector3(px, 90, bridgeZ), new THREE.Vector3(px + s * i * 26, 16, bridgeZ + 10))
      pts.push(new THREE.Vector3(px, 90, bridgeZ), new THREE.Vector3(px + s * i * 26, 16, bridgeZ - 10))
      pts.push(new THREE.Vector3(px, 90, bridgeZ), new THREE.Vector3(px - s * i * 16, 16, bridgeZ + 10))
      pts.push(new THREE.Vector3(px, 90, bridgeZ), new THREE.Vector3(px - s * i * 16, 16, bridgeZ - 10))
    }
    const cables = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cableMat)
    city.add(cables)
  }
  const bridgeLabel = makeTextSprite('南浦大桥', '#c8d8ff')
  bridgeLabel.position.set(bcx, 120, bridgeZ)
  city.add(bridgeLabel)

  scene.add(city)
  return { waterTexture, landmarks: { pearl, shTower, swfc, jinmao }, proceduralCore, groundMat, bridgeDeckMat, bridgePylonMat }
}
