import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildCity } from './city'
import type { CityRefs } from './city'
import { buildHelicopter } from './helicopter'
import type { Helicopter } from './helicopter'
import { loadHelicopterGLB, loadOptionalGLB, loadShanghaiCityGLB } from './glb'

/** 可替换的外部资源位：把文件放进 public/ 对应路径即自动启用，不存在则忽略 */
const HELI_GLB_URL = 'models/z10.glb'
/** 整个上海城市 GLB（陆家嘴+外滩），加载成功后隐藏程序化核心城区 */
const SHANGHAI_CITY_GLB_URL = 'models/shanghai.glb'
const LANDMARK_GLBS: { key: keyof CityRefs['landmarks']; url: string; height: number; pos: [number, number, number] }[] = [
  { key: 'pearl', url: 'models/pearl.glb', height: 470, pos: [460, 0, -60] },
  { key: 'shTower', url: 'models/shanghai-tower.glb', height: 632, pos: [350, 0, 190] },
  { key: 'swfc', url: 'models/swfc.glb', height: 492, pos: [300, 0, -280] },
  { key: 'jinmao', url: 'models/jinmao.glb', height: 420, pos: [530, 0, 100] },
]
const ROTOR_AUDIO_URL = 'audio/rotor.mp3'

export interface HudState {
  speed: number // km/h
  alt: number // m
  heading: number // 0..360
  throttle: number // 0..1
  climbing: number // m/s
  muted: boolean
  viewMode: boolean // 观赏模式：原地拖动视角环绕机身
  day: boolean // 白天 / 黑夜
  model: string | null // 当前主角模型 GLB 地址，null 表示程序化模型
}

const MAX_SPEED = 85 // m/s
const MIN_ALT = 15
const MAX_ALT = 720
const BOUND = 2900

export class FlightEngine {
  private renderer!: THREE.WebGLRenderer
  private scene!: THREE.Scene
  private camera!: THREE.PerspectiveCamera
  private heli!: Helicopter
  /** 机身挂载组：位置 / 姿态 / 探照灯都挂这里，换模型时只换里面的 heli.group */
  private heliRig!: THREE.Group
  /** 换模型请求的序号，防止并发加载时旧请求覆盖新模型 */
  private heliToken = 0
  private currentModel: string | null = null
  private clock = new THREE.Clock()
  private raf = 0
  private keys = new Set<string>()
  private waterTexture?: THREE.Texture

  // 飞行状态
  private pos = new THREE.Vector3(300, 110, 1050)
  private yaw = 0 // 朝北（-Z）
  private speed = 0
  private targetSpeed = 0
  private vy = 0
  private yawRate = 0
  private time = 0
  private hudTimer = 0
  private disposed = false
  private container: HTMLElement
  private onHud: (h: HudState) => void
  private audio?: HTMLAudioElement
  private muted = true // 默认静音，按 M 开启
  /** 观赏模式：原地悬停，鼠标拖动环绕机身 */
  private viewMode = false
  private orbit?: OrbitControls
  /** 白天 / 黑夜 */
  private day = false
  private cityRefs!: CityRefs
  private ambient!: THREE.AmbientLight
  private sun!: THREE.DirectionalLight
  private hemi!: THREE.HemisphereLight
  private stars!: THREE.Points
  private spot!: THREE.SpotLight

  constructor(container: HTMLElement, onHud: (h: HudState) => void) {
    this.container = container
    this.onHud = onHud
  }

