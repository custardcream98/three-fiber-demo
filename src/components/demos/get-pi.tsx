/**
 * 무작위로 점을 찍고, 점의 수 비율로 원주율을 구해보는 데모
 */

import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { BufferAttribute, BufferGeometry } from 'three'

const CUBE_HALF_SIZE = 1
const SPHERE_RADIUS = 1

/** 한 프레임에 점 몇개? */
const POINTS_PER_TICK = 500

const POINT_SIZE = 0.01

const MAX_POINTS = 1_000_000

type Stats = {
  inside: number
  pi: number
  total: number
}

export const GetPi = () => {
  const [stats, setStats] = useState<Stats>({ inside: 0, pi: 0, total: 0 })
  const [samples, setSamples] = useState<Array<{ pi: number; total: number }>>(
    []
  )

  const handleStatsUpdate = useCallback((s: Stats) => {
    startTransition(() => {
      setStats((prev) =>
        prev.total === s.total && prev.inside === s.inside && prev.pi === s.pi
          ? prev
          : s
      )
      setSamples((prev) => {
        if (prev.length === 0 || prev[prev.length - 1].total !== s.total) {
          return [...prev, { pi: s.pi, total: s.total }]
        }
        return prev
      })
    })
  }, [])

  return (
    <div className="relative h-dvh w-full">
      <Canvas camera={{ fov: 50, position: [3, 3, 3] }}>
        {/* 카메라 컨트롤 */}
        <OrbitControls enableDamping makeDefault />

        {/* 정육면체 */}
        <mesh>
          <boxGeometry
            args={[CUBE_HALF_SIZE * 2, CUBE_HALF_SIZE * 2, CUBE_HALF_SIZE * 2]}
          />
          <meshBasicMaterial color="#555" opacity={0.7} transparent wireframe />
        </mesh>

        {/* 구 */}
        <mesh>
          <sphereGeometry args={[SPHERE_RADIUS, 32, 32]} />
          <meshBasicMaterial
            color="#3ba7ff"
            opacity={0.5}
            transparent
            wireframe
          />
        </mesh>

        <MonteCarloPoints onStatsUpdate={handleStatsUpdate} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <div className="rounded-md bg-gray-900/70 px-4 py-2 text-gray-200 shadow-lg">
          <div className="mb-2">
            <PiChart samples={samples} />
          </div>
          <div className="text-sm">
            π ≈ <span className="font-mono">{stats.pi.toFixed(6)}</span>{' '}
            <span className="text-xs text-gray-400">
              (true {Math.PI.toFixed(7)})
            </span>
          </div>
          <div className="mt-1 text-xs text-gray-400">
            inside:{' '}
            <span className="font-mono">{stats.inside.toLocaleString()}</span> ·
            total:{' '}
            <span className="font-mono">{stats.total.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const MonteCarloPoints = ({
  onStatsUpdate,
}: {
  onStatsUpdate: (s: Stats) => void
}) => {
  const geometryRef = useRef<BufferGeometry>(null!)
  const positionsRef = useRef<Float32Array>(new Float32Array(MAX_POINTS * 3))
  const totalCountRef = useRef<number>(0)
  const insideCountRef = useRef<number>(0)

  useEffect(() => {
    const init = () => {
      const geom = geometryRef.current
      geom.setAttribute(
        'position',
        new BufferAttribute(positionsRef.current, 3)
      )
      geom.setDrawRange(0, 0)
    }
    init()
  }, [])

  const addRandomPoint = useCallback(() => {
    const x = (Math.random() * 2 - 1) * CUBE_HALF_SIZE
    const y = (Math.random() * 2 - 1) * CUBE_HALF_SIZE
    const z = (Math.random() * 2 - 1) * CUBE_HALF_SIZE

    const i3 = totalCountRef.current * 3
    positionsRef.current[i3] = x
    positionsRef.current[i3 + 1] = y
    positionsRef.current[i3 + 2] = z

    totalCountRef.current += 1

    if (x * x + y * y + z * z <= SPHERE_RADIUS * SPHERE_RADIUS) {
      insideCountRef.current += 1
    }
  }, [])

  useFrame(() => {
    const currentTotalCount = totalCountRef.current

    const remaining = Math.max(0, MAX_POINTS - currentTotalCount)
    const toAdd = Math.min(POINTS_PER_TICK, remaining)
    for (let i = 0; i < toAdd; i += 1) addRandomPoint()

    if (toAdd > 0) {
      const geom = geometryRef.current
      const position = geom.getAttribute('position') as BufferAttribute
      position.needsUpdate = true
      geom.setDrawRange(0, currentTotalCount)
    }

    const insideCount = insideCountRef.current

    /**
     * 구의 부피 = 4/3 * π * r^3
     * 정육면체의 부피 = 2 * 2 * 2 = 8
     * 구의 부피 / 정육면체의 부피 = π / 6
     * π = 6 * 구의 부피 / 정육면체의 부피
     * 따라서,
     * π ≈ 6 * 구 내부의 점 수 / 정육면체 내부의 점 수
     */

    const calculatedPi =
      currentTotalCount > 0 ? (6 * insideCount) / currentTotalCount : 0

    onStatsUpdate({
      inside: insideCount,
      pi: calculatedPi,
      total: currentTotalCount,
    })
  })

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometryRef} />
      <pointsMaterial color="white" size={POINT_SIZE} sizeAttenuation />
    </points>
  )
}

const PiChart = ({
  samples,
}: {
  samples: Array<{ pi: number; total: number }>
}) => {
  const width = 360
  const height = 120
  const padding = 8

  const { maxX, maxY, minX, minY, pathD } = useMemo(() => {
    const filteredSamples = samples.filter((s) => s.total > 0)

    if (filteredSamples.length === 0) {
      return { maxX: 1, maxY: 4.0, minX: 0, minY: 2.5, pathD: '' }
    }

    const minX = filteredSamples[0].total
    const maxX = filteredSamples[filteredSamples.length - 1].total
    let minY = Infinity
    let maxY = -Infinity
    for (const s of filteredSamples) {
      if (s.pi < minY) minY = s.pi
      if (s.pi > maxY) maxY = s.pi
    }
    // add margins and clamp around [2.5, 4.0]
    minY = Math.max(2.5, minY - 0.05)
    maxY = Math.min(4.0, Math.max(maxY + 0.05, Math.PI + 0.05))

    const plotW = width - padding * 2
    const plotH = height - padding * 2
    const scaleX = (x: number) =>
      minX === maxX ? padding : padding + ((x - minX) / (maxX - minX)) * plotW
    const scaleY = (y: number) =>
      padding + (1 - (y - minY) / (maxY - minY)) * plotH

    let d = ''
    filteredSamples.forEach((s, idx) => {
      const x = scaleX(s.total)
      const y = scaleY(s.pi)
      d += idx === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`
    })

    return { maxX, maxY, minX, minY, pathD: d }
  }, [samples])

  const truePiY = useMemo(() => {
    const plotH = height - padding * 2
    const rangeY = maxY - minY || 1
    return padding + (1 - (Math.PI - minY) / rangeY) * plotH
  }, [minY, maxY])

  return (
    <svg className="block" height={height} width={width}>
      {/* axes */}
      <rect fill="none" height={height} width={width} x={0} y={0} />
      {/* true π line */}
      <line
        opacity={0.9}
        stroke="#ef4444"
        strokeDasharray="4 3"
        strokeWidth={1}
        x1={padding}
        x2={width - padding}
        y1={truePiY}
        y2={truePiY}
      />
      {/* curve */}
      {pathD && (
        <path d={pathD} fill="none" stroke="#93c5fd" strokeWidth={1.5} />
      )}
      {/* ticks: min and max X */}
      <text fill="#9ca3af" fontSize="9" x={padding} y={height - 2}>
        {minX.toLocaleString()}
      </text>
      <text
        fill="#9ca3af"
        fontSize="9"
        textAnchor="end"
        x={width - padding}
        y={height - 2}
      >
        {maxX.toLocaleString()}
      </text>
    </svg>
  )
}
