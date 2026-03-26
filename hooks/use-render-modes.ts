"use client"

import { useRef, useCallback, useState } from "react"
import * as THREE from "three"
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js"
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js"
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js"
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js"
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js"
import type { ThreeSceneContext } from "./use-three-scene"

export type RenderMode = "realistic" | "wireframe" | "heatmap" | "xray" | "edge" | "ssao"

export interface HeatmapConfig {
  attribute: "area" | "cost" | "volume"
  values: Map<number, number> // expressID -> value
  min: number
  max: number
}

// Sobel edge detection shader
const EdgeDetectionShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    edgeColor: { value: new THREE.Vector3(0.15, 0.15, 0.15) },
    bgColor: { value: new THREE.Vector3(1, 1, 1) },
    edgeStrength: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform vec3 edgeColor;
    uniform vec3 bgColor;
    uniform float edgeStrength;
    varying vec2 vUv;

    float edgeLuma(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);

      float tl = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2(-1, 1)).rgb);
      float t  = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2( 0, 1)).rgb);
      float tr = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2( 1, 1)).rgb);
      float l  = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2(-1, 0)).rgb);
      float r  = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2( 1, 0)).rgb);
      float bl = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2(-1,-1)).rgb);
      float b  = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2( 0,-1)).rgb);
      float br = edgeLuma(texture2D(tDiffuse, vUv + texel * vec2( 1,-1)).rgb);

      float sobelX = tl + 2.0*l + bl - tr - 2.0*r - br;
      float sobelY = tl + 2.0*t + tr - bl - 2.0*b - br;
      float edge = sqrt(sobelX * sobelX + sobelY * sobelY);

      edge = smoothstep(0.02, 0.15, edge * edgeStrength);
      vec3 finalColor = mix(bgColor, edgeColor, edge);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
}

