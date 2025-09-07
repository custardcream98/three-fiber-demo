import { Canvas, useFrame } from '@react-three/fiber'
import { useDebounce } from '@toss/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { cn } from '@/utils/cn'

/**
 * 키보드 stroke가 있을 때
 * 화면이 흔들리면서 파티클이 흩날리는 효과를 주는 데모
 */
export const SmashParticles = () => {
  const stroke = useKeyStroke()
  const showPlaceholder = !useDebouncedFlag(stroke, {
    debounceTime: 2_000,
    ignoreInitial: true,
  })

  return (
    <div className="relative h-dvh w-full bg-black">
      <Canvas camera={{ fov: 50, position: [0, 0, 5] }}>
        <ParticleBursts trigger={stroke} />
      </Canvas>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'text-4xl font-semibold tracking-tight text-gray-500 transition-opacity duration-200 select-none',
            showPlaceholder ? 'opacity-100' : 'opacity-0'
          )}
        >
          press any key
        </span>
      </div>
    </div>
  )
}

const useKeyStroke = () => {
  const [stroke, setStroke] = useState({ stroke: '' })

  useEffect(() => {
    const handleKeyStroke = (event: KeyboardEvent) => {
      setStroke({ stroke: event.key })
    }

    window.addEventListener('keydown', handleKeyStroke)

    return () => {
      window.removeEventListener('keydown', handleKeyStroke)
    }
  }, [])

  return stroke
}

const useDebouncedFlag = <T,>(
  trigger: T,
  { debounceTime = 2_000, ignoreInitial = false }
) => {
  const [flag, setFlag] = useState(false)

  const debouncedFlagChange = useDebounce(() => {
    setFlag(false)
  }, debounceTime)

  const isInitialRef = useRef(true)
  useEffect(() => {
    if (ignoreInitial && isInitialRef.current) {
      isInitialRef.current = false
      return
    }

    setFlag(true)
    debouncedFlagChange()
  }, [ignoreInitial, trigger, debouncedFlagChange])

  return flag
}

// --- Particle system ---

/** 최대 파티클 수 제한 */
const PARTICLE_CAPACITY = 5000
/** 각 키 스트로크마다 생성될 파티클 수 */
const BURST_PARTICLE_COUNT = 500
/** 최소 초기 속도 */
const SPEED_MIN = 2.2
/** 최대 초기 속도 */
const SPEED_MAX = 7
const LIFETIME_MIN = 0.8
const LIFETIME_MAX = 1.6
/** 속도가 얼마나 줄어들어야 하는가? */
const VELOCITY_DAMPING = 0.98
/** 중력 (y 방향 속도에 적용됨) */
const GRAVITY = -8
/** 중심에서의 추가 충격파 반경(월드 유닛) */
const IMPULSE_RADIUS = 0.2
/** 충격파 세기 */
const IMPULSE_STRENGTH = 5
/** 카메라 흔들림 감소 속도 */
const SHAKE_DECAY_PER_SEC = 1