  async start() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x04060e)
    this.scene.fog = new THREE.FogExp2(0x05070f, 0.00042)

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.5, 12000)
    // 初始机位直接放在直升机尾后，避免从原点缓动飞入
    this.camera.position.set(this.pos.x, this.pos.y + 7, this.pos.z + 17)
    this.camera.lookAt(this.pos.x, this.pos.y + 1.5, this.pos.z - 14)

    // 灯光：环境光 + 月光 + 机头射灯（引用存字段，白天/黑夜切换时用）
    this.ambient = new THREE.AmbientLight(0x3a4666, 0.9)
    this.scene.add(this.ambient)
    this.sun = new THREE.DirectionalLight(0x8fa7d0, 0.7)
    this.sun.position.set(1200, 2500, 800)
    this.scene.add(this.sun)
    this.hemi = new THREE.HemisphereLight(0x1a2440, 0x0a0c14, 0.5)
    this.scene.add(this.hemi)

    // 星空
    const starGeo = new THREE.BufferGeometry()
    const starPts: number[] = []
    for (let i = 0; i < 1600; i++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * Math.PI * 0.45 + 0.05
      const r = 6000
      starPts.push(r * Math.cos(e) * Math.cos(a), r * Math.sin(e), r * Math.cos(e) * Math.sin(a))
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3))
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xcdd8ff, size: 2.2, sizeAttenuation: false, fog: false })
    )
    this.scene.add(this.stars)

    // 城市
    const cityRefs = buildCity(this.scene)
    this.cityRefs = cityRefs
    this.waterTexture = cityRefs.waterTexture

    // 可选：外部地标 GLB 替换程序化地标
    for (const slot of LANDMARK_GLBS) {
      loadOptionalGLB(slot.url, slot.height).then((model) => {
        if (!model || this.disposed) return
        model.position.set(...slot.pos)
        this.scene.add(model)
        cityRefs.landmarks[slot.key].visible = false
      })
    }

    // 可选：整个上海城市 GLB（陆家嘴+外滩），加载成功后隐藏程序化核心城区
    loadShanghaiCityGLB(SHANGHAI_CITY_GLB_URL).then((cityModel) => {
      if (!cityModel || this.disposed) return
      this.scene.add(cityModel)
      cityRefs.proceduralCore.visible = false
    })

    // 机身挂载组：初始机位直接放上，避免从原点缓动飞入
    this.heliRig = new THREE.Group()
    this.heliRig.position.copy(this.pos)
    this.scene.add(this.heliRig)

    // 直升机：优先加载外部 GLB，失败回退程序化模型
    await this.setHelicopter(HELI_GLB_URL)
    if (this.disposed || !this.heli) return

    // 旋翼音效（文件不存在则静默跳过；首次按键后启动，满足浏览器自动播放限制）
    this.audio = new Audio(ROTOR_AUDIO_URL)
    this.audio.loop = true
    this.audio.volume = 0
    this.audio.addEventListener('error', () => (this.audio = undefined))

    // 机头探照灯（挂在 rig 上，换模型不受影响）
    this.spot = new THREE.SpotLight(0xfff4d8, 180, 500, 0.35, 0.5)
    this.spot.position.set(0, 1, -4)
    const spotTarget = new THREE.Object3D()
    spotTarget.position.set(0, -2, -60)
    this.heliRig.add(spotTarget)
    this.spot.target = spotTarget
    this.heliRig.add(this.spot)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('resize', this.onResize)

    this.clock.start()
    ;(window as unknown as Record<string, unknown>).__engine = this
    this.loop()
  }

  /**
   * 切换主角机型：传 GLB 地址（public/ 下相对路径）或 null 用程序化模型。
   * 文件不存在 / 解析失败时回退程序化模型；加载完成前保持旧模型显示。
   */
  async setHelicopter(url: string | null) {
    if (!this.heliRig) return
    const token = ++this.heliToken
    const heli = url ? ((await loadHelicopterGLB(url)) ?? buildHelicopter()) : buildHelicopter()
    if (this.disposed || token !== this.heliToken) return
    if (this.heli) {
      // GLB 加载的模型独占几何体 / 材质 / 贴图，移除时释放；程序化模型共享缓存资源，不释放
      if (this.heli.group.userData.glb) this.disposeModel(this.heli.group)
      this.heliRig.remove(this.heli.group)
    }
    this.heli = heli
    this.currentModel = url
    this.heliRig.add(this.heli.group)
  }

  private disposeModel(root: THREE.Object3D) {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          for (const v of Object.values(m)) {
            if (v instanceof THREE.Texture) v.dispose()
          }
          m.dispose()
        }
      }
    })
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
    // 浏览器要求用户交互后才能播放音频：首次按键时启动
    if (this.audio && this.audio.paused && !this.muted) this.audio.play().catch(() => {})
    if (e.code === 'KeyM') this.muted = !this.muted
    if (e.code === 'KeyV' && !e.repeat) this.toggleViewMode()
    if (e.code === 'KeyT' && !e.repeat) this.setDayMode(!this.day)
    this.keys.add(e.code)
  }

  /** T 键切换白天 / 黑夜：天空、雾、光照、星空、楼窗自发光联动 */
  private setDayMode(day: boolean) {
    this.day = day
    if (day) {
      this.scene.background = new THREE.Color(0x8fc3ea)
      this.scene.fog = new THREE.FogExp2(0xbcd6ee, 0.0003)
      this.ambient.color.set(0xdfe9f5)
      this.ambient.intensity = 1.1
      this.sun.color.set(0xfff3e0)
      this.sun.intensity = 2.4
      this.hemi.color.set(0xbfd9f2)
      this.hemi.groundColor.set(0x6a6f66)
      this.hemi.intensity = 0.9
      this.spot.intensity = 0
    } else {
      this.scene.background = new THREE.Color(0x04060e)
      this.scene.fog = new THREE.FogExp2(0x05070f, 0.00042)
      this.ambient.color.set(0x3a4666)
      this.ambient.intensity = 0.9
      this.sun.color.set(0x8fa7d0)
      this.sun.intensity = 0.7
      this.hemi.color.set(0x1a2440)
      this.hemi.groundColor.set(0x0a0c14)
      this.hemi.intensity = 0.5
      this.spot.intensity = 180
    }
    this.stars.visible = !day
    // 地面 / 桥体等深色非自发光材质：白天提亮，否则会黑成一片
    if (day) {
      this.cityRefs.groundMat.color.set(0x47524b)
      this.cityRefs.bridgeDeckMat.color.set(0x9aa2ac)
      this.cityRefs.bridgePylonMat.color.set(0xaab2bc)
    } else {
      this.cityRefs.groundMat.color.set(0x05070d)
      this.cityRefs.bridgeDeckMat.color.set(0x2a2f38)
      this.cityRefs.bridgePylonMat.color.set(0x3a4450)
    }
    // 楼窗灯等自发光材质：白天压暗（原始强度记在 userData，可往返切换）
    const k = day ? 0.12 : 1
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial && m.emissiveIntensity > 0) {
            if (m.userData.em0 === undefined) m.userData.em0 = m.emissiveIntensity
            m.emissiveIntensity = (m.userData.em0 as number) * k
          }
        }
      }
    })
  }

  /** V 键切换观赏模式：原地悬停，OrbitControls 拖动 / 滚轮缩放环绕机身 */
  private toggleViewMode() {
    this.viewMode = !this.viewMode
    if (this.viewMode) {
      // 目标点锁定机身中心
      const target = this.pos.clone().add(new THREE.Vector3(0, 2.5, 0))
      // 相机摆到侧前方 45°，进入即是好机位
      const a = this.yaw + Math.PI / 4
      this.camera.position.set(
        this.pos.x + Math.sin(a) * 24,
        this.pos.y + 6,
        this.pos.z + Math.cos(a) * 24
      )
      this.orbit = new OrbitControls(this.camera, this.renderer.domElement)
      this.orbit.target.copy(target)
      this.orbit.enableDamping = true
      this.orbit.dampingFactor = 0.08
      this.orbit.minDistance = 8
      this.orbit.maxDistance = 150
      this.orbit.maxPolarAngle = Math.PI * 0.55
      this.orbit.update()
    } else {
      this.orbit?.dispose()
      this.orbit = undefined
    }
  }
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }
  private onResize = () => {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private update(dt: number) {
    const k = this.keys
    this.time += dt

    // 油门 / 前进
    if (k.has('KeyW') && !this.viewMode) this.targetSpeed = Math.min(MAX_SPEED, this.targetSpeed + 26 * dt)
    if (k.has('KeyS') && !this.viewMode) this.targetSpeed = Math.max(0, this.targetSpeed - 34 * dt)
    if (k.has('Space') || this.viewMode) this.targetSpeed = Math.max(0, this.targetSpeed - 70 * dt)
    // 加速惯性
    const accel = this.targetSpeed > this.speed ? 14 : 22
    this.speed += THREE.MathUtils.clamp(this.targetSpeed - this.speed, -accel * dt, accel * dt)

    // 转向（观赏模式下机身保持朝向，镜头由鼠标控制）
    let turn = 0
    if (!this.viewMode) {
      if (k.has('KeyA')) turn += 1
      if (k.has('KeyD')) turn -= 1
    }
    this.yawRate = THREE.MathUtils.lerp(this.yawRate, turn * 1.05, 5 * dt)
    this.yaw += this.yawRate * dt

    // 升降
    let climb = 0
    if (!this.viewMode) {
      if (k.has('ArrowUp')) climb += 14
      if (k.has('ArrowDown')) climb -= 14
    }
    this.vy = THREE.MathUtils.lerp(this.vy, climb, 4 * dt)

    // 位置
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw)
    this.pos.addScaledVector(forward, this.speed * dt)
    this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.vy * dt, MIN_ALT, MAX_ALT)
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -BOUND, BOUND)
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -BOUND, BOUND)

    // 机体姿态：偏航 + 转弯压坡 + 前飞低头 + 悬浮微晃
    const g = this.heliRig
    g.position.copy(this.pos)
    const speedN = this.speed / MAX_SPEED
    const bob = Math.sin(this.time * 2.2) * 0.012
    g.rotation.set(
      -speedN * 0.14 + bob,
      this.yaw,
      THREE.MathUtils.clamp(-this.yawRate * (0.25 + speedN * 0.45), -0.5, 0.5),
      'YXZ'
    )

    // 旋翼
    const rpm = 0.42 + speedN * 0.58
    this.heli.mainRotor.rotation.y += (10 + rpm * 42) * dt
    this.heli.tailRotor.rotation.x += (28 + rpm * 90) * dt
    this.heli.setRotorBlur(rpm)

    // 旋翼音效：音量 / 音调随转速
    if (this.audio) {
      this.audio.volume = this.muted ? 0 : Math.min(0.85, 0.2 + rpm * 0.6)
      this.audio.playbackRate = 0.85 + rpm * 0.35
    }

    // 水面微光流动
    if (this.waterTexture) this.waterTexture.offset.y -= dt * 0.03

    // 相机：观赏模式 → OrbitControls 环绕机身；否则追尾
    if (this.viewMode && this.orbit) {
      // 目标点跟随机身（原地悬停时几乎不动）
      this.orbit.target.lerp(this.pos.clone().add(new THREE.Vector3(0, 2.5, 0)), Math.min(1, 6 * dt))
      this.orbit.update()
    } else {
      const camOffset = new THREE.Vector3(0, 7 + speedN * 3, 17 + speedN * 14).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw
      )
      const desired = this.pos.clone().add(camOffset)
      this.camera.position.lerp(desired, Math.min(1, 3.2 * dt))
      const lookAt = this.pos.clone().addScaledVector(forward, 14)
      lookAt.y += 1.5
      this.camera.lookAt(lookAt)
    }
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.update(dt)
    this.renderer.render(this.scene, this.camera)

    this.hudTimer += dt
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0
      let heading = Math.round((-this.yaw * 180) / Math.PI) % 360
      if (heading < 0) heading += 360
      this.onHud({
        speed: Math.round(this.speed * 3.6),
        alt: Math.round(this.pos.y),
        heading,
        throttle: this.targetSpeed / MAX_SPEED,
        climbing: Math.round(this.vy * 10) / 10,
        muted: this.muted,
        viewMode: this.viewMode,
        day: this.day,
        model: this.currentModel,
      })
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.orbit?.dispose()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