// Section fill pattern shader (cross-hatch for cut surfaces)
const SectionFillShader = {
  uniforms: {
    tDiffuse: { value: null },
    clippingPlaneY: { value: 10.0 },
    fillColor: { value: new THREE.Vector3(0.4, 0.6, 0.8) },
    patternScale: { value: 40.0 },
    enabled: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float clippingPlaneY;
    uniform vec3 fillColor;
    uniform float patternScale;
    uniform float enabled;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      if (enabled < 0.5) {
        gl_FragColor = color;
        return;
      }
      // Simple crosshatch at clipping boundary
      float hatch1 = step(0.5, fract((vUv.x + vUv.y) * patternScale));
      float hatch2 = step(0.5, fract((vUv.x - vUv.y) * patternScale));
      float pattern = min(hatch1 + hatch2, 1.0);

      // Only apply where alpha hints at clipping edge (the cut surface)
      if (color.a < 0.01) {
        vec3 hatchColor = mix(fillColor, fillColor * 0.7, pattern);
        gl_FragColor = vec4(hatchColor, 1.0);
      } else {
        gl_FragColor = color;
      }
    }
  `,
}

export function useRenderModes() {
  const [activeMode, setActiveMode] = useState<RenderMode>("realistic")
  const [ssaoEnabled, setSsaoEnabled] = useState(false)
  const [edgeEnabled, setEdgeEnabled] = useState(false)
  const [heatmapConfig, setHeatmapConfig] = useState<HeatmapConfig | null>(null)

  const composerRef = useRef<EffectComposer | null>(null)
  const ssaoPassRef = useRef<SSAOPass | null>(null)
  const edgePassRef = useRef<ShaderPass | null>(null)
  const sectionFillPassRef = useRef<ShaderPass | null>(null)
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map())

  /** Initialize the EffectComposer with all passes */
  const initComposer = useCallback(
    (ctx: ThreeSceneContext) => {
      const { scene, camera, renderer } = ctx

      const w = renderer.domElement.clientWidth || renderer.domElement.width
      const h = renderer.domElement.clientHeight || renderer.domElement.height
      const composer = new EffectComposer(renderer)
      composer.setSize(w, h)
      composer.setPixelRatio(renderer.getPixelRatio())

      // 1. Render pass
      const renderPass = new RenderPass(scene, camera)
      composer.addPass(renderPass)

      // 2. SSAO pass
      const ssaoPass = new SSAOPass(scene, camera, w, h)
      ssaoPass.kernelRadius = 8
      ssaoPass.minDistance = 0.005
      ssaoPass.maxDistance = 0.1
      ssaoPass.enabled = false
      composer.addPass(ssaoPass)
      ssaoPassRef.current = ssaoPass

      // 3. Edge detection pass
      const edgePass = new ShaderPass(EdgeDetectionShader)
      edgePass.uniforms.resolution.value.set(w, h)
      edgePass.enabled = false
      composer.addPass(edgePass)
      edgePassRef.current = edgePass

      // 4. Section fill pass
      const sectionPass = new ShaderPass(SectionFillShader)
      sectionPass.enabled = false
      composer.addPass(sectionPass)
      sectionFillPassRef.current = sectionPass

      // 5. FXAA
      const fxaaPass = new FXAAPass()
      const pixelRatio = renderer.getPixelRatio()
      fxaaPass.uniforms["resolution"].value.set(
        1 / (w * pixelRatio),
        1 / (h * pixelRatio)
      )
      composer.addPass(fxaaPass)

      // 6. Output pass (tone mapping / color space)
      const outputPass = new OutputPass()
      composer.addPass(outputPass)

      composerRef.current = composer
      return composer
    },
    []
  )

  /** Resize the composer */
  const resizeComposer = useCallback((width: number, height: number, pixelRatio: number) => {
    const composer = composerRef.current
    if (!composer) return
    composer.setSize(width, height)
    composer.setPixelRatio(pixelRatio)

    if (ssaoPassRef.current) {
      ssaoPassRef.current.setSize(width, height)
    }
    if (edgePassRef.current) {
      edgePassRef.current.uniforms.resolution.value.set(width, height)
    }
  }, [])

  /** Store original materials before mode change */
  const storeOriginalMaterials = useCallback((scene: THREE.Scene) => {
    if (originalMaterialsRef.current.size > 0) return // already stored
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (mesh.name.startsWith("ifc-")) {
          originalMaterialsRef.current.set(mesh, mesh.material)
        }
      }
    })
  }, [])

  /** Restore original materials */
  const restoreOriginalMaterials = useCallback((scene: THREE.Scene) => {
    originalMaterialsRef.current.forEach((mat, mesh) => {
      mesh.material = mat
    })
  }, [])

  /** Apply a render mode */
  const applyMode = useCallback(
    (mode: RenderMode, scene: THREE.Scene) => {
      storeOriginalMaterials(scene)

      // Reset everything first
      restoreOriginalMaterials(scene)
      if (ssaoPassRef.current) ssaoPassRef.current.enabled = false
      if (edgePassRef.current) edgePassRef.current.enabled = false

      // Set wireframe false on all
      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          mats.forEach((m: any) => {
            if (m.wireframe !== undefined) m.wireframe = false
            if (m.transparent !== undefined) { m.transparent = false; m.opacity = 1.0 }
          })
        }
      })

      switch (mode) {
        case "realistic":
          // Default - just restored originals
          break

        case "ssao":
          if (ssaoPassRef.current) ssaoPassRef.current.enabled = true
          setSsaoEnabled(true)
          break

        case "edge":
          if (edgePassRef.current) edgePassRef.current.enabled = true
          setEdgeEnabled(true)
          break

        case "wireframe":
          scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child.name.startsWith("ifc-")) {
              const mesh = child as THREE.Mesh
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
              mats.forEach((m: any) => { m.wireframe = true })
            }
          })
          break

        case "xray":
          scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child.name.startsWith("ifc-")) {
              const mesh = child as THREE.Mesh
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
              mats.forEach((m: any) => {
                m.transparent = true
                m.opacity = 0.15
                m.depthWrite = false
              })
            }
          })
          break

        case "heatmap":
          // Applied separately via applyHeatmap
          break
      }

      if (mode !== "ssao") setSsaoEnabled(false)
      if (mode !== "edge") setEdgeEnabled(false)
      setActiveMode(mode)
    },
    [storeOriginalMaterials, restoreOriginalMaterials]
  )

  /** Apply heatmap coloring to the model */
  const applyHeatmap = useCallback(
    (scene: THREE.Scene, config: HeatmapConfig) => {
      storeOriginalMaterials(scene)
      setHeatmapConfig(config)

      const { values, min, max } = config
      const range = max - min || 1

      scene.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.name.startsWith("ifc-")) {
          const mesh = child as THREE.Mesh
          const eid = mesh.userData.expressID as number
          const val = values.get(eid)

          if (val !== undefined) {
            const t = Math.max(0, Math.min(1, (val - min) / range))
            // Cool (blue) to warm (red) gradient
            const color = new THREE.Color()
            if (t < 0.25) {
              color.setRGB(0, t * 4, 1) // blue -> cyan
            } else if (t < 0.5) {
              color.setRGB(0, 1, 1 - (t - 0.25) * 4) // cyan -> green
            } else if (t < 0.75) {
              color.setRGB((t - 0.5) * 4, 1, 0) // green -> yellow
            } else {
              color.setRGB(1, 1 - (t - 0.75) * 4, 0) // yellow -> red
            }

            mesh.material = new THREE.MeshPhongMaterial({
              color,
              side: THREE.DoubleSide,
            })
          } else {
            mesh.material = new THREE.MeshPhongMaterial({
              color: 0x888888,
              transparent: true,
              opacity: 0.2,
              side: THREE.DoubleSide,
            })
          }
        }
      })

      setActiveMode("heatmap")
    },
    [storeOriginalMaterials]
  )

  /** Enable/disable section fill pattern */
  const setSectionFill = useCallback((enabled: boolean, clippingHeight?: number) => {
    if (sectionFillPassRef.current) {
      sectionFillPassRef.current.enabled = enabled
      sectionFillPassRef.current.uniforms.enabled.value = enabled ? 1.0 : 0.0
      if (clippingHeight !== undefined) {
        sectionFillPassRef.current.uniforms.clippingPlaneY.value = clippingHeight
      }
    }
  }, [])

  /** Render with composer (call instead of renderer.render) */
  const renderWithComposer = useCallback(() => {
    composerRef.current?.render()
  }, [])

  const hasComposer = useCallback(() => composerRef.current !== null, [])

  return {
    activeMode,
    ssaoEnabled,
    edgeEnabled,
    heatmapConfig,
    initComposer,
    resizeComposer,
    applyMode,
    applyHeatmap,
    setSectionFill,
    renderWithComposer,
    hasComposer,
  }
}
