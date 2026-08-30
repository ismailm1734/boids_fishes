// --- CONFIGURATION ---
const CONFIG = {
    // Canvas & World
    WORLD_WIDTH: 3000,
    WORLD_HEIGHT: 3000,
    BACKGROUND_COLOR_INNER: '#0a2e3f',
    BACKGROUND_COLOR_OUTER: '#020c1b',
    FPS: 60,

    // Boids (Fish)
    NUM_BOIDS: 150,
    BOID_SIZE: 6,
    MAX_SPEED: 3.5,
    MAX_FORCE: 0.1,
    PERCEPTION_RADIUS: 50,

    // Boid Weights
    SEPARATION_WEIGHT: 2.0,
    ALIGNMENT_WEIGHT: 1.0,
    COHESION_WEIGHT: 1.0,
    LIGHT_ATTRACTION_WEIGHT: 2.5,
    OBSTACLE_AVOIDANCE_WEIGHT: 3.0,

    // Light (Player Cursor)
    LIGHT_RADIUS_MIN: 100,
    LIGHT_RADIUS_MAX: 300,
    LIGHT_GROWTH_RATE: 0.1,
    LIGHT_DECAY_RATE: 0.05,
    DENSITY_RADIUS: 150, // Radius to check for fish density to boost light

    // Predators
    NUM_PREDATORS: 3,
    PREDATOR_SIZE: 12,
    PREDATOR_MAX_SPEED: 4.5,
    PREDATOR_MAX_FORCE: 0.08,
    PREDATOR_PERCEPTION: 250,
    PREDATOR_FEAR_LIGHT_THRESHOLD: 0.5, // Intensity at which predators flee
    PREDATOR_FLEE_WEIGHT: 3.0,

    // Obstacles
    NUM_OBSTACLES: 30,
    OBSTACLE_MIN_RADIUS: 20,
    OBSTACLE_MAX_RADIUS: 80,

    // Game
    GOAL_RADIUS: 150
};

