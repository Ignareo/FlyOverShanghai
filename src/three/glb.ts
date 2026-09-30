import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { buildRotorAssembly } from './helicopter'
import type { Helicopter } from './helicopter'

/**
 * GLB 模型适配器
 *
 * 用法：把下载的武直十 GLB 放到  public/models/z10.glb
 * 引擎会自动优先加载它；文件不存在时回退到程序化模型。
 *
 * 如果加载后朝向 / 大小不对，调下面的常量即可。
 */

/** 机头朝向修正（弧度）。模型机头默认应朝 -Z；不对就改这里，如 Math.PI 表示转 180° */
const YAW_FIX = Math.PI // z10.glb 机头朝 +Z，转 180°
/** 目标机身长度（米），模型会等比缩放到这个量级 */
const TARGET_LENGTH = 14.2

const ROTOR_PATTERN = /(rotor|propeller|prop|blade|螺旋|旋翼|桨)/i
const TAIL_PATTERN = /(tail|尾)/i

function loadGLB(url: string): Promise<THREE.Group | null> {
  return new Promise((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        console.info(`[GLB] 加载成功: ${url}`)
        resolve(gltf.scene)
      },
      undefined,
      (err) => {
        console.warn(`[GLB] 加载失败（回退程序化模型）: ${url}`, err)
        resolve(null) // 文件不存在 / 解析失败 → 回退
      }
    )
  })
}

/** 归一化：居中、缩放到目标长度、机头对齐 -Z，返回缩放后的包围盒 */
function normalize(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())

  // 水平最长边视为机身长度；若 X 更长则先转 90° 让长度沿 Z
  if (size.x > size.z) root.rotation.y = Math.PI / 2
  const len = Math.max(size.x, size.z, 0.001)
  const s = TARGET_LENGTH / len
  root.scale.multiplyScalar(s)
  root.rotation.y += YAW_FIX

  // 重新计算并平移：机身中心对齐原点，底部贴地
  const box2 = new THREE.Box3().setFromObject(root)
  const center2 = box2.getCenter(new THREE.Vector3())
  root.position.sub(new THREE.Vector3(center2.x, box2.min.y, center2.z))
  return new THREE.Box3().setFromObject(root)
}

/** 把网格重新挂到以其包围盒中心为原点的枢轴组上，旋翼才能绕中心自转 */
function repivot(mesh: THREE.Mesh): THREE.Group {
  mesh.updateWorldMatrix(true, false)
  const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
  const pivot = new THREE.Group()
  mesh.parent!.add(pivot)
  pivot.position.copy(mesh.parent!.worldToLocal(center))
  pivot.updateMatrixWorld(true)
  pivot.attach(mesh) // attach 保持网格世界变换不变
  return pivot
}

/** 名称识别不到旋翼时按几何特征识别：主旋翼 = 顶部扁平大盘；尾旋翼 = 尾部竖直薄盘 */
function detectRotorsByGeometry(scene: THREE.Object3D, bbox: THREE.Box3) {
  const infos: { mesh: THREE.Mesh; size: THREE.Vector3; center: THREE.Vector3 }[] = []
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const box = new THREE.Box3().setFromObject(o)
      infos.push({ mesh: o, size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) })
    }
  })
  // 主旋翼：厚度不足直径 15%，且中心在机身上半部
  const flat = infos.filter(
    (i) => i.size.y < Math.max(i.size.x, i.size.z) * 0.15 && i.center.y > bbox.max.y * 0.55
  )
  flat.sort((a, b) => Math.max(b.size.x, b.size.z) - Math.max(a.size.x, a.size.z))
  const main = flat[0]?.mesh ?? null
  // 尾旋翼：位于尾部、x 向很薄而 y/z 展开的竖直盘
  const rear = infos.filter(
    (i) =>
      i.mesh !== main &&
      Math.abs(i.center.z) > bbox.max.z * 0.5 &&
      i.size.y > i.size.x * 3 &&
      i.size.z > i.size.x * 3
  )
  rear.sort((a, b) => b.size.y - a.size.y)
  const tail = rear[0]?.mesh ?? null
  return { main: main ? repivot(main) : null, tail: tail ? repivot(tail) : null }
}

