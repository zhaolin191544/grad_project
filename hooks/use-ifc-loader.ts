"use client"

import { useRef, useCallback, useState } from "react"
import * as THREE from "three"
import type { ThreeSceneContext } from "./use-three-scene"

export interface IFCElementInfo {
  expressID: number
  name: string
  type: string
  globalId: string
}

export interface SpatialNode {
  expressID: number
  type: string
  children: SpatialNode[]
}

export interface ModelStats {
  elementCount: number
  levelCount: number
}

const highlightMaterial = new THREE.MeshLambertMaterial({
  transparent: true,
  opacity: 0.6,
  color: 0x22e1ff,
  depthTest: false,
})

// Map expressID -> mesh for picking
interface ModelData {
  group: THREE.Group
  ifcApi: any
  modelID: number
  expressIdToMesh: Map<number, THREE.Mesh>
  meshToExpressIds: Map<THREE.Mesh, number[]>
}

export function useIFCLoader(ctxRef: React.RefObject<ThreeSceneContext | null>) {
  const modelDataRef = useRef<ModelData | null>(null)
  const modelRef = useRef<THREE.Object3D | null>(null)
  const highlightMeshRef = useRef<THREE.Mesh | null>(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedElement, setSelectedElement] = useState<IFCElementInfo | null>(null)
  const [spatialTree, setSpatialTree] = useState<SpatialNode | null>(null)
  const [modelStats, setModelStats] = useState<ModelStats | null>(null)
  const [elementTypeMap, setElementTypeMap] = useState<Map<number, { type: string; name?: string }> | null>(null)

  const countNodes = useCallback((node: SpatialNode): ModelStats => {
    let elementCount = 0
    let levelCount = 0

    const traverse = (n: SpatialNode) => {
      if (n.expressID !== undefined) elementCount++
      if (n.type === "IFCBUILDINGSTOREY") levelCount++
      n.children?.forEach(traverse)
    }
    traverse(node)

    return { elementCount, levelCount }
  }, [])

  const loadModel = useCallback(
    async (url: string): Promise<THREE.Object3D> => {
      const ctx = ctxRef.current
      if (!ctx) throw new Error("Scene not initialized")

      setLoading(true)
      setProgress(0)

      // Dynamically import web-ifc (ESM module with WASM)
      const WebIFC = await import("web-ifc")
      const ifcApi = new WebIFC.IfcAPI()
      ifcApi.SetWasmPath("/", true)
      await ifcApi.Init((path: string) => "/" + path)

      setProgress(10)

      // Fetch the IFC file
      const response = await fetch(url)
      if (!response.ok) throw new Error("Failed to fetch model file")
      const buffer = await response.arrayBuffer()
      const data = new Uint8Array(buffer)

      setProgress(30)

      // Open model
      const modelID = ifcApi.OpenModel(data)

      setProgress(50)

      // Remove previous model
      if (modelRef.current) {
        ctx.scene.remove(modelRef.current)
      }
      if (highlightMeshRef.current) {
        ctx.scene.remove(highlightMeshRef.current)
        highlightMeshRef.current = null
      }

      // Create group for all meshes
      const group = new THREE.Group()
      const expressIdToMesh = new Map<number, THREE.Mesh>()
      const meshToExpressIds = new Map<THREE.Mesh, number[]>()

      // Color palette for different IFC types
      const typeColors: Record<number, THREE.Color> = {}
      const defaultColor = new THREE.Color(0.8, 0.8, 0.8)

      // Stream all meshes
      ifcApi.StreamAllMeshes(modelID, (flatMesh: any) => {
        const expressID = flatMesh.expressID
        const placedGeometries = flatMesh.geometries

        for (let i = 0; i < placedGeometries.size(); i++) {
          const placedGeometry = placedGeometries.get(i)
          const geometry = ifcApi.GetGeometry(modelID, placedGeometry.geometryExpressID)

          const verts = ifcApi.GetVertexArray(
            geometry.GetVertexData(),
            geometry.GetVertexDataSize()
          )
          const indices = ifcApi.GetIndexArray(
            geometry.GetIndexData(),
            geometry.GetIndexDataSize()
          )

          if (verts.length === 0 || indices.length === 0) {
            geometry.delete()
            continue
          }

          // Create BufferGeometry
          const bufferGeometry = new THREE.BufferGeometry()

          // web-ifc interleaves position (3) + normal (3) = 6 floats per vertex
          const positionArray = new Float32Array(verts.length / 2)
          const normalArray = new Float32Array(verts.length / 2)

          for (let j = 0; j < verts.length; j += 6) {
            const idx = j / 6
            positionArray[idx * 3] = verts[j]
            positionArray[idx * 3 + 1] = verts[j + 1]
            positionArray[idx * 3 + 2] = verts[j + 2]
            normalArray[idx * 3] = verts[j + 3]
            normalArray[idx * 3 + 1] = verts[j + 4]
            normalArray[idx * 3 + 2] = verts[j + 5]
          }

          bufferGeometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positionArray, 3)
          )
          bufferGeometry.setAttribute(
            "normal",
            new THREE.BufferAttribute(normalArray, 3)
          )
          bufferGeometry.setIndex(new THREE.BufferAttribute(indices, 1))

          // Get color from placed geometry
          const color = new THREE.Color(
            placedGeometry.color.x,
            placedGeometry.color.y,
            placedGeometry.color.z
          )
          const opacity = placedGeometry.color.w

          const material = new THREE.MeshPhongMaterial({
            color,
            transparent: opacity < 1.0,
            opacity,
            side: THREE.DoubleSide,
          })

          const mesh = new THREE.Mesh(bufferGeometry, material)
          mesh.name = `ifc-${expressID}`

          // Apply transformation matrix
          const matrix = new THREE.Matrix4()
          matrix.fromArray(placedGeometry.flatTransformation)
          mesh.applyMatrix4(matrix)

          group.add(mesh)

          // Store mapping
          expressIdToMesh.set(expressID, mesh)
          const existing = meshToExpressIds.get(mesh) || []
          existing.push(expressID)
          meshToExpressIds.set(mesh, existing)

          // Store expressID on mesh userData
          mesh.userData.expressID = expressID

          geometry.delete()
        }
      })

      setProgress(80)

      ctx.scene.add(group)
      modelRef.current = group

      modelDataRef.current = {
        group,
        ifcApi,
        modelID,
        expressIdToMesh,
        meshToExpressIds,
      }

      // Build spatial tree and element type map
      try {
        const tree = buildSpatialTree(ifcApi, modelID, WebIFC)
        setSpatialTree(tree)
        setModelStats(countNodes(tree))

        // Build element type map for AI context
        const typeMap = new Map<number, { type: string; name?: string }>()
        expressIdToMesh.forEach((_, eid) => {
          try {
            const line = ifcApi.GetLine(modelID, eid)
            const typeName = ifcApi.GetNameFromTypeCode(line.type) || "Unknown"
            typeMap.set(eid, {
              type: typeName.toUpperCase(),
              name: line.Name?.value || line.LongName?.value || undefined,
            })
          } catch {
            // skip
          }
        })
        setElementTypeMap(typeMap)
      } catch (e) {
        console.warn("Failed to build spatial tree:", e)
      }

      setLoading(false)
      setProgress(100)
      return group
    },
    [ctxRef, countNodes]
  )

  const loadFile = useCallback(
    async (file: File): Promise<THREE.Object3D> => {
      const url = URL.createObjectURL(file)
      try {
        const model = await loadModel(url)
        return model
      } finally {
        URL.revokeObjectURL(url)
      }
    },
    [loadModel]
  )

  const pickElement = useCallback(
    async (event: MouseEvent, container: HTMLElement) => {
      const ctx = ctxRef.current
      const data = modelDataRef.current
      if (!ctx || !data) return

      const rect = container.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, ctx.camera)
      const intersects = raycaster.intersectObject(data.group, true)

      if (intersects.length === 0) {
        clearHighlight(ctx)
        setSelectedElement(null)
        return
      }

      const hit = intersects[0]
      const mesh = hit.object as THREE.Mesh
      const expressID = mesh.userData.expressID

      if (expressID === undefined) return

      // Highlight
      applyHighlight(ctx, mesh)

      // Get properties
      getElementInfo(data.ifcApi, data.modelID, expressID)
    },
    [ctxRef]
  )

  const applyHighlight = (ctx: ThreeSceneContext, mesh: THREE.Mesh) => {
    // Remove previous highlight
    if (highlightMeshRef.current) {
      ctx.scene.remove(highlightMeshRef.current)
    }

    // Create highlight clone
    const highlightClone = new THREE.Mesh(mesh.geometry, highlightMaterial)
    highlightClone.position.copy(mesh.position)
    highlightClone.rotation.copy(mesh.rotation)
    highlightClone.scale.copy(mesh.scale)
    highlightClone.matrix.copy(mesh.matrix)
    highlightClone.matrixAutoUpdate = false
    highlightClone.renderOrder = 1

    ctx.scene.add(highlightClone)
    highlightMeshRef.current = highlightClone
  }

  const clearHighlight = (ctx: ThreeSceneContext) => {
    if (highlightMeshRef.current) {
      ctx.scene.remove(highlightMeshRef.current)
      highlightMeshRef.current = null
    }
  }

  const getElementInfo = (ifcApi: any, modelID: number, expressID: number) => {
    try {
      const props = ifcApi.GetLine(modelID, expressID)
      const typeName = ifcApi.GetNameFromTypeCode(props.type) || "Unknown"
      setSelectedElement({
        expressID,
        name: props.Name?.value || props.LongName?.value || "Unknown",
        type: typeName,
        globalId: props.GlobalId?.value || "",
      })
    } catch {
      setSelectedElement({
        expressID,
        name: "Unknown",
        type: "Unknown",
        globalId: "",
      })
    }
  }

  const highlightByExpressId = useCallback(
    (expressID: number) => {
      const ctx = ctxRef.current
      const data = modelDataRef.current
      if (!ctx || !data) return

      const mesh = data.expressIdToMesh.get(expressID)
      if (mesh) {
        applyHighlight(ctx, mesh)
      }

      getElementInfo(data.ifcApi, data.modelID, expressID)
    },
    [ctxRef]
  )

  const clearSelection = useCallback(() => {
    const ctx = ctxRef.current
    if (ctx) {
      clearHighlight(ctx)
    }
    setSelectedElement(null)
  }, [ctxRef])

  const setWireframe = useCallback((enabled: boolean) => {
    const model = modelRef.current
    if (!model) return

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat) => {
          ;(mat as THREE.MeshPhongMaterial).wireframe = enabled
        })
      }
    })
  }, [])

  const setXRay = useCallback((enabled: boolean) => {
    const model = modelRef.current
    if (!model) return

    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((mat) => {
          const m = mat as THREE.MeshPhongMaterial
          m.transparent = enabled
          m.opacity = enabled ? 0.2 : 1.0
        })
      }
    })
  }, [])

  const setClipping = useCallback(
    (enabled: boolean, height?: number) => {
      const ctx = ctxRef.current
      if (!ctx) return

      ctx.renderer.localClippingEnabled = enabled
      if (enabled) {
        if (height !== undefined) {
          ctx.clippingPlane.constant = height
        }
        ctx.renderer.clippingPlanes = [ctx.clippingPlane]
      } else {
        ctx.renderer.clippingPlanes = []
      }
    },
    [ctxRef]
  )

  const highlightByType = useCallback(
    (typeName: string) => {
      const ctx = ctxRef.current
      const data = modelDataRef.current
      const typeMap = elementTypeMap
      if (!ctx || !data || !typeMap) return

      // Remove previous highlight
      clearHighlight(ctx)

      // Find all meshes of the given type
      const matchingMeshes: THREE.Mesh[] = []
      typeMap.forEach((info, eid) => {
        if (info.type.toUpperCase().includes(typeName.toUpperCase())) {
          const mesh = data.expressIdToMesh.get(eid)
          if (mesh) matchingMeshes.push(mesh)
        }
      })

      if (matchingMeshes.length === 0) return

      // Merge all geometries into one highlight mesh
      const group = new THREE.Group()
      matchingMeshes.forEach((mesh) => {
        const clone = new THREE.Mesh(mesh.geometry, highlightMaterial)
        clone.position.copy(mesh.position)
        clone.rotation.copy(mesh.rotation)
        clone.scale.copy(mesh.scale)
        clone.matrix.copy(mesh.matrix)
        clone.matrixAutoUpdate = false
        clone.renderOrder = 1
        group.add(clone)
      })

      ctx.scene.add(group)
      // Store group as highlight (reusing ref, cast is fine since we just need remove)
      highlightMeshRef.current = group as unknown as THREE.Mesh
    },
    [ctxRef, elementTypeMap]
  )

  const highlightElements = useCallback(
    (expressIDs: number[], color?: THREE.Color) => {
      const ctx = ctxRef.current
      const data = modelDataRef.current
      if (!ctx || !data) return

      // Remove previous highlight
      clearHighlight(ctx)

      const mat = color
        ? new THREE.MeshLambertMaterial({
            transparent: true,
            opacity: 0.7,
            color,
            depthTest: false,
          })
        : new THREE.MeshLambertMaterial({
            transparent: true,
            opacity: 0.7,
            color: 0xff4444,
            depthTest: false,
          })

      const group = new THREE.Group()
      expressIDs.forEach((eid) => {
        const mesh = data.expressIdToMesh.get(eid)
        if (mesh) {
          const clone = new THREE.Mesh(mesh.geometry, mat)
          clone.position.copy(mesh.position)
          clone.rotation.copy(mesh.rotation)
          clone.scale.copy(mesh.scale)
          clone.matrix.copy(mesh.matrix)
          clone.matrixAutoUpdate = false
          clone.renderOrder = 1
          group.add(clone)
        }
      })

      if (group.children.length > 0) {
        ctx.scene.add(group)
        highlightMeshRef.current = group as unknown as THREE.Mesh
      }
    },
    [ctxRef]
  )

  const dispose = useCallback(() => {
    const data = modelDataRef.current
    if (data) {
      try {
        data.ifcApi.CloseModel(data.modelID)
        data.ifcApi.Dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    modelDataRef.current = null
    modelRef.current = null
    highlightMeshRef.current = null
  }, [])

  const getIfcApi = useCallback(() => {
    const data = modelDataRef.current
    if (!data) return null
    return { ifcApi: data.ifcApi, modelID: data.modelID }
  }, [])

  return {
    modelRef,
    loading,
    progress,
    selectedElement,
    spatialTree,
    modelStats,
    loadModel,
    loadFile,
    pickElement,
    highlightByExpressId,
    clearSelection,
    setWireframe,
    setXRay,
    setClipping,
    highlightByType,
    highlightElements,
    elementTypeMap,
    dispose,
    getIfcApi,
  }
}

// Build spatial tree from IFC spatial structure
function buildSpatialTree(ifcApi: any, modelID: number, WebIFC: any): SpatialNode {

  // Get project
  const projectLines = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPROJECT)
  if (projectLines.size() === 0) {
    return { expressID: 0, type: "IFCPROJECT", children: [] }
  }

  const projectID = projectLines.get(0)

  function getChildren(parentID: number): SpatialNode[] {
    const children: SpatialNode[] = []

    // Get rel aggregates
    const relAggregates = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELAGGREGATES)
    for (let i = 0; i < relAggregates.size(); i++) {
      const relID = relAggregates.get(i)
      try {
        const rel = ifcApi.GetLine(modelID, relID)
        if (rel.RelatingObject?.value === parentID) {
          const related = rel.RelatedObjects
          if (related) {
            for (let j = 0; j < related.length; j++) {
              const childID = related[j].value
              const child = ifcApi.GetLine(modelID, childID)
              const typeName = ifcApi.GetNameFromTypeCode(child.type) || "Unknown"
              children.push({
                expressID: childID,
                type: typeName.toUpperCase(),
                children: getChildren(childID),
              })
            }
          }
        }
      } catch {
        // skip invalid lines
      }
    }

    // Also get contained elements (IFCRELCONTAINEDINSPATIALSTRUCTURE)
    const relContained = ifcApi.GetLineIDsWithType(
      modelID,
      WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE
    )
    for (let i = 0; i < relContained.size(); i++) {
      const relID = relContained.get(i)
      try {
        const rel = ifcApi.GetLine(modelID, relID)
        if (rel.RelatingStructure?.value === parentID) {
          const elements = rel.RelatedElements
          if (elements) {
            for (let j = 0; j < elements.length; j++) {
              const elemID = elements[j].value
              try {
                const elem = ifcApi.GetLine(modelID, elemID)
                const typeName = ifcApi.GetNameFromTypeCode(elem.type) || "Unknown"
                children.push({
                  expressID: elemID,
                  type: typeName.toUpperCase(),
                  children: [],
                })
              } catch {
                // Element may have been deleted — skip
              }
            }
          }
        }
      } catch {
        // skip invalid lines
      }
    }

    return children
  }

  const project = ifcApi.GetLine(modelID, projectID)
  return {
    expressID: projectID,
    type: "IFCPROJECT",
    children: getChildren(projectID),
  }
}