// --- UTILS ---
class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
    }

    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
    }

    mult(n) {
        this.x *= n;
        this.y *= n;
    }

    div(n) {
        this.x /= n;
        this.y /= n;
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    magSq() {
        return this.x * this.x + this.y * this.y;
    }

    normalize() {
        let m = this.mag();
        if (m !== 0 && m !== 1) {
            this.div(m);
        }
    }

    limit(max) {
        if (this.magSq() > max * max) {
            this.normalize();
            this.mult(max);
        }
    }

    setMag(n) {
        this.normalize();
        this.mult(n);
    }

    heading() {
        return Math.atan2(this.y, this.x);
    }

    copy() {
        return new Vector(this.x, this.y);
    }

    dist(v) {
        let dx = this.x - v.x;
        let dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    static sub(v1, v2) {
        return new Vector(v1.x - v2.x, v1.y - v2.y);
    }

    static dist(v1, v2) {
        return v1.dist(v2);
    }
}

// --- OBSTACLE CLASS ---
class Obstacle {
    constructor(x, y, radius) {
        this.position = new Vector(x, y);
        this.radius = radius;
    }

    render(ctx) {
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#061a24';
        ctx.fill();
        ctx.strokeStyle = '#0a2e3f';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

// --- PREDATOR CLASS ---
class Predator {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = new Vector(Math.random() * 2 - 1, Math.random() * 2 - 1);
        this.velocity.setMag(Math.random() * CONFIG.PREDATOR_MAX_SPEED + 1);
        this.acceleration = new Vector(0, 0);
        this.size = CONFIG.PREDATOR_SIZE;
        this.state = 'hunting'; // 'hunting' or 'fleeing'
    }

    applyForce(force) {
        this.acceleration.add(force);
    }

    update() {
        this.velocity.add(this.acceleration);
        this.velocity.limit(CONFIG.PREDATOR_MAX_SPEED);
        this.position.add(this.velocity);
        this.acceleration.mult(0);
    }

    render(ctx) {
        let theta = this.velocity.heading() + Math.PI / 2;

        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(theta);

        ctx.beginPath();
        ctx.moveTo(0, -this.size * 2);
        // Sharp fins/spikes
        ctx.lineTo(-this.size * 1.5, this.size);
        ctx.lineTo(-this.size * 0.5, this.size * 0.5);
        ctx.lineTo(0, this.size * 2);
        ctx.lineTo(this.size * 0.5, this.size * 0.5);
        ctx.lineTo(this.size * 1.5, this.size);
        ctx.closePath();

        ctx.fillStyle = '#aa3333';
        if (this.state === 'fleeing') {
            ctx.fillStyle = '#ff8888';
        }
        ctx.fill();
        ctx.strokeStyle = '#ff5555';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    hunt(boids, obstacles, lightPos, lightIntensity) {
        // 1. Check Light
        let distToLight = Vector.dist(this.position, lightPos);
        let currentLightRadius = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * lightIntensity;

        // Flee if light is bright and we are close
        if (lightIntensity > CONFIG.PREDATOR_FEAR_LIGHT_THRESHOLD && distToLight < currentLightRadius * 1.5) {
            this.state = 'fleeing';
            let fleeForce = this.flee(lightPos);
            fleeForce.mult(CONFIG.PREDATOR_FLEE_WEIGHT);
            this.applyForce(fleeForce);
        } else {
            this.state = 'hunting';

            // 2. Find target (closest boid NOT in light)
            let closestBoid = null;
            let recordDist = Infinity;

            for (let boid of boids) {
                // Predator can only see so far
                let d = Vector.dist(this.position, boid.position);
                if (d < CONFIG.PREDATOR_PERCEPTION) {
                    if (!boid.inLight && d < recordDist) {
                        recordDist = d;
                        closestBoid = boid;
                    }
                }
            }

            if (closestBoid) {
                // Seek the closest isolated boid
                let seekForce = this.seek(closestBoid.position);
                this.applyForce(seekForce);

                // Eat boid if close enough
                if (recordDist < this.size + closestBoid.size) {
                    let index = boids.indexOf(closestBoid);
                    if (index > -1) {
                        boids.splice(index, 1);
                    }
                }
            }
        }

        if (obstacles) {
            let avoid = this.avoidObstacles(obstacles);
            avoid.mult(CONFIG.OBSTACLE_AVOIDANCE_WEIGHT);
            this.applyForce(avoid);
        }

        // Keep in bounds
        this.applyForce(this.boundaries());
    }

    avoidObstacles(obstacles) {
        let steer = new Vector(0, 0);
        let count = 0;

        for (let obs of obstacles) {
            let d = Vector.dist(this.position, obs.position);
            let avoidDist = obs.radius + this.size * 3;

            if (d > 0 && d < avoidDist) {
                let diff = Vector.sub(this.position, obs.position);
                diff.normalize();
                diff.div(d);
                steer.add(diff);
                count++;
            }
        }

        if (count > 0) {
            steer.div(count);
            if (steer.magSq() > 0) {
                steer.setMag(CONFIG.PREDATOR_MAX_SPEED);
                steer.sub(this.velocity);
                steer.limit(CONFIG.PREDATOR_MAX_FORCE * 2);
            }
        }
        return steer;
    }

    seek(target) {
        let desired = Vector.sub(target, this.position);
        desired.setMag(CONFIG.PREDATOR_MAX_SPEED);
        let steer = Vector.sub(desired, this.velocity);
        steer.limit(CONFIG.PREDATOR_MAX_FORCE);
        return steer;
    }

    flee(target) {
        let desired = Vector.sub(this.position, target); // Opposite of seek
        desired.setMag(CONFIG.PREDATOR_MAX_SPEED);
        let steer = Vector.sub(desired, this.velocity);
        steer.limit(CONFIG.PREDATOR_MAX_FORCE * 1.5); // Panic stronger
        return steer;
    }

    boundaries() {
        let steer = new Vector(0, 0);
        let margin = 100;
        let turnForce = CONFIG.PREDATOR_MAX_FORCE * 2;

        if (this.position.x < margin) steer.x = turnForce;
        if (this.position.x > CONFIG.WORLD_WIDTH - margin) steer.x = -turnForce;
        if (this.position.y < margin) steer.y = turnForce;
        if (this.position.y > CONFIG.WORLD_HEIGHT - margin) steer.y = -turnForce;

        return steer;
    }
}

// --- BOID CLASS ---
class Boid {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = new Vector(Math.random() * 2 - 1, Math.random() * 2 - 1);
        this.velocity.setMag(Math.random() * CONFIG.MAX_SPEED + 1);
        this.acceleration = new Vector(0, 0);
        this.size = CONFIG.BOID_SIZE;
        this.inLight = false;
    }

    applyForce(force) {
        this.acceleration.add(force);
    }

    flock(boids, obstacles, lightPos, lightIntensity) {
        let sep = this.separate(boids);
        let ali = this.align(boids);
        let coh = this.cohesion(boids);

        sep.mult(CONFIG.SEPARATION_WEIGHT);
        ali.mult(CONFIG.ALIGNMENT_WEIGHT);
        coh.mult(CONFIG.COHESION_WEIGHT);

        this.applyForce(sep);
        this.applyForce(ali);
        this.applyForce(coh);

        if (obstacles) {
            let avoid = this.avoidObstacles(obstacles);
            avoid.mult(CONFIG.OBSTACLE_AVOIDANCE_WEIGHT);
            this.applyForce(avoid);
        }

        if (lightPos) {
            let attract = this.attractToLight(lightPos, lightIntensity);
            attract.mult(CONFIG.LIGHT_ATTRACTION_WEIGHT);
            this.applyForce(attract);
        }

        // Edge boundaries (bounce back)
        this.applyForce(this.boundaries());
    }

    avoidObstacles(obstacles) {
        let steer = new Vector(0, 0);
        let count = 0;

        for (let obs of obstacles) {
            let d = Vector.dist(this.position, obs.position);
            let avoidDist = obs.radius + this.size * 3; // Look ahead distance

            if (d > 0 && d < avoidDist) {
                let diff = Vector.sub(this.position, obs.position);
                diff.normalize();
                diff.div(d); // Weight by distance
                steer.add(diff);
                count++;
            }
        }

        if (count > 0) {
            steer.div(count);
            if (steer.magSq() > 0) {
                steer.setMag(CONFIG.MAX_SPEED);
                steer.sub(this.velocity);
                steer.limit(CONFIG.MAX_FORCE * 2); // Avoidance should be strong
            }
        }
        return steer;
    }

    attractToLight(lightPos, lightIntensity) {
        let d = Vector.dist(this.position, lightPos);
        let currentLightRadius = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * lightIntensity;

        this.inLight = d < currentLightRadius;

        if (d < currentLightRadius * 1.5) { // Attract from slightly outside the visual radius
            let force = this.seek(lightPos);
            // Stronger pull when inside the light, weaker outside
            let weight = d < currentLightRadius ? 1.0 : 0.2;
            force.mult(weight);
            return force;
        }
        return new Vector(0, 0);
    }

    update() {
        this.velocity.add(this.acceleration);
        this.velocity.limit(CONFIG.MAX_SPEED);
        this.position.add(this.velocity);
        this.acceleration.mult(0); // Reset for next frame
    }

    render(ctx) {
        let theta = this.velocity.heading() + Math.PI / 2;

        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(theta);

        ctx.beginPath();
        ctx.moveTo(0, -this.size * 2);
        ctx.lineTo(-this.size, this.size * 2);
        ctx.lineTo(this.size, this.size * 2);
        ctx.closePath();

        ctx.fillStyle = this.inLight ? '#88ffff' : '#4488aa';
        ctx.fill();

        if (this.inLight) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#88ffff';
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }

        ctx.restore();
    }

    // --- Steering Behaviors ---

    seek(target) {
        let desired = Vector.sub(target, this.position);
        desired.setMag(CONFIG.MAX_SPEED);
        let steer = Vector.sub(desired, this.velocity);
        steer.limit(CONFIG.MAX_FORCE);
        return steer;
    }

    separate(boids) {
        let desiredSeparation = this.size * 3;
        let steer = new Vector(0, 0);
        let count = 0;

        for (let other of boids) {
            let d = Vector.dist(this.position, other.position);
            if ((d > 0) && (d < desiredSeparation)) {
                let diff = Vector.sub(this.position, other.position);
                diff.normalize();
                diff.div(d); // Weight by distance
                steer.add(diff);
                count++;
            }
        }

        if (count > 0) {
            steer.div(count);
        }

        if (steer.magSq() > 0) {
            steer.setMag(CONFIG.MAX_SPEED);
            steer.sub(this.velocity);
            steer.limit(CONFIG.MAX_FORCE * 1.5); // Slightly stronger separation
        }

        return steer;
    }

    align(boids) {
        let neighborDist = CONFIG.PERCEPTION_RADIUS;
        let sum = new Vector(0, 0);
        let count = 0;

        for (let other of boids) {
            let d = Vector.dist(this.position, other.position);
            if ((d > 0) && (d < neighborDist)) {
                sum.add(other.velocity);
                count++;
            }
        }

        if (count > 0) {
            sum.div(count);
            sum.setMag(CONFIG.MAX_SPEED);
            let steer = Vector.sub(sum, this.velocity);
            steer.limit(CONFIG.MAX_FORCE);
            return steer;
        }
        return new Vector(0, 0);
    }

    cohesion(boids) {
        let neighborDist = CONFIG.PERCEPTION_RADIUS;
        let sum = new Vector(0, 0);
        let count = 0;

        for (let other of boids) {
            let d = Vector.dist(this.position, other.position);
            if ((d > 0) && (d < neighborDist)) {
                sum.add(other.position);
                count++;
            }
        }

        if (count > 0) {
            sum.div(count);
            return this.seek(sum);
        }
        return new Vector(0, 0);
    }

    boundaries() {
        let steer = new Vector(0, 0);
        let margin = 100;
        let turnForce = CONFIG.MAX_FORCE * 2;

        if (this.position.x < margin) steer.x = turnForce;
        if (this.position.x > CONFIG.WORLD_WIDTH - margin) steer.x = -turnForce;
        if (this.position.y < margin) steer.y = turnForce;
        if (this.position.y > CONFIG.WORLD_HEIGHT - margin) steer.y = -turnForce;

        return steer;
    }
}

// --- GAME ENGINE / STATE ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = {
    state: 'start', // 'start', 'playing', 'win', 'lose'
    boids: [],
    predators: [],
    obstacles: [],
    lightPos: new Vector(0, 0),
    targetLightPos: new Vector(0, 0),
    lightIntensity: 0,
    cameraOffset: new Vector(0, 0),
    goalPos: new Vector(CONFIG.WORLD_WIDTH - 200, CONFIG.WORLD_HEIGHT / 2), // Goal zone on the right
    startTime: 0,
    elapsedTime: 0
};

