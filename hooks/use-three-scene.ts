"use client"

import { useEffect, useRef, useCallback } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"

export interface ThreeSceneContext {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  axesScene: THREE.Scene
  axesCamera: THREE.OrthographicCamera
  clippingPlane: THREE.Plane
}

export function useThreeScene(containerRef: React.RefObject<HTMLDivElement | null>) {
  const ctxRef = useRef<ThreeSceneContext | null>(null)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = null

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    )
    camera.position.set(0, 0, 10)

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.autoClear = false
    container.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(3, 5, 2)
    scene.add(directionalLight)

    // Grid helper
    const gridHelper = new THREE.GridHelper(50, 50, 0xcccccc, 0xe5e5e5)
    scene.add(gridHelper)

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    // Clipping plane
    const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10)

    // Axes scene (mini viewport)
    const axesScene = new THREE.Scene()
    const axesHelper = new THREE.AxesHelper(1)
    axesScene.add(axesHelper)
    const axesCamera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 10)
    axesCamera.position.set(1, 1, 1)
    axesCamera.lookAt(0, 0, 0)

    ctxRef.current = {
      scene,
      camera,
      renderer,
      controls,
      axesScene,
      axesCamera,
      clippingPlane,
    }

    // Animation loop
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate)
      controls.update()

      // Sync axes camera with main camera
      const dir = new THREE.Vector3()
      camera.getWorldDirection(dir)
      axesCamera.position.copy(dir.multiplyScalar(-3))
      axesCamera.lookAt(0, 0, 0)

      // Main viewport
      renderer.setViewport(0, 0, container.clientWidth, container.clientHeight)
      renderer.setScissor(0, 0, container.clientWidth, container.clientHeight)
      renderer.setScissorTest(true)
      renderer.clear()
      renderer.render(scene, camera)

      // Axes viewport (bottom-right)
      const axesSize = 120
      const margin = 16
      renderer.setViewport(
        container.clientWidth - axesSize - margin,
        margin,
        axesSize,
        axesSize
      )
      renderer.setScissor(
        container.clientWidth - axesSize - margin,
        margin,
        axesSize,
        axesSize
      )
      renderer.render(axesScene, axesCamera)
    }
    animate()

    // Resize handler
    const handleResize = () => {
      if (!container) return
      const width = container.clientWidth
      const height = container.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(animationRef.current)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
      ctxRef.current = null
    }
  }, [containerRef])

  const frameModel = useCallback((object: THREE.Object3D) => {
    const ctx = ctxRef.current
    if (!ctx) return

    const box = new THREE.Box3().setFromObject(object)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 1.5

    ctx.camera.position.set(
      center.x + distance * 0.5,
      center.y + distance * 0.5,
      center.z + distance * 0.5
    )
    ctx.controls.target.copy(center)
    ctx.controls.update()
  }, [])

  const setPresetView = useCallback(
    (view: "top" | "front" | "iso", object?: THREE.Object3D | null) => {
      const ctx = ctxRef.current
      if (!ctx) return

      const target = object || ctx.scene
      const box = new THREE.Box3().setFromObject(target)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const distance = maxDim * 1.5

      switch (view) {
        case "top":
          ctx.camera.position.set(center.x, center.y + distance, center.z)
          break
        case "front":
          ctx.camera.position.set(center.x, center.y, center.z + distance)
          break
        case "iso":
          ctx.camera.position.set(
            center.x + distance * 0.5,
            center.y + distance * 0.5,
            center.z + distance * 0.5
          )
          break
      }
      ctx.controls.target.copy(center)
      ctx.controls.update()
    },
    []
  )

  const takeScreenshot = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return

    ctx.renderer.render(ctx.scene, ctx.camera)
    const dataUrl = ctx.renderer.domElement.toDataURL("image/png")
    const link = document.createElement("a")
    link.download = `ifc-screenshot-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  }, [])

  const captureThumb = useCallback((): string | null => {
    const ctx = ctxRef.current
    if (!ctx) return null

    ctx.renderer.render(ctx.scene, ctx.camera)
    return ctx.renderer.domElement.toDataURL("image/jpeg", 0.6)
  }, [])

  return { ctxRef, frameModel, setPresetView, takeScreenshot, captureThumb }
}