/**
 * 尝试加载外部武直十 GLB，并适配成可飞行的 Helicopter 结构。
 * 旋翼节点按名称自动识别（rotor/prop/blade 等关键词）；识别不到时
 * 按几何特征再找一次；仍没有才挂载程序化旋翼组件，保证动效一定有。
 */
export async function loadHelicopterGLB(url: string): Promise<Helicopter | null> {
  const scene = await loadGLB(url)
  if (!scene) return null

  const g = new THREE.Group()
  g.userData.glb = true // 标记：独占资源，被替换出场景时可整体释放
  g.add(scene)
  const bbox = normalize(scene)

  // 夜景环境下调亮材质
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.metalness = Math.min(m.metalness, 0.6)
          m.roughness = Math.max(m.roughness, 0.35)
        }
      }
    }
  })

  // ---- 旋翼节点自动识别：先按名称，再按几何特征 ----
  const candidates: THREE.Object3D[] = []
  scene.traverse((o) => {
    if (ROTOR_PATTERN.test(o.name)) candidates.push(o)
  })
  let mainNode: THREE.Object3D | null =
    candidates.find((o) => !TAIL_PATTERN.test(o.name)) ?? null
  let tailNode: THREE.Object3D | null =
    candidates.find((o) => TAIL_PATTERN.test(o.name)) ?? null

  if (!mainNode || !tailNode) {
    const geo = detectRotorsByGeometry(scene, bbox)
    mainNode ??= geo.main
    tailNode ??= geo.tail
  }

  const rotors = buildRotorAssembly()
  const setBlur = rotors.setRotorBlur

  if (mainNode) {
    // 用模型自带旋翼：残影盘挂到未缩放的 g 上（模型内部可能带缩放），
    // 位置取旋翼中心的世界坐标，半径按实际旋翼尺寸匹配
    const disc = rotors.mainDisc
    g.add(disc)
    disc.position.copy(mainNode.getWorldPosition(new THREE.Vector3()))
    const nb = new THREE.Box3().setFromObject(mainNode)
    const ns = nb.getSize(new THREE.Vector3())
    disc.scale.setScalar(Math.max(ns.x, ns.z) / 2 / 6.4)
  } else {
    // 顶部居中挂程序化主旋翼
    rotors.mainRotor.position.set(0, bbox.max.y + 0.15, bbox.getCenter(new THREE.Vector3()).z * 0.1)
    g.add(rotors.mainRotor)
  }

  if (tailNode) {
    const disc = rotors.tailDisc
    g.add(disc)
    disc.position.copy(tailNode.getWorldPosition(new THREE.Vector3()))
    const nb = new THREE.Box3().setFromObject(tailNode)
    const ns = nb.getSize(new THREE.Vector3())
    disc.scale.setScalar(Math.max(ns.y, ns.z) / 2 / 1.5)
  } else {
    // 尾部挂程序化尾旋翼（贴垂尾侧面，不用 bbox.max.x——它可能含主旋翼盘直径）
    rotors.tailRotor.position.set(-0.4, bbox.max.y * 0.72, bbox.max.z * 0.9)
    g.add(rotors.tailRotor)
  }

  // 机身补光
  const fill = new THREE.PointLight(0xbcccff, 60, 60, 1.6)
  fill.position.set(0, bbox.max.y + 4, 2)
  g.add(fill)

  return {
    group: g,
    mainRotor: (mainNode ?? rotors.mainRotor) as THREE.Group,
    mainBlades: (mainNode ?? rotors.mainBlades) as THREE.Group,
    mainDisc: rotors.mainDisc,
    tailRotor: (tailNode ?? rotors.tailRotor) as THREE.Group,
    tailBlades: (tailNode ?? rotors.tailBlades) as THREE.Group,
    tailDisc: rotors.tailDisc,
    setRotorBlur: (rpm: number) => {
      const blur = rpm > 0.62
      if (mainNode) {
        mainNode.visible = !blur
        rotors.mainDisc.visible = blur
        ;(rotors.mainDisc.material as THREE.MeshBasicMaterial).opacity = 0.45 + rpm * 0.4
      }
      if (tailNode) {
        tailNode.visible = !blur
        rotors.tailDisc.visible = blur
        ;(rotors.tailDisc.material as THREE.MeshBasicMaterial).opacity = 0.35 + rpm * 0.35
      }
      if (!mainNode || !tailNode) setBlur(rpm)
    },
  }
}