function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    gameState.state = 'playing';
    gameState.startTime = Date.now();
    gameState.boids = [];
    gameState.predators = [];
    gameState.obstacles = [];
    // Start game on the left side
    let startX = 400;
    let startY = CONFIG.WORLD_HEIGHT / 2;

    gameState.lightPos = new Vector(startX, startY);
    gameState.targetLightPos = gameState.lightPos.copy();

    for (let i = 0; i < CONFIG.NUM_BOIDS; i++) {
        gameState.boids.push(new Boid(
            startX + (Math.random() - 0.5) * 400,
            startY + (Math.random() - 0.5) * 400
        ));
    }

    for (let i = 0; i < CONFIG.NUM_PREDATORS; i++) {
        // Spawn randomly in the middle/right of the world
        gameState.predators.push(new Predator(
            startX + 1000 + Math.random() * (CONFIG.WORLD_WIDTH - startX - 1000),
            Math.random() * CONFIG.WORLD_HEIGHT
        ));
    }

    for (let i = 0; i < CONFIG.NUM_OBSTACLES; i++) {
        // Don't spawn obstacles too close to start or goal
        let x = startX + 400 + Math.random() * (CONFIG.WORLD_WIDTH - startX - 800);
        let y = Math.random() * CONFIG.WORLD_HEIGHT;
        let r = CONFIG.OBSTACLE_MIN_RADIUS + Math.random() * (CONFIG.OBSTACLE_MAX_RADIUS - CONFIG.OBSTACLE_MIN_RADIUS);
        gameState.obstacles.push(new Obstacle(x, y, r));
    }

    document.getElementById('hud').classList.remove('hidden');
    // Note: requestAnimationFrame is already running from the initial load event
}

