import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadHelicopterGLB } from './glb'
import { buildHelicopter } from './helicopter'

/**
 * 装备展示页轻量渲染器：深色展台 + 网格地板 + 缓慢转盘，
 * 复用飞行页同款直升机（外部 GLB 优先，失败回退程序化模型）。
 * 旋翼保持静止（不调转速，桨叶可见 = 静态展示）。
 * 与飞行引擎完全独立，不影响 engine.ts。
 */

/** 自动转盘一周用时（秒） */
const TURN_PERIOD = 20

export class ShowcaseRenderer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private turntable = new THREE.Group()
  private orbitLight: THREE.PointLight
  private ambient: THREE.AmbientLight
  private keyLight: THREE.DirectionalLight
  private rimLight: THREE.DirectionalLight
  private ringMat!: THREE.MeshBasicMaterial
  private ringOuterMat!: THREE.MeshBasicMaterial
  private clock = new THREE.Clock()
  private raf = 0
  private dragging = false
  private disposed = false
  private resizeObs: ResizeObserver
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x05070d)
    this.scene.fog = new THREE.FogExp2(0x05070d, 0.008)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500)
    this.camera.position.set(15, 8, 20)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 3, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.enablePan = false
    this.controls.minDistance = 8
    this.controls.maxDistance = 60
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05 // 不钻到地板下
    this.controls.addEventListener('start', () => (this.dragging = true))
    this.controls.addEventListener('end', () => (this.dragging = false))

    this.buildStage()

    // 三点布光：主光 / 补光 / 轮廓光
    this.keyLight = new THREE.DirectionalLight(0xdfe9ff, 2.2)
    this.keyLight.position.set(10, 18, 8)
    const fill = new THREE.DirectionalLight(0x3a5f8a, 0.7)
    fill.position.set(-12, 6, -6)
    this.rimLight = new THREE.DirectionalLight(0x37e0ff, 1.4)
    this.rimLight.position.set(0, 10, -18)
    this.ambient = new THREE.AmbientLight(0x2a3450, 0.8)
    this.scene.add(this.ambient, this.keyLight, fill, this.rimLight)

    // 缓慢环绕的青色点光，营造展台氛围
    this.orbitLight = new THREE.PointLight(0x37e0ff, 120, 60, 1.8)
    this.scene.add(this.orbitLight)

    this.resizeObs = new ResizeObserver(() => this.onResize())
    this.resizeObs.observe(container)

    void this.loadModel()
    this.animate()
  }

  /** 展台 + 光环 + 网格地板（全部挂在场景外层，避开 GLB 内部缩放陷阱） */
  private buildStage() {
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9.6, 0.5, 48),
      new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.4, metalness: 0.7 })
    )
    pedestal.position.y = 0.25

    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x37e0ff, transparent: true, opacity: 0.9 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.3, 0.07, 8, 64), this.ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.5

    this.ringOuterMat = new THREE.MeshBasicMaterial({ color: 0x1d7f95, transparent: true, opacity: 0.35 })
    const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.04, 8, 64), this.ringOuterMat)
    ringOuter.rotation.x = Math.PI / 2
    ringOuter.position.y = 0.02

    const grid = new THREE.GridHelper(160, 80, 0x1d4b5e, 0x0c1c26)
    ;(grid.material as THREE.Material).transparent = true
    ;(grid.material as THREE.Material).opacity = 0.5

    this.scene.add(pedestal, ring, ringOuter, grid, this.turntable)
  }

  private async loadModel() {
    const heli = (await loadHelicopterGLB('/models/z10.glb')) ?? buildHelicopter()
    if (this.disposed) return
    heli.setRotorBlur(0) // 桨叶可见、残影盘隐藏：静态展示
    this.turntable.add(heli.group)
    this.turntable.position.y = 0.5 // 站上展台
  }

  /** 白天 / 黑夜切换：天空、雾、灯光、展台光环联动（与引擎 setDayMode 同思路） */
  setDayMode(day: boolean) {
    if (day) {
      this.scene.background = new THREE.Color(0x8fc3ea)
      this.scene.fog = new THREE.FogExp2(0xbcd6ee, 0.004)
      this.ambient.color.set(0xdfe9f5)
      this.ambient.intensity = 1.2
      this.keyLight.color.set(0xfff3e0)
      this.keyLight.intensity = 2.6
      this.rimLight.intensity = 0.4
      this.orbitLight.intensity = 0
      this.ringMat.opacity = 0.3
      this.ringOuterMat.opacity = 0.12
    } else {
      this.scene.background = new THREE.Color(0x05070d)
      this.scene.fog = new THREE.FogExp2(0x05070d, 0.008)
      this.ambient.color.set(0x2a3450)
      this.ambient.intensity = 0.8
      this.keyLight.color.set(0xdfe9ff)
      this.keyLight.intensity = 2.2
      this.rimLight.intensity = 1.4
      this.orbitLight.intensity = 120
      this.ringMat.opacity = 0.9
      this.ringOuterMat.opacity = 0.35
    }
  }

  private onResize() {
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private animate = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.animate)
    const dt = this.clock.getDelta()
    const t = this.clock.elapsedTime

    if (!this.dragging) this.turntable.rotation.y += (dt * Math.PI * 2) / TURN_PERIOD
    this.orbitLight.position.set(Math.cos(t * 0.4) * 16, 6, Math.sin(t * 0.4) * 16)

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    this.controls.dispose()
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        for (const m of mats) m.dispose()
      }
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