const ParticleBursts = ({ trigger }: { trigger: { stroke: string } }) => {
  const positions = useMemo(
    () => new Float32Array(PARTICLE_CAPACITY * 3).fill(1e6),
    []
  )
  const velocities = useMemo(
    () => new Float32Array(PARTICLE_CAPACITY * 3).fill(0),
    []
  )

  /**
   * 각 파티클의 나이
   */
  const ages = useMemo(
    () => new Float32Array(PARTICLE_CAPACITY).map((_, i) => i),
    []
  )
  /**
   * 각 파티클의 생명 주기
   */
  const lifetimes = useMemo(
    () => new Float32Array(PARTICLE_CAPACITY).fill(0),
    []
  )
  const sizes = useMemo(() => new Float32Array(PARTICLE_CAPACITY).fill(0), [])
  const alphas = useMemo(() => new Float32Array(PARTICLE_CAPACITY).fill(0), [])

  const geometryRef = useRef<THREE.BufferGeometry>(null)
  const pointsRef = useRef<THREE.Points>(null)

  // Camera shake
  const baseCamPosRef = useRef<THREE.Vector3>(null)
  const shakeMagnitudeRef = useRef(0)

  const isInitialRef = useRef(true)
  useEffect(() => {
    if (isInitialRef.current) {
      isInitialRef.current = false
      return
    }

    /**
     * 파티클 버스트 생성
     */
    const spawnBurst = () => {
      if (
        !trigger ||
        ['Alt', 'Control', 'Meta', 'Shift'].includes(trigger.stroke)
      )
        return

      let spawned = 0

      for (let i = 0; i < PARTICLE_CAPACITY; i++) {
        const base = i * 3

        if (spawned < BURST_PARTICLE_COUNT && ages[i] >= lifetimes[i]) {
          // 약간의 jitter와 함깨 파티클 위치 설정 (x, y 좌표만)
          // cf. world unit이 단위인데, 카메라 설정에 따라 투영되므로 절대적인 값을 알기 쉽지 않은듯
          positions[base + 0] = (Math.random() - 0.5) * 0.02
          positions[base + 1] = (Math.random() - 0.5) * 0.02
          positions[base + 2] = 0

          // 랜덤 방향, 속도 설정
          const theta = Math.random() * Math.PI * 2
          const phi = Math.acos(2 * Math.random() - 1)
          const dirX = Math.sin(phi) * Math.cos(theta)
          const dirY = Math.sin(phi) * Math.sin(theta)
          const dirZ = Math.cos(phi)
          const speed = randomBetween(SPEED_MIN, SPEED_MAX)
          velocities[base + 0] = dirX * speed
          velocities[base + 1] = dirY * speed
          velocities[base + 2] = dirZ * speed

          ages[i] = 0
          lifetimes[i] =
            LIFETIME_MIN + Math.random() * (LIFETIME_MAX - LIFETIME_MIN)
          sizes[i] = 6 + Math.random() * 10
          alphas[i] = 1
          spawned++
        }

        // 추가 임팩트를 주기 위해 중심으로부터 거리가 가까운 파티클에 충격파 효과 추가
        if (ages[i] < lifetimes[i]) {
          const x = positions[base + 0]
          const y = positions[base + 1]
          const z = positions[base + 2]

          const dist2 = x * x + y * y + z * z
          const r2 = IMPULSE_RADIUS * IMPULSE_RADIUS
          if (dist2 < r2) {
            const dist = Math.max(0.0001, Math.sqrt(dist2)) // 0으로 나누는 것 방지
            const falloff = 1 - dist / IMPULSE_RADIUS
            /** 밀어내는 힘의 크기. 중심에 가까울수록 크다 */
            const strength = IMPULSE_STRENGTH * falloff
            /** 밀어내는 방향. dist로 나눠서 정규화 */
            const nx = x / dist
            const ny = y / dist
            const nz = z / dist
            velocities[base + 0] += nx * strength
            velocities[base + 1] += ny * strength
            velocities[base + 2] += nz * strength
          }
        }
      }

      if (geometryRef.current) {
        geometryRef.current.attributes.position.needsUpdate = true
        const aSize = geometryRef.current.getAttribute('aSize') as
          | THREE.BufferAttribute
          | THREE.InterleavedBufferAttribute
          | undefined
        const aAlpha = geometryRef.current.getAttribute('aAlpha') as
          | THREE.BufferAttribute
          | THREE.InterleavedBufferAttribute
          | undefined
        if (aSize) aSize.needsUpdate = true
        if (aAlpha) aAlpha.needsUpdate = true
      }

      // Trigger camera shake
      shakeMagnitudeRef.current = Math.max(shakeMagnitudeRef.current, 0.12)
    }

    spawnBurst()
  }, [ages, lifetimes, positions, trigger, velocities, sizes, alphas])

  useFrame(({ camera }, delta) => {
    let anyAlive = false
    for (let i = 0; i < PARTICLE_CAPACITY; i++) {
      const life = lifetimes[i]
      const age = ages[i]
      const isAlive = age < life // 생존 중인 파티클인지?

      if (isAlive) {
        // 이번 프레임에 살아있는 파티클이 있다는 플래그 (GPU 버퍼 업로드 최소화에 활용됨)
        anyAlive = true

        const base = i * 3

        // 속도 적분
        velocities[base + 0] *= VELOCITY_DAMPING
        velocities[base + 1] =
          velocities[base + 1] * VELOCITY_DAMPING + GRAVITY * delta
        velocities[base + 2] *= VELOCITY_DAMPING

        // 다음 위치
        positions[base + 0] += velocities[base + 0] * delta
        positions[base + 1] += velocities[base + 1] * delta
        positions[base + 2] += velocities[base + 2] * delta

        ages[i] = age + delta

        // 수명에 따라 alpha를 서서히 감소, 사이즈는 미세하게 감쇠
        const t = Math.min(1, ages[i] / Math.max(0.0001, life))
        const oneMinusT = 1 - t
        // stronger ease-out fade for punchier look
        alphas[i] = oneMinusT * oneMinusT
        // quick pop then shrink
        if (age < 0.06) {
          sizes[i] *= 1.04
        } else {
          sizes[i] *= 0.999
        }

        if (ages[i] >= life) {
          // 갱신된 age 기준으로 죽었을 때 화면 밖으로 빼냄
          positions[base + 0] = 1e6
          positions[base + 1] = 1e6
          positions[base + 2] = 1e6
          alphas[i] = 0
          sizes[i] = 0
        }
      }
    }

    if (anyAlive && geometryRef.current) {
      geometryRef.current.attributes.position.needsUpdate = true
      const aSize = geometryRef.current.getAttribute('aSize') as
        | THREE.BufferAttribute
        | THREE.InterleavedBufferAttribute
        | undefined
      const aAlpha = geometryRef.current.getAttribute('aAlpha') as
        | THREE.BufferAttribute
        | THREE.InterleavedBufferAttribute
        | undefined
      if (aSize) aSize.needsUpdate = true
      if (aAlpha) aAlpha.needsUpdate = true
    }

    // Camera shake
    if (!baseCamPosRef.current) {
      baseCamPosRef.current = camera.position.clone()
    }
    const mag = shakeMagnitudeRef.current
    const [bx, by, bz] = baseCamPosRef.current
    if (mag > 0) {
      camera.position.set(
        bx + (Math.random() - 0.5) * 2 * mag,
        by + (Math.random() - 0.5) * 2 * mag * 0.8,
        bz + (Math.random() - 0.5) * 2 * mag * 0.3
      )
      shakeMagnitudeRef.current = Math.max(
        0,
        shakeMagnitudeRef.current - SHAKE_DECAY_PER_SEC * delta
      )
      if (shakeMagnitudeRef.current === 0) {
        camera.position.copy(baseCamPosRef.current)
      }
    }
  })

  /**
   * 셰이더 (shader)
   * GPU 위에서 실행되는 작은 프로그램
   *
   * CPU만으로는 수천만개의 픽셀을 빠르게 처리하기 힘들다.
   * GPU는 병렬 연산에 특화돼 있어 셰이더 프로그램으로 빛, 색, 질감, 물리 효과 등을 실시간으로 계산할 수 있다.
   *
   * Web에서는 WebGL을 통해 GPU에서 실행된다.
   * Three.js에는 이 프로그램을 작성해 넘길 수 있다. (GLSL이라는 WebGL 셰이더 언어 사용)
   *
   * GLSL (OpenGL Shading Language)
   * C언어 문법과 유사. 벡터/행렬 내장 타입 (vec2, vec3, mat4 등) 이 기본 제공됨
   * dot, cross, normalize, mix, texture 등 그래픽스 친화적 함수도 내장됨
   */

  /**
   * Vertex Shader
   * 3D 모델의 꼭짓점 좌표를 입력받아 화면 좌표로 변환하는 shader.
   * 물체의 위치, 회전, 크기 같은 변환을 처리함
   */
  const vertex = `
    // Vertex Shader에서 사용할 변수
    // buffer-attribute로 전달된 값
    attribute float aSize;
    attribute float aAlpha;

    // Fragment Shader에서 사용할 변수
    // GPU가 보간을 해주기 때문에, 정점에서 준 값은 픽셀 단위로 자연스럽게 섞여서 Fragment Shader에 전달된다.
    varying float vAlpha;

    void main() {
      vAlpha = aAlpha;
      gl_PointSize = aSize;

      // position: 정점 좌표 (내장 attribute)
      // modelViewMatrix: 내장 변환 행렬. 모델 -> 뷰 좌표 변환 행렬임
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); // 카메라(view space)에서 본 정점의 위치

      // projectionMatrix: 내장 변환 행렬. 뷰 -> 투영 좌표 변환 행렬임
      gl_Position = projectionMatrix * mvPosition;
      // 이렇게 gl_Position을 최종 결정해주는 것이 꼭 필요하다.
      // 이 값이 rasterization을 걸쳐서 실제 화면 픽셀 위치가 된다.
    }
  `

  /**
   * ## 좌표계
   *
   * 렌더링 파이프라인에는 여러 좌표 공간이 있음
   * 정점(position)은 계속해서 다른 좌표계로 바뀌어가며 최종적으로 화면에 찍히게 됨
   *
   * 1. Model Space
   * * 물체 자체의 로컬 좌표. 큐브 하나를 0,0,0에 두면 꼭짓점 하나는 -1,-1,-1이 될 것.
   *
   * 2. World Space
   * * 여러 물체를 한 장면(Scene)에 배치할 때 쓰는 좌표계
   *
   * 3. View Space (=Camera Space)
   * * 카메라 기준으로 본 좌표
   * * 카메라에서 본물체의 상대 위치
   *
   * 4. Clip Space (투영 좌표)
   * * 카메라가 본 장면을 2D 화면에 맞게 투영
   * * projectionMatrix를 통해 변환됨
   *
   * 5. NDC (Normalized Device Coordinates)
   * * 투영된 좌표를 -1 ~ 1 범위로 정규화
   *
   * 6. Screen Space
   * * 실제 픽셀의 좌표
   * * 모니터 해상도 단위
   *
   * ## 수식으로 보면
   *
   * 정점 Position이 최종적으로 gl_Position이 되는 과정은
   * ```
   * vec4 modelPosition = vec4(position, 1.0); // 물체 로컬 좌표
   * vec4 worldPosition = modelMatrix * modelPosition; // Scene 속 위치
   * vec4 viewPosition = viewMatrix * worldPosition; // 카메라 기준 위치
   * vec4 clipPosition = projectionMatrix * viewPosition; // 2D 화면 투영 좌표
   * // Clip Space -> NDC -> Screen Space 과정은 GPU가 자동으로 처리함
   * gl_Position = clipPosition;
   * ```
   * modelMatrix로
   *
   * WebGL에서는 종종 modelViewMatrix로 model * view를 합쳐서 쓰기도 함
   */

  /**
   * Fragment/Pixel Shader
   * 화면의 각 픽셀이 어떤 색으로 보일지 결정하는 shader.
   * 텍스처, 조명, 그림자, 반사 같은 효과를 구현
   */
  const fragment = `
    // 정밀도 설정 (highp: 16bit, mediump: 10bit, lowp: 8bit)
    // Fragment Shader에서는 계산 정밀도를 반드시 지정해야 한다.
    precision mediump float;

    // Vertex Shader에서 전달된 알파값 (varying이 붙으면 그런거임)
    varying float vAlpha;

    void main() {
      // gl_PointCoord: 내장 전역 변수. 포인트 스프라이트의 픽셀 좌표 (0 ~ 1)
      // 중심은 (0.5, 0.5)인데, 여기에서는 중심을 (0, 0)으로 옮겨서 계산
      vec2 p = gl_PointCoord - vec2(0.5);

      // 원점(0,0)으로부터의 거리 계산
      float dist = length(p);

      // 원의 반지름(0.5)보다 크면 픽셀을 버림
      // 즉, 점(사각형)을 원형으로 마스킹 하겠다는 것
      if (dist > 0.5) discard;

      // 원의 테두리 부분을 부드럽게 만들기 위해 smoothstep 함수 사용
      // 0.45 ~ 0.5 사이의 값을 사용하여 부드러운 경계를 만듦. 안티앨리어싱 효과를 주는 것.
      float edge = smoothstep(0.45, 0.5, dist);
      float alpha = (1.0 - edge) * vAlpha;

      // 색상 설정 (주황색), 0 ~ 1 범위의 값으로 normalized된 값
      vec3 color = vec3(245.0, 158.0, 11.0) / 255.0;

      // gl_FragColor: 내장 전역 변수. 픽셀의 최종 색상
      gl_FragColor = vec4(color, alpha);
    }
  `

  return (
    <points frustumCulled={false} ref={pointsRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute args={[positions, 3]} attach="attributes-position" />
        <bufferAttribute args={[sizes, 1]} attach="attributes-aSize" />
        <bufferAttribute args={[alphas, 1]} attach="attributes-aAlpha" />
      </bufferGeometry>
      <shaderMaterial
        alphaTest={0.001}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        fragmentShader={fragment}
        transparent
        vertexShader={vertex}
      />
    </points>
  )
}

const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min)