function updateLightIntensity() {
    // Smooth light movement
    let moveLight = Vector.sub(gameState.targetLightPos, gameState.lightPos);
    moveLight.mult(0.1);
    gameState.lightPos.add(moveLight);

    // Calculate density of fish near light
    let densityCount = 0;
    for (let boid of gameState.boids) {
        if (Vector.dist(boid.position, gameState.lightPos) < CONFIG.DENSITY_RADIUS) {
            densityCount++;
        }
    }

    // Calculate target intensity based on density
    // E.g. if 50% of the flock is near the light, intensity is maxed.
    let densityRatio = densityCount / (gameState.boids.length * 0.5 || 1);
    let targetIntensity = Math.min(1.0, Math.max(0.0, densityRatio));

    // Smoothly adjust current intensity
    if (gameState.lightIntensity < targetIntensity) {
        gameState.lightIntensity += CONFIG.LIGHT_GROWTH_RATE;
    } else {
        gameState.lightIntensity -= CONFIG.LIGHT_DECAY_RATE;
    }
    gameState.lightIntensity = Math.min(1.0, Math.max(0.0, gameState.lightIntensity));

    // Update HUD
    document.getElementById('light-intensity').textContent = Math.round(gameState.lightIntensity * 100) + '%';
}

function updateCamera() {
    // Basic camera that loosely follows the light
    // Center of screen
    let cx = canvas.width / 2;
    let cy = canvas.height / 2;

    // Desired camera offset to keep light centered
    let targetOffsetX = gameState.lightPos.x - cx;
    let targetOffsetY = gameState.lightPos.y - cy;

    // Clamp camera to world bounds
    targetOffsetX = Math.max(0, Math.min(targetOffsetX, CONFIG.WORLD_WIDTH - canvas.width));
    targetOffsetY = Math.max(0, Math.min(targetOffsetY, CONFIG.WORLD_HEIGHT - canvas.height));

    // Smooth camera pan
    gameState.cameraOffset.x += (targetOffsetX - gameState.cameraOffset.x) * 0.05;
    gameState.cameraOffset.y += (targetOffsetY - gameState.cameraOffset.y) * 0.05;
}

