"use client"

import { useRef, useCallback, useState, useEffect } from "react"
import * as THREE from "three"
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js"
import type { ThreeSceneContext } from "./use-three-scene"
import type { TransformMode, ElementModification } from "@/components/viewer/element-editor"

interface ElementEditorState {
  properties: Record<string, string>
  modifications: ElementModification[]
  hiddenElements: Set<number>
  deletedElements: Set<number>
  transformMode: TransformMode
}

export function useElementEditor(
  ctxRef: React.RefObject<ThreeSceneContext | null>,
  getIfcApi: () => { ifcApi: any; modelID: number } | null,
  modelRef: React.RefObject<THREE.Object3D | null>,
  serverModelId?: string
) {
  const [saving, setSaving] = useState(false)
  const [state, setState] = useState<ElementEditorState>({
    properties: {},
    modifications: [],
    hiddenElements: new Set(),
    deletedElements: new Set(),
    transformMode: null,
  })

  const transformControlsRef = useRef<TransformControls | null>(null)
  const helperRef = useRef<THREE.Object3D | null>(null)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  const undoStackRef = useRef<{
    mesh: THREE.Mesh
    position: THREE.Vector3
    rotation: THREE.Euler
    scale: THREE.Vector3
  }[]>([])
  // Stores the original (pre-edit) transform of each mesh, keyed by expressID
  const originalTransformsRef = useRef<Map<number, {
    position: THREE.Vector3
    quaternion: THREE.Quaternion
    scale: THREE.Vector3
  }>>(new Map())

  // Lazily create TransformControls
  const ensureTransformControls = useCallback(() => {
    if (transformControlsRef.current) return transformControlsRef.current
    const ctx = ctxRef.current
    if (!ctx) return null

    const tc = new TransformControls(ctx.camera, ctx.renderer.domElement)
    tc.setSize(0.75)
    tc.addEventListener("dragging-changed", (event: any) => {
      ctx.controls.enabled = !event.value
      // When dragging ends, record the transform modification
      if (!event.value && tc.object) {
        const eid = tc.object.userData?.expressID
        if (eid != null) {
          setState((s) => {
            // Avoid duplicate consecutive transform records for the same element
            const last = s.modifications[s.modifications.length - 1]
            if (last?.expressID === eid && last?.type === "transform") return s
            return {
              ...s,
              modifications: [
                ...s.modifications,
                { expressID: eid, type: "transform" },
              ],
            }
          })
        }
      }
    })

    const helper = tc.getHelper()
    ctx.scene.add(helper)
    helperRef.current = helper
    transformControlsRef.current = tc
    return tc
  }, [ctxRef])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const tc = transformControlsRef.current
      const helper = helperRef.current
      const ctx = ctxRef.current
      if (tc) {
        tc.detach()
        tc.dispose()
      }
      if (helper && ctx) {
        ctx.scene.remove(helper)
      }
      transformControlsRef.current = null
      helperRef.current = null
    }
  }, [ctxRef])

  // Update transform mode
  useEffect(() => {
    if (state.transformMode) {
      const tc = ensureTransformControls()
      if (!tc) return
      tc.setMode(state.transformMode)
      if (selectedMeshRef.current) {
        tc.attach(selectedMeshRef.current)
      }
    } else {
      const tc = transformControlsRef.current
      if (tc) tc.detach()
    }
  }, [state.transformMode, ensureTransformControls])

  // Attach transform controls to selected mesh
  const attachToMesh = useCallback(
    (expressID: number) => {
      const model = modelRef.current
      if (!model) return

      let targetMesh: THREE.Mesh | null = null
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.userData.expressID === expressID) {
          targetMesh = child as THREE.Mesh
        }
      })

      selectedMeshRef.current = targetMesh

      const mesh = targetMesh as THREE.Mesh | null
      if (mesh) {
        // Store original transform the first time we touch this mesh
        if (!originalTransformsRef.current.has(expressID)) {
          originalTransformsRef.current.set(expressID, {
            position: mesh.position.clone(),
            quaternion: mesh.quaternion.clone(),
            scale: mesh.scale.clone(),
          })
        }

        if (state.transformMode && transformControlsRef.current) {
          // Save current state for undo
          undoStackRef.current.push({
            mesh,
            position: mesh.position.clone(),
            rotation: mesh.rotation.clone(),
            scale: mesh.scale.clone(),
          })
          transformControlsRef.current.attach(mesh)
        }
      }
    },
    [modelRef, state.transformMode]
  )

  // Detach transform controls
  const detachControls = useCallback(() => {
    transformControlsRef.current?.detach()
    selectedMeshRef.current = null
  }, [])

  // Load properties for selected element
  const loadProperties = useCallback(
    (expressID: number): Record<string, string> => {
      const ifc = getIfcApi()
      if (!ifc) return {}

      try {
        const line = ifc.ifcApi.GetLine(ifc.modelID, expressID)
        const props: Record<string, string> = {}

        // Extract editable properties
        if (line.Name?.value) props["Name"] = line.Name.value
        if (line.Description?.value) props["Description"] = line.Description.value
        if (line.ObjectType?.value) props["ObjectType"] = line.ObjectType.value
        if (line.LongName?.value) props["LongName"] = line.LongName.value
        if (line.Tag?.value) props["Tag"] = line.Tag.value

        // Try to get property sets
        try {
          const relDefines = ifc.ifcApi.GetLineIDsWithType(ifc.modelID, 4186316022) // IFCRELDEFINESBYPROPERTIES
          for (let i = 0; i < relDefines.size(); i++) {
            const relID = relDefines.get(i)
            try {
              const rel = ifc.ifcApi.GetLine(ifc.modelID, relID)
              const relatedObjects = rel.RelatedObjects
              if (!relatedObjects) continue

              let found = false
              for (let j = 0; j < relatedObjects.length; j++) {
                if (relatedObjects[j].value === expressID) {
                  found = true
                  break
                }
              }

              if (found && rel.RelatingPropertyDefinition?.value) {
                const psetID = rel.RelatingPropertyDefinition.value
                try {
                  const pset = ifc.ifcApi.GetLine(ifc.modelID, psetID)
                  if (pset.HasProperties) {
                    for (let k = 0; k < pset.HasProperties.length; k++) {
                      try {
                        const propID = pset.HasProperties[k].value
                        const prop = ifc.ifcApi.GetLine(ifc.modelID, propID)
                        if (prop.Name?.value && prop.NominalValue?.value !== undefined) {
                          const psetName = pset.Name?.value || "Properties"
                          props[`${psetName}.${prop.Name.value}`] = String(prop.NominalValue.value)
                        }
                      } catch {
                        // skip
                      }
                    }
                  }
                } catch {
                  // skip
                }
              }
            } catch {
              // skip
            }
          }
        } catch {
          // skip property sets
        }

        return props
      } catch {
        return {}
      }
    },
    [getIfcApi]
  )

  // Set selected element
  const selectElement = useCallback(
    (expressID: number) => {
      const props = loadProperties(expressID)
      setState((s) => ({ ...s, properties: props }))
      attachToMesh(expressID)
    },
    [loadProperties, attachToMesh]
  )

  // Clear selection
  const clearEditorSelection = useCallback(() => {
    detachControls()
    setState((s) => ({ ...s, properties: {}, transformMode: null }))
  }, [detachControls])

  // Change transform mode
  const setTransformMode = useCallback((mode: TransformMode) => {
    setState((s) => ({ ...s, transformMode: mode }))
  }, [])

  // Change property value
  const changeProperty = useCallback(
    (expressID: number, key: string, value: string) => {
      const ifc = getIfcApi()
      const oldValue = state.properties[key]

      // Update in-memory property
      setState((s) => ({
        ...s,
        properties: { ...s.properties, [key]: value },
        modifications: [
          ...s.modifications,
          { expressID, type: "property", property: key, oldValue, newValue: value },
        ],
      }))

      // Try to update IFC data in memory
      if (ifc) {
        try {
          const line = ifc.ifcApi.GetLine(ifc.modelID, expressID)
          // Only update direct properties
          const directProps = ["Name", "Description", "ObjectType", "LongName", "Tag"]
          if (directProps.includes(key) && line[key]) {
            line[key].value = value
            ifc.ifcApi.WriteLine(ifc.modelID, line)
          }
        } catch {
          // Property update in IFC failed, but visual/state update still works
        }
      }
    },
    [getIfcApi, state.properties]
  )

  // Delete element
  const deleteElement = useCallback(
    (expressID: number) => {
      const model = modelRef.current
      if (!model) return

      detachControls()

      model.traverse((child) => {
        if (child.userData.expressID === expressID) {
          child.visible = false
          child.userData._deleted = true
        }
      })

      setState((s) => {
        const deleted = new Set(s.deletedElements)
        deleted.add(expressID)
        return {
          ...s,
          deletedElements: deleted,
          modifications: [
            ...s.modifications,
            { expressID, type: "delete" },
          ],
        }
      })
    },
    [modelRef, detachControls]
  )

  // Hide/show element
  const toggleHideElement = useCallback(
    (expressID: number) => {
      const model = modelRef.current
      if (!model) return

      const isHidden = state.hiddenElements.has(expressID)

      model.traverse((child) => {
        if (child.userData.expressID === expressID && !child.userData._deleted) {
          child.visible = isHidden // toggle: if hidden, show; if visible, hide
        }
      })

      setState((s) => {
        const hidden = new Set(s.hiddenElements)
        if (isHidden) {
          hidden.delete(expressID)
        } else {
          hidden.add(expressID)
        }
        return {
          ...s,
          hiddenElements: hidden,
          modifications: [
            ...s.modifications,
            { expressID, type: "hide" },
          ],
        }
      })
    },
    [modelRef, state.hiddenElements]
  )

  // Duplicate element
  const duplicateElement = useCallback(
    (expressID: number) => {
      const model = modelRef.current
      const ctx = ctxRef.current
      if (!model || !ctx) return

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.userData.expressID === expressID) {
          const mesh = child as THREE.Mesh
          const clone = mesh.clone()
          clone.position.x += 1 // offset slightly
          clone.userData = { ...mesh.userData, expressID: expressID + 100000, _cloned: true }
          clone.name = `ifc-${expressID + 100000}`
          model.add(clone)

          setState((s) => ({
            ...s,
            modifications: [
              ...s.modifications,
              { expressID, type: "transform", property: "duplicate", newValue: clone.userData.expressID },
            ],
          }))
        }
      })
    },
    [modelRef, ctxRef]
  )

  // Undo last modification
  const undoLast = useCallback(() => {
    const model = modelRef.current
    if (!model) return

    setState((s) => {
      if (s.modifications.length === 0) return s

      const mods = [...s.modifications]
      const last = mods.pop()!
      const hidden = new Set(s.hiddenElements)
      const deleted = new Set(s.deletedElements)

      if (last.type === "delete") {
        deleted.delete(last.expressID)
        model.traverse((child) => {
          if (child.userData.expressID === last.expressID) {
            child.visible = true
            child.userData._deleted = false
          }
        })
      } else if (last.type === "hide") {
        if (hidden.has(last.expressID)) {
          hidden.delete(last.expressID)
          model.traverse((child) => {
            if (child.userData.expressID === last.expressID && !child.userData._deleted) {
              child.visible = true
            }
          })
        } else {
          hidden.add(last.expressID)
          model.traverse((child) => {
            if (child.userData.expressID === last.expressID) {
              child.visible = false
            }
          })
        }
      } else if (last.type === "transform" && last.property === "duplicate") {
        // Remove cloned mesh
        const toRemove: THREE.Object3D[] = []
        model.traverse((child) => {
          if (child.userData.expressID === last.newValue && child.userData._cloned) {
            toRemove.push(child)
          }
        })
        toRemove.forEach((c) => model.remove(c))
      } else if (last.type === "property") {
        // Revert property
        const props = { ...s.properties }
        if (last.oldValue !== undefined) {
          props[last.property!] = last.oldValue
        }
        return { ...s, modifications: mods, hiddenElements: hidden, deletedElements: deleted, properties: props }
      }

      // Undo transform from stack
      const undoEntry = undoStackRef.current.pop()
      if (undoEntry && last.type === "transform" && last.property !== "duplicate") {
        undoEntry.mesh.position.copy(undoEntry.position)
        undoEntry.mesh.rotation.copy(undoEntry.rotation)
        undoEntry.mesh.scale.copy(undoEntry.scale)
      }

      return { ...s, modifications: mods, hiddenElements: hidden, deletedElements: deleted }
    })
  }, [modelRef])

  // Record transform completion
  const recordTransform = useCallback(
    (expressID: number) => {
      setState((s) => ({
        ...s,
        modifications: [
          ...s.modifications,
          { expressID, type: "transform" },
        ],
      }))
    },
    []
  )

  /** Build an export-ready group: clones visible meshes preserving current transforms */
  const buildExportGroup = useCallback(() => {
    const model = modelRef.current
    if (!model) return null

    model.updateMatrixWorld(true)

    const exportGroup = new THREE.Group()
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.visible && !child.userData._deleted) {
        const mesh = child as THREE.Mesh
        const clone = mesh.clone()
        // mesh already carries its full transform (original IFC placement + any user edits).
        // clone() copies position/rotation/scale, so the export is correct as-is.
        exportGroup.add(clone)
      }
    })
    return exportGroup
  }, [modelRef])

  /** Sync Three.js mesh transforms (position + rotation) back into IFC placement data.
   *  Modifies existing IFC entities in-place (same expressID) to avoid WASM new-ID issues.
   *  Note: IFC does not support per-element scaling — scale changes are visual only. */
  const syncTransformsToIFC = useCallback(async () => {
    const ifc = getIfcApi()
    const model = modelRef.current
    if (!ifc || !model) {
      console.warn("[syncTransforms] no ifc or model")
      return
    }

    const { ifcApi, modelID } = ifc
    let nextId = ifcApi.GetMaxExpressID(modelID) + 1
    const WebIFC = await import("web-ifc")

    // Helper: create a new IFCCARTESIANPOINT via WriteRawLineData
    const createPoint = (x: number, y: number, z: number): number => {
      const id = nextId++
      ifcApi.WriteRawLineData(modelID, {
        ID: id,
        type: WebIFC.IFCCARTESIANPOINT,
        arguments: [
          [{ type: 4, value: String(x) }, { type: 4, value: String(y) }, { type: 4, value: String(z) }]
        ],
      })
      return id
    }

    // Helper: create a new IFCDIRECTION via WriteRawLineData
    const createDirection = (x: number, y: number, z: number): number => {
      const id = nextId++
      ifcApi.WriteRawLineData(modelID, {
        ID: id,
        type: WebIFC.IFCDIRECTION,
        arguments: [
          [{ type: 4, value: String(x) }, { type: 4, value: String(y) }, { type: 4, value: String(z) }]
        ],
      })
      return id
    }

    console.log("[syncTransforms] processing", originalTransformsRef.current.size, "elements")

    // --- Handle transform changes (position + rotation) ---
    originalTransformsRef.current.forEach((original, eid) => {
      let found: THREE.Mesh | null = null
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.userData.expressID === eid) {
          found = child as THREE.Mesh
        }
      })
      if (!found) return

      const mesh = found as THREE.Mesh

      // Detect position change
      const dx = mesh.position.x - original.position.x
      const dy = mesh.position.y - original.position.y
      const dz = mesh.position.z - original.position.z
      const hasPositionChange = Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001

      // Detect rotation change
      const dq = mesh.quaternion.clone().multiply(original.quaternion.clone().invert())
      const rotAngle = 2 * Math.acos(Math.min(1, Math.abs(dq.w)))
      const hasRotationChange = rotAngle > 0.001

      if (!hasPositionChange && !hasRotationChange) return

      console.log("[syncTransforms] eid", eid,
        "posChange:", hasPositionChange, "rotChange:", hasRotationChange)

      try {
        const line = ifcApi.GetLine(modelID, eid)
        if (!line.ObjectPlacement?.value) return

        const localPlacement = ifcApi.GetLine(modelID, line.ObjectPlacement.value)
        if (!localPlacement.RelativePlacement?.value) return

        const axis2OrigId = localPlacement.RelativePlacement.value
        const axis2 = ifcApi.GetLine(modelID, axis2OrigId)
        if (!axis2.Location?.value) return

        const point = ifcApi.GetLine(modelID, axis2.Location.value)
        const coords = point.Coordinates
        if (!coords || coords.length < 3) return

        const oldX = coords[0].value || 0
        const oldY = coords[1].value || 0
        const oldZ = coords[2].value || 0

        // Compute new local position if position changed
        let newLocalX = oldX, newLocalY = oldY, newLocalZ = oldZ
        if (hasPositionChange) {
          const mFlat = new THREE.Matrix4().compose(original.position, original.quaternion, original.scale)
          const translateNeg = new THREE.Matrix4().makeTranslation(-oldX, -oldY, -oldZ)
          const mParent = mFlat.clone().multiply(translateNeg)
          const mParentInv = mParent.clone().invert()
          const newCp = mesh.position.clone().applyMatrix4(mParentInv)
          newLocalX = newCp.x
          newLocalY = newCp.y
          newLocalZ = newCp.z
        }

        // Create new CartesianPoint (always new to avoid shared entity issues)
        const newPointId = createPoint(newLocalX, newLocalY, newLocalZ)
        console.log("[syncTransforms] eid", eid, "new point #" + newPointId,
          "coords:", [newLocalX.toFixed(4), newLocalY.toFixed(4), newLocalZ.toFixed(4)])

        // Build new Axis2Placement3D
        const rawAxis2 = ifcApi.GetRawLineData(modelID, axis2OrigId)
        const newAxis2Id = nextId++

        if (hasRotationChange) {
          const localQuat = original.quaternion.clone().invert().multiply(mesh.quaternion)
          const localZ = new THREE.Vector3(0, 0, 1).applyQuaternion(localQuat)
          const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(localQuat)

          // Create new direction entities (never modify shared ones!)
          const newAxisId = createDirection(localZ.x, localZ.y, localZ.z)
          const newRefDirId = createDirection(localX.x, localX.y, localX.z)

          // Create new Axis2Placement3D referencing new point and new directions
          ifcApi.WriteRawLineData(modelID, {
            ID: newAxis2Id,
            type: rawAxis2.type,
            arguments: [
              { type: 5, value: newPointId },    // Location
              { type: 5, value: newAxisId },      // Axis
              { type: 5, value: newRefDirId },    // RefDirection
            ],
          })

          console.log("[syncTransforms] eid", eid, "rotation:",
            "axis #" + newAxisId, "refDir #" + newRefDirId, "axis2 #" + newAxis2Id,
            "localZ:", [localZ.x.toFixed(4), localZ.y.toFixed(4), localZ.z.toFixed(4)],
            "localX:", [localX.x.toFixed(4), localX.y.toFixed(4), localX.z.toFixed(4)])
        } else {
          // Position-only: new axis2 with new point, keep original directions
          ifcApi.WriteRawLineData(modelID, {
            ID: newAxis2Id,
            type: rawAxis2.type,
            arguments: [
              { type: 5, value: newPointId },    // Location → new point
              rawAxis2.arguments[1],              // Axis → keep original
              rawAxis2.arguments[2],              // RefDirection → keep original
            ],
          })

          console.log("[syncTransforms] eid", eid, "position-only, axis2 #" + newAxis2Id)
        }

        // Update LocalPlacement to reference new Axis2Placement3D
        localPlacement.RelativePlacement.value = newAxis2Id
        ifcApi.WriteLine(modelID, localPlacement)

        console.log("[syncTransforms] eid", eid, "done, placement #" + localPlacement.expressID)

      } catch (err) {
        console.error("[syncTransforms] eid", eid, "failed:", err)
      }
    })

    // --- Handle duplicated elements ---
    const clonedMeshes: { mesh: THREE.Mesh; originalEid: number }[] = []
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.userData._cloned) {
        const origEid = child.userData.expressID - 100000
        clonedMeshes.push({ mesh: child as THREE.Mesh, originalEid: origEid })
      }
    })

    for (const { mesh: cloneMesh, originalEid } of clonedMeshes) {
      try {
        // Get original element's IFC data
        const origLine = ifcApi.GetLine(modelID, originalEid)
        if (!origLine.ObjectPlacement?.value) continue

        const origPlacement = ifcApi.GetLine(modelID, origLine.ObjectPlacement.value)
        if (!origPlacement.RelativePlacement?.value) continue

        const origAxis2Id = origPlacement.RelativePlacement.value
        const origAxis2 = ifcApi.GetLine(modelID, origAxis2Id)
        if (!origAxis2.Location?.value) continue

        const origPoint = ifcApi.GetLine(modelID, origAxis2.Location.value)
        const origCoords = origPoint.Coordinates
        if (!origCoords || origCoords.length < 3) continue

        const origX = origCoords[0].value || 0
        const origY = origCoords[1].value || 0
        const origZ = origCoords[2].value || 0

        // Compute M_parent for original element (same as above)
        const origData = originalTransformsRef.current.get(originalEid)
        const origMFlat = origData
          ? new THREE.Matrix4().compose(origData.position, origData.quaternion, origData.scale)
          : new THREE.Matrix4().compose(cloneMesh.position, cloneMesh.quaternion, cloneMesh.scale)
        const translateNeg = new THREE.Matrix4().makeTranslation(-origX, -origY, -origZ)
        const mParent = origMFlat.clone().multiply(translateNeg)
        const mParentInv = mParent.clone().invert()

        // Compute clone's local position
        const cloneLocalPos = cloneMesh.position.clone().applyMatrix4(mParentInv)

        // Create new CartesianPoint for clone
        const newPointId = nextId++
        origCoords[0].value = cloneLocalPos.x
        origCoords[1].value = cloneLocalPos.y
        origCoords[2].value = cloneLocalPos.z
        origPoint.expressID = newPointId
        ifcApi.WriteLine(modelID, origPoint)

        // Create new Axis2Placement3D
        const newAxis2Id = nextId++
        const rawAxis2 = ifcApi.GetRawLineData(modelID, origAxis2Id)
        ifcApi.WriteRawLineData(modelID, {
          ID: newAxis2Id,
          type: rawAxis2.type,
          arguments: [
            { type: 5, value: newPointId },
            rawAxis2.arguments[1],  // keep original Axis
            rawAxis2.arguments[2],  // keep original RefDirection
          ],
        })

        // Create new LocalPlacement
        const newPlacementId = nextId++
        const rawPlacement = ifcApi.GetRawLineData(modelID, origLine.ObjectPlacement.value)
        const placementArgs = [...rawPlacement.arguments]
        placementArgs[1] = { type: 5, value: newAxis2Id }  // RelativePlacement
        ifcApi.WriteRawLineData(modelID, {
          ID: newPlacementId, type: rawPlacement.type, arguments: placementArgs })

        // Clone the product entity with new placement
        const newProductId = nextId++
        const rawProduct = ifcApi.GetRawLineData(modelID, originalEid)
        const productArgs = [...rawProduct.arguments]
        // ObjectPlacement is typically at index 5 for IFC products
        // Find the placement reference in the raw arguments
        for (let i = 0; i < productArgs.length; i++) {
          if (productArgs[i] && productArgs[i].type === 5 &&
              productArgs[i].value === origLine.ObjectPlacement.value) {
            productArgs[i] = { type: 5, value: newPlacementId }
            break
          }
        }
        // Generate new GlobalId (simple unique string)
        productArgs[0] = { type: 1, value: `Clone_${newProductId}_${Date.now()}` }
        ifcApi.WriteRawLineData(modelID, {
          ID: newProductId, type: rawProduct.type, arguments: productArgs })

        // Add to spatial containment: find IFCRELCONTAINEDINSPATIALSTRUCTURE with original
        try {
          const relLines = ifcApi.GetLineIDsWithType(modelID,
            WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE)
          for (let i = 0; i < relLines.size(); i++) {
            const relRaw = ifcApi.GetRawLineData(modelID, relLines.get(i))
            // RelatedElements is at index 4, it's an array of entity refs
            const relatedElems = relRaw.arguments[4]
            if (Array.isArray(relatedElems)) {
              const hasOriginal = relatedElems.some(
                (r: any) => r && r.value === originalEid)
              if (hasOriginal) {
                relatedElems.push({ type: 5, value: newProductId })
                ifcApi.WriteRawLineData(modelID, relRaw)
                break
              }
            }
          }
        } catch {
          console.warn("[syncTransforms] could not add clone to spatial structure")
        }

        // Update mesh userData with real IFC expressID
        cloneMesh.userData.expressID = newProductId
        cloneMesh.userData._cloned = false

        console.log("[syncTransforms] duplicated eid", originalEid,
          "-> product #" + newProductId, "placement #" + newPlacementId)
      } catch (err) {
        console.error("[syncTransforms] duplicate eid", originalEid, "failed:", err)
      }
    }

    console.log("[syncTransforms] done")
  }, [getIfcApi, modelRef])

  // Helper to download a blob
  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.download = filename
    link.href = url
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    // Delay revoke to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  // Export model as glTF
  const exportGLTF = useCallback(async () => {
    const exportGroup = buildExportGroup()
    if (!exportGroup) return

    const exporter = new GLTFExporter()
    try {
      const result = await exporter.parseAsync(exportGroup, { binary: true })
      downloadBlob(
        new Blob([result as ArrayBuffer], { type: "application/octet-stream" }),
        `model-export-${Date.now()}.glb`
      )
    } catch (err) {
      console.error("glTF export failed:", err)
    }
  }, [buildExportGroup])

  // Export model as OBJ
  const exportOBJ = useCallback(() => {
    const exportGroup = buildExportGroup()
    if (!exportGroup) return

    const exporter = new OBJExporter()
    const result = exporter.parse(exportGroup)
    downloadBlob(
      new Blob([result], { type: "text/plain" }),
      `model-export-${Date.now()}.obj`
    )
  }, [buildExportGroup])

  /** Remove deleted elements from IFC data before saving */
  const syncDeletionsToIFC = useCallback(() => {
    const ifc = getIfcApi()
    if (!ifc) return

    state.deletedElements.forEach((eid) => {
      try {
        ifc.ifcApi.DeleteLine(ifc.modelID, eid)
      } catch {
        // DeleteLine may not be available in all web-ifc versions; skip silently
      }
    })
  }, [getIfcApi, state.deletedElements])

  // Export modified IFC (syncs transforms then serializes)
  const exportIFC = useCallback(async () => {
    const ifc = getIfcApi()
    if (!ifc) {
      console.error("exportIFC: getIfcApi() returned null — model not loaded")
      return
    }

    try {
      await syncTransformsToIFC()
      syncDeletionsToIFC()
      const data = ifc.ifcApi.SaveModel(ifc.modelID)
      console.log("exportIFC: SaveModel returned", data?.length, "bytes")
      if (!data || data.length === 0) {
        console.error("exportIFC: SaveModel returned empty data")
        return
      }
      downloadBlob(
        new Blob([data], { type: "application/octet-stream" }),
        `model-modified-${Date.now()}.ifc`
      )
    } catch (err) {
      console.error("IFC export failed:", err)
    }
  }, [getIfcApi, syncTransformsToIFC, syncDeletionsToIFC])

  // Save modified IFC back to server (overwrite original)
  const saveToServer = useCallback(async () => {
    const ifc = getIfcApi()
    if (!ifc) {
      console.error("saveToServer: getIfcApi() returned null — model not loaded")
      return
    }
    if (!serverModelId) {
      console.error("saveToServer: no serverModelId")
      return
    }

    setSaving(true)
    try {
      await syncTransformsToIFC()
      syncDeletionsToIFC()
      const data = ifc.ifcApi.SaveModel(ifc.modelID)
      console.log("saveToServer: SaveModel returned", data?.length, "bytes")

      // Debug: re-parse saved data and check flatTransformation for modified elements
      try {
        const WebIFC = await import("web-ifc")
        const testApi = new WebIFC.IfcAPI()
        testApi.SetWasmPath("/", true)
        await testApi.Init((p: string) => "/" + p)
        const testModelID = testApi.OpenModel(data)
        const eids = Array.from(originalTransformsRef.current.keys())
        testApi.StreamAllMeshes(testModelID, (flatMesh: any) => {
          if (eids.includes(flatMesh.expressID)) {
            const geoms = flatMesh.geometries
            for (let i = 0; i < geoms.size(); i++) {
              const pg = geoms.get(i)
              const m = new THREE.Matrix4().fromArray(pg.flatTransformation)
              const pos = new THREE.Vector3()
              const quat = new THREE.Quaternion()
              m.decompose(pos, quat, new THREE.Vector3())
              const orig = originalTransformsRef.current.get(flatMesh.expressID)
              console.log("[REPARSE] eid", flatMesh.expressID,
                "pos:", [pos.x.toFixed(4), pos.y.toFixed(4), pos.z.toFixed(4)],
                "quat:", [quat.x.toFixed(4), quat.y.toFixed(4), quat.z.toFixed(4), quat.w.toFixed(4)],
                "desired pos:", orig ? [orig.position.x.toFixed(4), orig.position.y.toFixed(4), orig.position.z.toFixed(4)] : "N/A",
                "desired quat:", orig ? [orig.quaternion.x.toFixed(4), orig.quaternion.y.toFixed(4), orig.quaternion.z.toFixed(4), orig.quaternion.w.toFixed(4)] : "N/A")
            }
          }
        })
        testApi.CloseModel(testModelID)
      } catch (verifyErr) {
        console.warn("[REPARSE] could not verify:", verifyErr)
      }

      if (!data || data.length === 0) {
        throw new Error("SaveModel returned empty data")
      }

      const blob = new Blob([data], { type: "application/octet-stream" })

      const formData = new FormData()
      formData.append("file", blob, "model.ifc")

      const res = await fetch(`/api/models/${serverModelId}/save`, {
        method: "PUT",
        body: formData,
      })

      const result = await res.json()
      if (!res.ok) {
        console.error("saveToServer: server error", result)
        throw new Error(result.error || "Save failed")
      }

      console.log("saveToServer: success, saved", result.fileSize, "bytes")

      // Clear modifications after successful save
      originalTransformsRef.current.clear()
      setState((s) => ({
        ...s,
        modifications: [],
        deletedElements: new Set(),
        hiddenElements: new Set(),
      }))
    } catch (err) {
      console.error("Save to server failed:", err)
      throw err
    } finally {
      setSaving(false)
    }
  }, [getIfcApi, serverModelId, syncTransformsToIFC, syncDeletionsToIFC])

  return {
    editorState: state,
    saving,
    selectElement,
    clearEditorSelection,
    setTransformMode,
    changeProperty,
    deleteElement,
    toggleHideElement,
    duplicateElement,
    undoLast,
    recordTransform,
    exportGLTF,
    exportOBJ,
    exportIFC,
    saveToServer,
  }
}