/** 通用可选 GLB 加载：文件存在则返回归一化后的模型，否则返回 null */
export async function loadOptionalGLB(url: string, targetHeight: number): Promise<THREE.Group | null> {
  const scene = await loadGLB(url)
  if (!scene) return null
  const g = new THREE.Group()
  g.add(scene)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const s = targetHeight / Math.max(size.y, 0.001)
  scene.scale.multiplyScalar(s)
  const box2 = new THREE.Box3().setFromObject(scene)
  const center = box2.getCenter(new THREE.Vector3())
  scene.position.sub(new THREE.Vector3(center.x, box2.min.y, center.z))
  return g
}

/** 上海城市 GLB 调参（对齐不准时改这里） */
export const SHANGHAI_GLB_TUNE = {
  /**
   * 等比缩放系数。Sketchfab「City- Shanghai-Sandboxie」原始包围盒仅约 2.3×2.4
   * （自带地面 / 河流的风格化沙盘，非真实比例）。模型单位小不代表精度低，
   * 顶点数据是完整几何，放大不会损失质量；800 倍后约 1840×1900 米、
   * 最高建筑约 320 米，与周边程序化楼宇（最高 ~300 米）量级协调。
   * 注意：它是风格化沙盘，内部地理与程序化地图（黄浦江走向等）并不一致，
   * 无法严格对齐，只能作为陆家嘴核心区天际线近似摆放。
   */
  scale: 800,
  /** 绕 Y 轴旋转（弧度） */
  rotY: 0,
  /** 世界坐标平移（把模型中心大致对齐到程序化核心城区 (420, 0)） */
  offsetX: 420,
  offsetZ: 0,
  /** 垂直平移：模型地板是 9.8 米厚的实心板，下沉使地板顶面对齐地面 y=0 */
  offsetY: -9.8,
  /** 是否自动将模型地面贴到 y=0 并水平居中到 offset */
  autoGround: true,
}

/**
 * 加载整个上海城市场景 GLB（陆家嘴 + 外滩）。
 * 与单件模型不同：城市模型本身带地理坐标，不做长度归一化，
 * 只按 SHANGHAI_GLB_TUNE 做旋转 / 缩放 / 平移对齐。
 */
export async function loadShanghaiCityGLB(url: string): Promise<THREE.Group | null> {
  const scene = await loadGLB(url)
  if (!scene) return null
  const g = new THREE.Group()
  g.add(scene)

  const t = SHANGHAI_GLB_TUNE
  scene.rotation.y = t.rotY
  scene.scale.multiplyScalar(t.scale)

  if (t.autoGround) {
    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    scene.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))
  }
  g.position.set(t.offsetX, t.offsetY, t.offsetZ)

  // 夜景适配：压一压金属度，给材质一点自发光，避免模型在夜里黑成剪影
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          m.metalness = Math.min(m.metalness, 0.5)
          m.roughness = Math.max(m.roughness, 0.4)
          if (m.emissive.getHex() === 0) {
            m.emissive.copy(m.color)
            m.emissiveIntensity = 0.3
          }
        }
      }
    }
  })
  return g
}
