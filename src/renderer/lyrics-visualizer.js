/**
 * Three.js Lyrics Visualizer
 * Creates a beautiful 3D lyrics display
 */

class LyricsVisualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.textMeshes = [];
    this.currentLyricIndex = -1;
    this.animationFrameId = null;
    this.initialized = false;
    
    this.init();
  }
  
  init() {
    if (this.initialized) return;
    
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05050a);
    this.scene.fog = new THREE.Fog(0x05050a, 100, 1000);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.canvas.clientWidth / this.canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.z = 50;
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ 
      canvas: this.canvas, 
      antialias: true, 
      alpha: false 
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xff00ff, 1);
    pointLight.position.set(50, 50, 50);
    pointLight.castShadow = true;
    this.scene.add(pointLight);
    
    const pointLight2 = new THREE.PointLight(0x00ffff, 0.8);
    pointLight2.position.set(-50, -50, 50);
    this.scene.add(pointLight2);
    
    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
    
    // Start render loop
    this.animate();
    this.initialized = true;
  }
  
  async displayLyrics(lyricsArray) {
    // Clear existing meshes
    this.textMeshes.forEach((mesh) => {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    });
    this.textMeshes = [];
    
    // Load font (using built-in THREE.js font or a simple default)
    const fontLoader = new THREE.FontLoader();
    
    try {
      // Try to load a font from node_modules
      const font = await new Promise((resolve, reject) => {
        fontLoader.load(
          '/node_modules/three/examples/fonts/helvetiker_regular.typeface.json',
          resolve,
          undefined,
          reject
        );
      });
      
      this.createTextMeshes(lyricsArray, font);
    } catch (err) {
      // Fallback: use canvas texture if font loading fails
      this.createFallbackTextMeshes(lyricsArray);
    }
  }
  
  createTextMeshes(lyricsArray, font) {
    const spacing = 8;
    let yPosition = (lyricsArray.length * spacing) / 2;
    
    lyricsArray.forEach((lyric, index) => {
      const geometry = new THREE.TextGeometry(lyric, {
        font: font,
        size: 2,
        depth: 0.1,
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelOffset: 0,
        bevelSegments: 5,
      });
      
      geometry.center();
      
      const material = new THREE.MeshPhongMaterial({
        color: 0x00ddff,
        emissive: 0x003366,
        shininess: 100,
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = yPosition;
      mesh.userData.lyricsIndex = index;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      this.scene.add(mesh);
      this.textMeshes.push(mesh);
      
      yPosition -= spacing;
    });
  }
  
  createFallbackTextMeshes(lyricsArray) {
    // Simple fallback using canvas texture and planes
    const spacing = 8;
    let yPosition = (lyricsArray.length * spacing) / 2;
    
    lyricsArray.forEach((lyric, index) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 512;
      canvas.height = 128;
      
      ctx.fillStyle = '#05050a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#00ddff';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lyric, canvas.width / 2, canvas.height / 2);
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true,
        emissiveMap: texture,
        emissive: 0x003366,
      });
      
      const geometry = new THREE.PlaneGeometry(16, 4);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = yPosition;
      mesh.userData.lyricsIndex = index;
      mesh.castShadow = true;
      
      this.scene.add(mesh);
      this.textMeshes.push(mesh);
      
      yPosition -= spacing;
    });
  }
  
  updateCurrentLyric(index) {
    // Fade out previous lyric
    if (this.currentLyricIndex >= 0 && this.textMeshes[this.currentLyricIndex]) {
      const prevMesh = this.textMeshes[this.currentLyricIndex];
      if (prevMesh.material.emissive) {
        prevMesh.material.emissive.setHex(0x003366);
      }
      prevMesh.userData.isCurrent = false;
    }
    
    // Highlight current lyric
    if (index >= 0 && index < this.textMeshes.length) {
      const mesh = this.textMeshes[index];
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(0xff00ff);
      }
      mesh.userData.isCurrent = true;
      mesh.userData.highlightTime = Date.now();
      
      // Animate camera to focus on current lyric
      this.animateCameraToLyric(mesh);
      
      this.currentLyricIndex = index;
    }
  }
  
  animateCameraToLyric(mesh) {
    const targetZ = 30 + Math.sin(Date.now() * 0.001) * 10;
    this.camera.position.lerp(
      new THREE.Vector3(mesh.position.x, mesh.position.y, targetZ),
      0.1
    );
  }
  
  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());
    
    if (!this.renderer) return;
    
    // Rotate and animate text meshes
    this.textMeshes.forEach((mesh) => {
      if (mesh.userData.isCurrent) {
        mesh.rotation.x += 0.002;
        mesh.rotation.z += 0.001;
        mesh.scale.lerp(
          new THREE.Vector3(1.2, 1.2, 1.2),
          0.05
        );
      } else {
        mesh.rotation.x *= 0.98;
        mesh.rotation.z *= 0.98;
        mesh.scale.lerp(
          new THREE.Vector3(1, 1, 1),
          0.05
        );
      }
    });
    
    // Update camera with smooth motion
    this.camera.position.x *= 0.95;
    
    this.renderer.render(this.scene, this.camera);
  }
  
  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    this.textMeshes.forEach((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (mesh.material.map) mesh.material.map.dispose();
        mesh.material.dispose();
      }
    });
    
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

export default LyricsVisualizer;
