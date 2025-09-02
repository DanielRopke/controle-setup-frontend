// src/components/FundoAnimado.tsx
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function FundoAnimado({ showBadge = true }: { showBadge?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    // Não abortar cedo: caso o ref não esteja presente por qualquer razão,
    // continuamos e criamos o container diretamente no body para garantir que o canvas seja criado.
    if (!mount) console.warn('FundoAnimado: mountRef não está definido, continuando e usando container no body');
  // Cena e câmera
  const scene = new THREE.Scene();
  // usar fundo transparente para permitir que o body/bg apareça atrás do canvas
  scene.background = null;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      1,
      1000
    );
    camera.position.z = 200;

    // Renderizador (protegido por try/catch para detectar erros de contexto WebGL)
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
    } catch (err) {
      console.error('FundoAnimado: falha ao criar WebGLRenderer', err);
      return () => {};
    }
  // Cria/usa um container fixo no final do body para evitar stacking contexts
  let container = document.getElementById('fundo-animado-root') as HTMLDivElement | null;
  let createdContainer = false;
  if (!container) {
    container = document.createElement('div');
    container.id = 'fundo-animado-root';
    // garante que fique atrás do conteúdo e que a scrollbar do navegador fique à frente
    container.style.position = 'fixed';
    container.style.inset = '0';
    container.style.zIndex = '-1';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);
    createdContainer = true;
  }

  // Anexa o canvas dentro do container; canvas ocupa 100% do container
  container.appendChild(renderer.domElement);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = '0';
  renderer.domElement.style.left = '0';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.pointerEvents = 'none';
  renderer.domElement.setAttribute('aria-label', 'Fundo animado visual');
  renderer.domElement.setAttribute('role', 'img');
  // garantir que o clear seja transparente (alpha = 0)
  renderer.setClearColor(0x000000, 0);

  console.info('FundoAnimado: canvas criado e anexado ao container', { containerId: container.id, renderer: !!renderer });

  // -- debug badge: exibe um pequeno indicador no canto inferior esquerdo para confirmar montagem
  if (showBadge) {
    try {
      let badge = document.getElementById('fundo-animado-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'fundo-animado-badge';
        badge.textContent = 'FundoAnimado: ON';
        badge.style.position = 'fixed';
        badge.style.left = '8px';
        badge.style.bottom = '8px';
        badge.style.zIndex = '60';
        badge.style.padding = '6px 8px';
        badge.style.fontSize = '12px';
        badge.style.fontFamily = 'Inter, system-ui, sans-serif';
        badge.style.color = '#0f172a';
        badge.style.background = 'rgba(255,255,255,0.9)';
        badge.style.borderRadius = '6px';
        badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        badge.style.pointerEvents = 'none';
        document.body.appendChild(badge);
      }
    } catch {
      // não crítico
    }
  } else {
    // se showBadge for false, garantir que o badge seja removido caso exista
    try {
      const existing = document.getElementById('fundo-animado-badge');
      if (existing && existing.parentElement) existing.parentElement.removeChild(existing);
    } catch {
      // não crítico
    }
  }

    // Textura circular das bolinhas (verde uniforme)
    const circleCanvas = document.createElement("canvas");
    circleCanvas.width = 64;
    circleCanvas.height = 64;
    const ctx = circleCanvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    // Cor verde uniforme
    gradient.addColorStop(0, "rgba(22, 163, 74, 1)"); // verde #16a34a
    gradient.addColorStop(1, "rgba(22, 163, 74, 1)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();

    const spriteTexture = new THREE.CanvasTexture(circleCanvas);

    const PARTICLE_COUNT = 300;
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 4);
    const opacities = new Float32Array(PARTICLE_COUNT);

    const velocities: THREE.Vector3[] = [];
    const phases: number[] = [];

    // Atualização: espalhamento proporcional à tela
    const spreadBase = 400;
    const aspect = window.innerWidth / window.innerHeight;
    const spreadX = spreadBase * aspect * 1.5; // mais largo horizontalmente
    const spreadY = spreadBase * 1.5;           // mais alto verticalmente
    const spreadZ = spreadBase;                  // profundidade padrão

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = Math.random() * spreadX - spreadX / 2;
      positions[i * 3 + 1] = Math.random() * spreadY - spreadY / 2;
      positions[i * 3 + 2] = Math.random() * spreadZ - spreadZ / 2;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2,
          (Math.random() - 0.5) * 0.2
        )
      );

      phases.push(Math.random() * Math.PI * 2);

      // Cor verde para as bolinhas
      colors[i * 4] = 22 / 255;
      colors[i * 4 + 1] = 163 / 255;
      colors[i * 4 + 2] = 74 / 255;
      colors[i * 4 + 3] = 1.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));

    const material = new THREE.PointsMaterial({
      size: 12,
      map: spriteTexture,
      vertexColors: true,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      sizeAttenuation: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const maxConnections = PARTICLE_COUNT * PARTICLE_COUNT;
    const linePositions = new Float32Array(maxConnections * 3 * 2);
    const lineColors = new Float32Array(maxConnections * 4 * 2);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    lineGeometry.setAttribute("color", new THREE.BufferAttribute(lineColors, 4));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      linewidth: 1,
    });

    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    const mouseLinePositions = new Float32Array(PARTICLE_COUNT * 3 * 2);
    const mouseLineColors = new Float32Array(PARTICLE_COUNT * 4 * 2);
    const mouseLineGeometry = new THREE.BufferGeometry();
    mouseLineGeometry.setAttribute("position", new THREE.BufferAttribute(mouseLinePositions, 3));
    mouseLineGeometry.setAttribute("color", new THREE.BufferAttribute(mouseLineColors, 4));

    const mouseLineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      linewidth: 1,
    });

    const mouseLines = new THREE.LineSegments(mouseLineGeometry, mouseLineMaterial);
    scene.add(mouseLines);

    const mouse = new THREE.Vector2(-1000, -1000);

    function onMouseMove(event: MouseEvent) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }
    window.addEventListener("mousemove", onMouseMove);

    // --- MOVIMENTAÇÃO SUAVE DA CÂMERA INÍCIO ---
    let targetCameraX = 0;
    let targetCameraY = 0;

    // Atualiza o target da câmera baseado no mouse
    function updateCameraTarget() {
      targetCameraX = mouse.x * 20; // escala de movimento na horizontal
      targetCameraY = mouse.y * 20; // escala de movimento na vertical
    }
    window.addEventListener("mousemove", () => {
      updateCameraTarget();
    });
    // --- MOVIMENTAÇÃO SUAVE DA CÂMERA FIM ---

    let time = 0;

    function animate() {
      requestAnimationFrame(animate);
      time += 0.02;

      const posAttr = geometry.attributes.position as THREE.BufferAttribute;
      const colorAttr = geometry.attributes.color as THREE.BufferAttribute;
      const linePosAttr = lineGeometry.attributes.position as THREE.BufferAttribute;
      const lineColorAttr = lineGeometry.attributes.color as THREE.BufferAttribute;
      const mouseLinePosAttr = mouseLineGeometry.attributes.position as THREE.BufferAttribute;
      const mouseLineColorAttr = mouseLineGeometry.attributes.color as THREE.BufferAttribute;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;

        positions[ix] += velocities[i].x;
        positions[ix + 1] += velocities[i].y;
        positions[ix + 2] += velocities[i].z;

        if (positions[ix] > spreadX / 2 || positions[ix] < -spreadX / 2)
          velocities[i].x = -velocities[i].x;
        if (positions[ix + 1] > spreadY / 2 || positions[ix + 1] < -spreadY / 2)
          velocities[i].y = -velocities[i].y;
        if (positions[ix + 2] > spreadZ / 2 || positions[ix + 2] < -spreadZ / 2)
          velocities[i].z = -velocities[i].z;

        const opacity = 0.3 + 0.7 * (Math.sin(time + phases[i]) * 0.5 + 0.5);
        opacities[i] = opacity;

        // Mantém o verde, mas atualiza a transparência com opacidade animada
        colorAttr.array[i * 4] = 22 / 255;
        colorAttr.array[i * 4 + 1] = 163 / 255;
        colorAttr.array[i * 4 + 2] = 74 / 255;
        colorAttr.array[i * 4 + 3] = opacity;
      }

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;

      let vertexpos = 0;
      let colorpos = 0;

      // LINHAS ENTRE BOLINHAS: cor VERDE mais escura para destaque
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        for (let j = i + 1; j < PARTICLE_COUNT; j++) {
          const jx = j * 3;
          const dx = positions[ix] - positions[jx];
          const dy = positions[ix + 1] - positions[jx + 1];
          const dz = positions[ix + 2] - positions[jx + 2];
          const distSquared = dx * dx + dy * dy + dz * dz;

          if (distSquared < 15000) {
            const lineOpacity = Math.min(opacities[i], opacities[j]) * 0.3; // Opacidade aumentada
            linePositions[vertexpos++] = positions[ix];
            linePositions[vertexpos++] = positions[ix + 1];
            linePositions[vertexpos++] = positions[ix + 2];
            linePositions[vertexpos++] = positions[jx];
            linePositions[vertexpos++] = positions[jx + 1];
            linePositions[vertexpos++] = positions[jx + 2];

            for (let k = 0; k < 2; k++) {
              // Verde mais escuro para as linhas: RGB (0, 100, 44)
              lineColors[colorpos++] = 0 / 255;
              lineColors[colorpos++] = 100 / 255;
              lineColors[colorpos++] = 44 / 255;
              lineColors[colorpos++] = lineOpacity;
            }
          }
        }
      }

      lines.geometry.setDrawRange(0, vertexpos / 3);
      linePosAttr.needsUpdate = true;
      lineColorAttr.needsUpdate = true;

      const mouseRaycaster = new THREE.Raycaster();
      mouseRaycaster.setFromCamera(mouse, camera);
      const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const mousePos3D = new THREE.Vector3();
      mouseRaycaster.ray.intersectPlane(planeZ, mousePos3D);

      let mVertexPos = 0;
      let mColorPos = 0;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3;
        const dx = positions[ix] - mousePos3D.x;
        const dy = positions[ix + 1] - mousePos3D.y;
        const dz = positions[ix + 2] - mousePos3D.z;
        const distSquared = dx * dx + dy * dy + dz * dz;

        if (distSquared < 18000) {
          const lineOpacity = opacities[i] * 0.4; // Linha do mouse mais opaca

          mouseLinePositions[mVertexPos++] = positions[ix];
          mouseLinePositions[mVertexPos++] = positions[ix + 1];
          mouseLinePositions[mVertexPos++] = positions[ix + 2];
          mouseLinePositions[mVertexPos++] = mousePos3D.x;
          mouseLinePositions[mVertexPos++] = mousePos3D.y;
          mouseLinePositions[mVertexPos++] = mousePos3D.z;

          for (let k = 0; k < 2; k++) {
            // Mesma cor verde escuro para linhas do mouse
            mouseLineColors[mColorPos++] = 0 / 255;
            mouseLineColors[mColorPos++] = 100 / 255;
            mouseLineColors[mColorPos++] = 44 / 255;
            mouseLineColors[mColorPos++] = lineOpacity;
          }
        }
      }

      mouseLines.geometry.setDrawRange(0, mVertexPos / 3);
      mouseLinePosAttr.needsUpdate = true;
      mouseLineColorAttr.needsUpdate = true;

      // --- MOVIMENTAÇÃO SUAVE DA CÂMERA ---
      camera.position.x += (targetCameraX - camera.position.x) * 0.05;
      camera.position.y += (targetCameraY - camera.position.y) * 0.05;
      camera.lookAt(scene.position);
      // --- FIM MOVIMENTAÇÃO SUAVE DA CÂMERA ---

      renderer.render(scene, camera);
    }

    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousemove", updateCameraTarget);
      // remover o canvas do container quando desmontar
      const c = document.getElementById('fundo-animado-root');
      if (renderer.domElement && c && c.contains(renderer.domElement)) {
        c.removeChild(renderer.domElement);
      }
      // se criamos o container, removê-lo também
      if (createdContainer) {
        const c2 = document.getElementById('fundo-animado-root');
        if (c2 && c2.parentElement) c2.parentElement.removeChild(c2);
      }
    };
  }, [showBadge]);

    return (
    <div
      ref={mountRef}
      // Mantém o wrapper como fixed mas com zIndex negativo para garantir que scrollbars e conteúdo fiquem acima
      style={{ width: '100vw', height: '100vh', position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none' }}
      aria-hidden="true"
    />
  );
}
