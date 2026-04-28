import streamlit.components.v1 as components

def render_globe_header():
    """
    Renders a 3D Three.js globe embedded in Streamlit as a custom HTML component.
    """
    three_js_html = """
    <!DOCTYPE html>
    <html>
    <head>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
        
        body { 
            margin: 0; 
            overflow: hidden; 
            background-color: transparent; 
            font-family: 'Inter', sans-serif; 
        }
        #canvas-container { 
            width: 100vw; 
            height: 200px; 
            position: relative; 
            /* Subtle dark gradient behind globe to ensure visibility without hard box */
            background: radial-gradient(circle at center, rgba(10,10,10,0.5) 0%, rgba(0,0,0,0) 70%);
        }
        #overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            pointer-events: none; /* Let mouse events pass to canvas */
            color: white;
            text-align: center;
            text-shadow: 0 2px 4px rgba(0,0,0,0.9);
        }
        h1 { 
            margin: 0; 
            font-size: 2.5rem; 
            color: #1D9E75; 
            letter-spacing: 3px; 
            text-transform: uppercase;
        }
        p { 
            margin: 5px 0 12px 0; 
            font-size: 1.1rem; 
            color: #e0e0e0; 
        }
        .aqi-badge {
            background: rgba(10, 10, 10, 0.7);
            border: 1px solid #1D9E75;
            border-radius: 20px;
            padding: 5px 18px;
            font-size: 1.2rem;
            font-weight: bold;
            box-shadow: 0 0 12px rgba(29, 158, 117, 0.4);
            backdrop-filter: blur(4px);
        }
        #aqi-counter {
            color: #ffeb3b; /* Defaults to yellow initially but dynamic normally */
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    </head>
    <body>
    <div id="canvas-container">
        <div id="overlay">
            <h1>ExpoAir</h1>
            <p>Live AQI • Pune Metropolitan Region</p>
            <div class="aqi-badge">Avg AQI: <span id="aqi-counter">124</span></div>
        </div>
    </div>

    <script>
        const container = document.getElementById('canvas-container');
        const scene = new THREE.Scene();
        
        // Camera setup
        const camera = new THREE.PerspectiveCamera(40, window.innerWidth / 200, 0.1, 1000);
        camera.position.z = 6; // Pull back to fit the full sphere vertically

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, 200);
        renderer.setClearColor(0x000000, 0); // Transparent background
        container.appendChild(renderer.domElement);

        const globeGroup = new THREE.Group();
        scene.add(globeGroup);

        // 1. Globe Sphere (Dark Blue)
        const geometry = new THREE.SphereGeometry(2, 40, 40);
        const material = new THREE.MeshBasicMaterial({ color: 0x051024 });
        const sphere = new THREE.Mesh(geometry, material);
        globeGroup.add(sphere);

        // 2. Wireframe Overlay (Teal)
        const wireframeGeo = new THREE.WireframeGeometry(geometry);
        const wireframeMat = new THREE.LineBasicMaterial({ 
            color: 0x1D9E75, 
            transparent: true, 
            opacity: 0.25 
        });
        const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
        globeGroup.add(wireframe);

        // 3. AQI Dots (Randomized over the surface)
        const aqiColors = [0x00c853, 0xffeb3b, 0xf44336]; // Green, Yellow, Red
        const numDots = 45;
        const dotGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        
        for (let i = 0; i < numDots; i++) {
            // Distribute evenly using golden ratio approach or randomly
            const phi = Math.acos(-1 + (2 * i) / numDots);
            const theta = Math.sqrt(numDots * Math.PI) * phi;
            
            const r = 2.01; // Rest slightly above the surface of the globe
            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const color = aqiColors[Math.floor(Math.random() * aqiColors.length)];
            const dotMat = new THREE.MeshBasicMaterial({ color: color });
            const dot = new THREE.Mesh(dotGeometry, dotMat);
            dot.position.set(x, y, z);
            globeGroup.add(dot);
        }

        // 4. Mouse interaction for lerp camera
        let mouseX = 0;
        let mouseY = 0;
        let targetX = 0;
        let targetY = 0;

        document.addEventListener('mousemove', (event) => {
            const windowHalfX = window.innerWidth / 2;
            const windowHalfY = 100; // Half of 200px height
            mouseX = (event.clientX - windowHalfX);
            mouseY = (event.clientY - windowHalfY);
        });

        // 5. Animation loop
        let baseRotationY = 0;
        const animate = function () {
            requestAnimationFrame(animate);

            // Auto-rotate globe slowly
            baseRotationY += 0.003;
            globeGroup.rotation.y = baseRotationY;

            // Optional slight axial tilt
            globeGroup.rotation.z = 0.1;

            // Camera orbits slightly on mouse move (lerp-based parallax)
            targetX = mouseX * 0.002;
            targetY = mouseY * 0.002;
            
            camera.position.x += (targetX - camera.position.x) * 0.05;
            camera.position.y += (-targetY - camera.position.y) * 0.05;
            camera.lookAt(scene.position);

            renderer.render(scene, camera);
        };

        animate();

        // Handle iframe boundary resizing gracefully
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / 200;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, 200);
        });
    </script>
    </body>
    </html>
    """
    
    # We use v1 html component directly passing our generated string
    components.html(three_js_html, height=200)