function renderLight(ctx) {
    let currentLightRadius = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * gameState.lightIntensity;

    let grad = ctx.createRadialGradient(
        gameState.lightPos.x, gameState.lightPos.y, 0,
        gameState.lightPos.x, gameState.lightPos.y, currentLightRadius
    );

    // Pulsing alpha based on intensity
    let alpha = 0.2 + (gameState.lightIntensity * 0.3);

    grad.addColorStop(0, `rgba(136, 255, 255, ${alpha})`);
    grad.addColorStop(0.5, `rgba(136, 255, 255, ${alpha * 0.5})`);
    grad.addColorStop(1, 'rgba(136, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gameState.lightPos.x, gameState.lightPos.y, currentLightRadius, 0, Math.PI * 2);
    ctx.fill();

    // Core light dot
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#88ffff';
    ctx.beginPath();
    ctx.arc(gameState.lightPos.x, gameState.lightPos.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // reset
}

function checkWinLose() {
    if (gameState.state !== 'playing') return;

    // Check Lose Condition
    if (gameState.boids.length === 0) {
        gameState.state = 'lose';
        canvas.style.cursor = 'default';
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-time').textContent = gameState.elapsedTime;
        return;
    }

    // Check Win Condition: Calculate center of mass of remaining boids
    let centerOfMass = new Vector(0, 0);
    for (let boid of gameState.boids) {
        centerOfMass.add(boid.position);
    }
    centerOfMass.div(gameState.boids.length);

    if (Vector.dist(centerOfMass, gameState.goalPos) < CONFIG.GOAL_RADIUS) {
        gameState.state = 'win';
        canvas.style.cursor = 'default';
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('win-screen').classList.remove('hidden');
        document.getElementById('final-fish').textContent = gameState.boids.length;
        document.getElementById('win-time').textContent = gameState.elapsedTime;
    }
}

function animate() {
    // Resize handling
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    ctx.fillStyle = CONFIG.BACKGROUND_COLOR_INNER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (gameState.state === 'playing') {
        updateLightIntensity();
        updateCamera();

        // Update Time
        gameState.elapsedTime = Math.floor((Date.now() - gameState.startTime) / 1000);
        document.getElementById('time-elapsed').textContent = gameState.elapsedTime;
    }

    ctx.save();
    ctx.translate(-gameState.cameraOffset.x, -gameState.cameraOffset.y);

    // Draw world boundaries
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);

    // Draw goal
    ctx.fillStyle = 'rgba(100, 255, 100, 0.2)';
    ctx.beginPath();
    ctx.arc(gameState.goalPos.x, gameState.goalPos.y, CONFIG.GOAL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (let obs of gameState.obstacles) {
        obs.render(ctx);
    }

    renderLight(ctx);

    for (let boid of gameState.boids) {
        if (gameState.state === 'playing') {
            boid.flock(gameState.boids, gameState.obstacles, gameState.lightPos, gameState.lightIntensity);
            boid.update();
        }
        boid.render(ctx);
    }

    for (let pred of gameState.predators) {
        if (gameState.state === 'playing') {
            pred.hunt(gameState.boids, gameState.obstacles, gameState.lightPos, gameState.lightIntensity);
            pred.update();
        }
        pred.render(ctx);
    }

    ctx.restore();

    document.getElementById('fish-count').textContent = gameState.boids.length;

    if (gameState.state === 'playing') {
        checkWinLose();
    }

    requestAnimationFrame(animate);
}

window.addEventListener('load', () => {
    // --- CRITICAL: set canvas size immediately so it's not 0×0 / 300×150 ---
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    document.getElementById('start-btn').addEventListener('click', () => {
        document.getElementById('start-screen').classList.add('hidden');
        canvas.style.cursor = 'none'; // hide cursor during gameplay
        init();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-screen').classList.add('hidden');
        canvas.style.cursor = 'none';
        init();
    });

    document.getElementById('win-restart-btn').addEventListener('click', () => {
        document.getElementById('win-screen').classList.add('hidden');
        canvas.style.cursor = 'none';
        init();
    });

    // Track mouse/touch in screen space, convert to world space based on camera later
    window.addEventListener('mousemove', (e) => {
        gameState.targetLightPos.x = e.clientX + gameState.cameraOffset.x;
        gameState.targetLightPos.y = e.clientY + gameState.cameraOffset.y;
    });

    window.addEventListener('touchmove', (e) => {
        if(e.touches.length > 0) {
            gameState.targetLightPos.x = e.touches[0].clientX + gameState.cameraOffset.x;
            gameState.targetLightPos.y = e.touches[0].clientY + gameState.cameraOffset.y;
        }
    }, {passive: true});

    window.addEventListener('touchstart', (e) => {
        if(e.touches.length > 0) {
            gameState.targetLightPos.x = e.touches[0].clientX + gameState.cameraOffset.x;
            gameState.targetLightPos.y = e.touches[0].clientY + gameState.cameraOffset.y;
        }
    }, {passive: true});

    // Handle window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    // Start drawing the background immediately
    requestAnimationFrame(animate);
});
