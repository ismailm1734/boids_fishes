// ============================================
// SHOAL — An Ocean Survival Game
// Enhanced Boids Simulation with Wave System
// ============================================

// ---- Configuration ----
const CONFIG = {
    WORLD_WIDTH: 3000, WORLD_HEIGHT: 3000,

    // Boids
    NUM_BOIDS: 150, BOID_SIZE: 6,
    MAX_SPEED: 3.5, MAX_FORCE: 0.1,
    PERCEPTION_RADIUS: 60,
    BOID_FOV: Math.PI * 1.5, // 270°

    // Boid Weights
    SEPARATION_WEIGHT: 2.0, ALIGNMENT_WEIGHT: 1.0, COHESION_WEIGHT: 1.0,
    WANDER_WEIGHT: 0.3, LIGHT_ATTRACTION_WEIGHT: 2.5,
    OBSTACLE_AVOIDANCE_WEIGHT: 3.5, FEAR_WEIGHT: 4.0,
    CURRENT_WEIGHT: 1.5, FOOD_ATTRACTION_WEIGHT: 0.8,
    FEAR_RADIUS: 200,

    // Light
    LIGHT_RADIUS_MIN: 100, LIGHT_RADIUS_MAX: 300,
    LIGHT_GROWTH_RATE: 0.08, LIGHT_DECAY_RATE: 0.04,
    DENSITY_RADIUS: 150,

    // Shark
    SHARK_SIZE: 14, SHARK_PATROL_SPEED: 3.0, SHARK_CHARGE_SPEED: 7.0,
    SHARK_MAX_FORCE: 0.1, SHARK_PERCEPTION: 300,
    SHARK_STALK_DIST: 250, SHARK_CHARGE_DIST: 150,
    SHARK_FEAR_LIGHT: 0.5, SHARK_COOLDOWN: 150, SHARK_FLEE_WEIGHT: 3.0,

    // Anglerfish
    ANGLER_SIZE: 18, ANGLER_SPEED: 2.0, ANGLER_MAX_FORCE: 0.05,
    ANGLER_LURE_RADIUS: 140, ANGLER_FEAR_LIGHT: 0.7, ANGLER_EAT_RADIUS: 30,

    // Jellyfish
    JELLY_SIZE: 15, JELLY_SPEED: 1.0,
    JELLY_SLOW_RADIUS: 45, JELLY_SLOW_FACTOR: 0.3, JELLY_KNOCKBACK: 2.5,

    // Environment
    NUM_OBSTACLES: 25, OBSTACLE_MIN_R: 20, OBSTACLE_MAX_R: 80,
    CURRENT_WIDTH: 100, CURRENT_FORCE: 0.8,
    WHIRLPOOL_RADIUS: 150, WHIRLPOOL_FORCE: 0.06,

    // Food
    FOOD_SPAWN_INTERVAL: 180, FOOD_MAX: 6, FOOD_RADIUS: 8,
    FOOD_ATTRACTION_RADIUS: 120, COMBO_TIMEOUT: 240, MAX_COMBO: 5,

    // Scoring
    FISH_SCORE: 100, FOOD_SCORE: 50, WAVE_BONUS: 500,

    // Wave Timing (frames)
    WAVE_INTRO_DURATION: 180, WAVE_REST_DURATION: 300,

    // Spatial Grid
    GRID_CELL_SIZE: 120,
};

const WAVES = [
    { duration: 45, sharks: 2, anglers: 0, jellies: 0, currents: 0, whirlpools: 0, hint: 'Currents are closing in...' },
    { duration: 50, sharks: 3, anglers: 0, jellies: 0, currents: 2, whirlpools: 0, hint: 'A false light in the dark...' },
    { duration: 55, sharks: 3, anglers: 1, jellies: 0, currents: 2, whirlpools: 1, hint: 'The chaos is rising...' },
    { duration: 60, sharks: 4, anglers: 2, jellies: 0, currents: 3, whirlpools: 2, hint: 'The final wave is coming!' },
    { duration: 75, sharks: 5, anglers: 2, jellies: 4, currents: 4, whirlpools: 3, hint: '' },
];

// ---- Utility: Vector ----
class Vector {
    constructor(x, y) { this.x = x; this.y = y; }
    add(v) { this.x += v.x; this.y += v.y; }
    sub(v) { this.x -= v.x; this.y -= v.y; }
    mult(n) { this.x *= n; this.y *= n; }
    div(n) { if (n !== 0) { this.x /= n; this.y /= n; } }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    magSq() { return this.x * this.x + this.y * this.y; }
    normalize() { const m = this.mag(); if (m > 0) this.div(m); }
    limit(max) { if (this.magSq() > max * max) { this.normalize(); this.mult(max); } }
    setMag(n) { this.normalize(); this.mult(n); }
    heading() { return Math.atan2(this.y, this.x); }
    copy() { return new Vector(this.x, this.y); }
    dist(v) { return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2); }
    rotate(angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        const nx = this.x * c - this.y * s;
        const ny = this.x * s + this.y * c;
        this.x = nx; this.y = ny;
    }
    static sub(a, b) { return new Vector(a.x - b.x, a.y - b.y); }
    static dist(a, b) { return a.dist(b); }
    static random() { const a = Math.random() * Math.PI * 2; return new Vector(Math.cos(a), Math.sin(a)); }
}

// ---- Utility: Spatial Grid ----
class SpatialGrid {
    constructor(cellSize, w, h) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(w / cellSize);
        this.rows = Math.ceil(h / cellSize);
        this.cells = new Map();
    }
    clear() { this.cells.clear(); }
    _key(c, r) { return c * 10000 + r; }
    insert(entity) {
        const c = Math.floor(entity.position.x / this.cellSize);
        const r = Math.floor(entity.position.y / this.cellSize);
        const k = this._key(c, r);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(entity);
    }
    query(pos, radius) {
        const results = [];
        const minC = Math.floor((pos.x - radius) / this.cellSize);
        const maxC = Math.floor((pos.x + radius) / this.cellSize);
        const minR = Math.floor((pos.y - radius) / this.cellSize);
        const maxR = Math.floor((pos.y + radius) / this.cellSize);
        for (let c = minC; c <= maxC; c++) {
            for (let r = minR; r <= maxR; r++) {
                const cell = this.cells.get(this._key(c, r));
                if (cell) for (const e of cell) results.push(e);
            }
        }
        return results;
    }
}

// ---- Effects: Particle ----
class Particle {
    constructor(x, y, color, speed, life) {
        this.pos = new Vector(x, y);
        const dir = Vector.random();
        dir.mult(speed * (0.5 + Math.random()));
        this.vel = dir;
        this.life = life || 40 + Math.random() * 20;
        this.maxLife = this.life;
        this.color = color;
        this.size = 2 + Math.random() * 3;
    }
    update() { this.pos.add(this.vel); this.vel.mult(0.96); this.life--; }
    render(ctx) {
        const a = this.life / this.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.size * a, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    get dead() { return this.life <= 0; }
}

// ---- Effects: Floating Text ----
class FloatingText {
    constructor(x, y, text, color) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.life = 60; this.maxLife = 60;
    }
    update() { this.y -= 1.2; this.life--; }
    render(ctx) {
        const a = this.life / this.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = this.color;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowBlur = 6; ctx.shadowColor = this.color;
        ctx.fillText(this.text, this.x, this.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
    get dead() { return this.life <= 0; }
}

// ---- Collectible: Food ----
class Food {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.collected = false;
        this.phase = Math.random() * Math.PI * 2;
        this.radius = CONFIG.FOOD_RADIUS;
    }
    render(ctx, frame) {
        if (this.collected) return;
        const pulse = 1 + Math.sin(frame * 0.08 + this.phase) * 0.3;
        const r = this.radius * pulse;
        // Outer glow
        const grad = ctx.createRadialGradient(this.position.x, this.position.y, 0, this.position.x, this.position.y, r * 3);
        grad.addColorStop(0, 'rgba(255, 220, 80, 0.4)');
        grad.addColorStop(1, 'rgba(255, 220, 80, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
        // Core
        ctx.fillStyle = '#ffdd55';
        ctx.shadowBlur = 10; ctx.shadowColor = '#ffaa22';
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

// ---- Environment: Current ----
class Current {
    constructor(x, y, length, angle) {
        this.position = new Vector(x, y);
        this.length = length;
        this.angle = angle;
        this.direction = new Vector(Math.cos(angle), Math.sin(angle));
        this.width = CONFIG.CURRENT_WIDTH;
    }
    getForce(pos) {
        // Check if pos is inside the current band
        const rel = Vector.sub(pos, this.position);
        // Project onto direction and perpendicular
        const along = rel.x * this.direction.x + rel.y * this.direction.y;
        const perp = Math.abs(-rel.x * this.direction.y + rel.y * this.direction.x);
        if (along >= 0 && along <= this.length && perp <= this.width / 2) {
            const force = this.direction.copy();
            force.mult(CONFIG.CURRENT_FORCE);
            return force;
        }
        return null;
    }
    render(ctx, frame) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(this.angle);
        // Background band
        ctx.fillStyle = 'rgba(40, 120, 160, 0.08)';
        ctx.fillRect(0, -this.width / 2, this.length, this.width);
        // Animated arrows
        const arrowSpacing = 60;
        const offset = (frame * 1.5) % arrowSpacing;
        ctx.strokeStyle = 'rgba(80, 180, 220, 0.25)';
        ctx.lineWidth = 2;
        for (let x = offset; x < this.length; x += arrowSpacing) {
            const fadeIn = Math.min(1, x / 100);
            const fadeOut = Math.min(1, (this.length - x) / 100);
            ctx.globalAlpha = fadeIn * fadeOut * 0.4;
            const aSize = 10;
            ctx.beginPath();
            ctx.moveTo(x - aSize, -aSize);
            ctx.lineTo(x, 0);
            ctx.lineTo(x - aSize, aSize);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// ---- Environment: Whirlpool ----
class Whirlpool {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.radius = CONFIG.WHIRLPOOL_RADIUS;
        this.phase = Math.random() * Math.PI * 2;
        this.rotationAngle = 0;
    }
    getForce(pos) {
        const d = Vector.dist(pos, this.position);
        if (d > 0 && d < this.radius) {
            const strength = (1 - d / this.radius) * CONFIG.WHIRLPOOL_FORCE;
            // Pull toward center + tangential rotation
            const toCenter = Vector.sub(this.position, pos);
            toCenter.normalize();
            toCenter.mult(strength);
            // Add tangential component
            const tangent = new Vector(-toCenter.y, toCenter.x);
            tangent.mult(strength * 0.5);
            toCenter.add(tangent);
            return toCenter;
        }
        return null;
    }
    update() { this.rotationAngle += 0.02; }
    render(ctx, frame) {
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        // Concentric rotating rings
        for (let i = 3; i >= 0; i--) {
            const r = this.radius * (i + 1) / 4;
            const alpha = 0.05 + i * 0.03;
            ctx.strokeStyle = `rgba(100, 200, 255, ${alpha})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            const startAngle = this.rotationAngle * (i % 2 === 0 ? 1 : -1) + i;
            ctx.arc(0, 0, r, startAngle, startAngle + Math.PI * 1.5);
            ctx.stroke();
        }
        // Center glow
        const cGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.3);
        cGrad.addColorStop(0, 'rgba(50, 150, 200, 0.15)');
        cGrad.addColorStop(1, 'rgba(50, 150, 200, 0)');
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---- Environment: Obstacle ----
class Obstacle {
    constructor(x, y, radius) {
        this.position = new Vector(x, y);
        this.radius = radius;
        // Generate random coral bumps
        this.bumps = [];
        const numBumps = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < numBumps; i++) {
            this.bumps.push({
                angle: (Math.PI * 2 / numBumps) * i + (Math.random() - 0.5) * 0.5,
                size: 0.15 + Math.random() * 0.25
            });
        }
    }
    render(ctx) {
        // Main body
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0a1a28';
        ctx.fill();
        ctx.strokeStyle = '#1a3a4f';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Coral bumps
        for (const b of this.bumps) {
            const bx = this.position.x + Math.cos(b.angle) * this.radius * 0.8;
            const by = this.position.y + Math.sin(b.angle) * this.radius * 0.8;
            ctx.beginPath();
            ctx.arc(bx, by, this.radius * b.size, 0, Math.PI * 2);
            ctx.fillStyle = '#0e2233';
            ctx.fill();
        }
    }
}

// ---- Creature: Boid (Fish) ----
class Boid {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = Vector.random();
        this.velocity.setMag(1 + Math.random() * CONFIG.MAX_SPEED);
        this.acceleration = new Vector(0, 0);
        this.size = CONFIG.BOID_SIZE;
        this.inLight = false;
        this.frightened = false;
        this.stunTimer = 0;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.tailPhase = Math.random() * Math.PI * 2;
    }

    applyForce(f) { this.acceleration.add(f); }

    isInFOV(other) {
        const toOther = Vector.sub(other.position, this.position);
        const headAngle = this.velocity.heading();
        const otherAngle = toOther.heading();
        let diff = otherAngle - headAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) < CONFIG.BOID_FOV / 2;
    }

    flock(grid, obstacles, lightPos, lightIntensity, predators, anglerfish, foods, currents, whirlpools) {
        this.frightened = false;
        const neighbors = grid.query(this.position, CONFIG.PERCEPTION_RADIUS);

        // Classic boid behaviors with FOV
        let sep = this.separate(neighbors);
        let ali = this.align(neighbors);
        let coh = this.cohesion(neighbors);
        let wan = this.wander();

        sep.mult(CONFIG.SEPARATION_WEIGHT);
        ali.mult(CONFIG.ALIGNMENT_WEIGHT);
        coh.mult(CONFIG.COHESION_WEIGHT);
        wan.mult(CONFIG.WANDER_WEIGHT);

        this.applyForce(sep);
        this.applyForce(ali);
        this.applyForce(coh);
        this.applyForce(wan);

        // Obstacle avoidance
        if (obstacles.length) {
            let avoid = this.avoidObstacles(obstacles);
            avoid.mult(CONFIG.OBSTACLE_AVOIDANCE_WEIGHT);
            this.applyForce(avoid);
        }

        // Light attraction
        if (lightPos) {
            let attract = this.attractToLight(lightPos, lightIntensity);
            attract.mult(CONFIG.LIGHT_ATTRACTION_WEIGHT);
            this.applyForce(attract);
        }

        // Fear from predators (sharks + anglerfish)
        const allPredators = [...predators];
        for (const a of anglerfish) allPredators.push(a);
        if (allPredators.length) {
            let fear = this.flee(allPredators);
            fear.mult(CONFIG.FEAR_WEIGHT);
            this.applyForce(fear);
        }

        // Anglerfish lure attraction (only when NOT in light)
        if (!this.inLight) {
            for (const a of anglerfish) {
                if (a.lurePos) {
                    let lure = this.attractToLure(a.lurePos);
                    lure.mult(CONFIG.FOOD_ATTRACTION_WEIGHT * 0.6);
                    this.applyForce(lure);
                }
            }
        }

        // Food attraction
        if (foods.length) {
            let foodForce = this.attractToFood(foods);
            foodForce.mult(CONFIG.FOOD_ATTRACTION_WEIGHT);
            this.applyForce(foodForce);
        }

        // Currents
        for (const c of currents) {
            const f = c.getForce(this.position);
            if (f) { f.mult(CONFIG.CURRENT_WEIGHT); this.applyForce(f); }
        }

        // Whirlpools
        for (const w of whirlpools) {
            const f = w.getForce(this.position);
            if (f) this.applyForce(f);
        }

        this.applyForce(this.boundaries());
    }

    wander() {
        this.wanderAngle += (Math.random() - 0.5) * 0.5;
        const ahead = this.velocity.copy();
        ahead.normalize(); ahead.mult(20);
        const offset = new Vector(Math.cos(this.wanderAngle), Math.sin(this.wanderAngle));
        offset.mult(10);
        ahead.add(offset);
        ahead.limit(CONFIG.MAX_FORCE * 0.5);
        return ahead;
    }

    flee(predators) {
        let steer = new Vector(0, 0);
        let count = 0;
        for (const pred of predators) {
            const d = Vector.dist(this.position, pred.position);
            if (d > 0 && d < CONFIG.FEAR_RADIUS) {
                const diff = Vector.sub(this.position, pred.position);
                diff.normalize();
                diff.div(d / CONFIG.FEAR_RADIUS);
                steer.add(diff);
                count++;
                this.frightened = true;
            }
        }
        if (count > 0) {
            steer.div(count);
            steer.setMag(CONFIG.MAX_SPEED * 1.3);
            steer.sub(this.velocity);
            steer.limit(CONFIG.MAX_FORCE * 3);
        }
        return steer;
    }

    attractToLight(lightPos, intensity) {
        const d = Vector.dist(this.position, lightPos);
        const r = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * intensity;
        this.inLight = d < r;
        if (d < r * 1.5) {
            const force = this.seek(lightPos);
            force.mult(d < r ? 1.0 : 0.2);
            return force;
        }
        return new Vector(0, 0);
    }

    attractToLure(lurePos) {
        const d = Vector.dist(this.position, lurePos);
        if (d < CONFIG.ANGLER_LURE_RADIUS) {
            const force = this.seek(lurePos);
            force.mult(1.0 - d / CONFIG.ANGLER_LURE_RADIUS);
            return force;
        }
        return new Vector(0, 0);
    }

    attractToFood(foods) {
        let closest = null, closestD = CONFIG.FOOD_ATTRACTION_RADIUS;
        for (const f of foods) {
            if (f.collected) continue;
            const d = Vector.dist(this.position, f.position);
            if (d < closestD) { closestD = d; closest = f; }
        }
        if (closest) return this.seek(closest.position);
        return new Vector(0, 0);
    }

    avoidObstacles(obstacles) {
        let steer = new Vector(0, 0); let count = 0;
        for (const obs of obstacles) {
            const d = Vector.dist(this.position, obs.position);
            const avoidDist = obs.radius + this.size * 4;
            if (d > 0 && d < avoidDist) {
                const diff = Vector.sub(this.position, obs.position);
                diff.normalize(); diff.div(d);
                steer.add(diff); count++;
            }
        }
        if (count > 0) {
            steer.div(count);
            if (steer.magSq() > 0) { steer.setMag(CONFIG.MAX_SPEED); steer.sub(this.velocity); steer.limit(CONFIG.MAX_FORCE * 2); }
        }
        return steer;
    }

    seek(target) {
        const desired = Vector.sub(target, this.position);
        desired.setMag(CONFIG.MAX_SPEED);
        const steer = Vector.sub(desired, this.velocity);
        steer.limit(CONFIG.MAX_FORCE);
        return steer;
    }

    separate(neighbors) {
        const desiredSep = this.size * 3;
        let steer = new Vector(0, 0); let count = 0;
        for (const other of neighbors) {
            if (other === this) continue;
            const d = Vector.dist(this.position, other.position);
            if (d > 0 && d < desiredSep) {
                if (!this.isInFOV(other) && d > desiredSep * 0.5) continue;
                const diff = Vector.sub(this.position, other.position);
                diff.normalize(); diff.div(d);
                steer.add(diff); count++;
            }
        }
        if (count > 0) steer.div(count);
        if (steer.magSq() > 0) { steer.setMag(CONFIG.MAX_SPEED); steer.sub(this.velocity); steer.limit(CONFIG.MAX_FORCE * 1.5); }
        return steer;
    }

    align(neighbors) {
        let sum = new Vector(0, 0); let count = 0;
        for (const other of neighbors) {
            if (other === this) continue;
            const d = Vector.dist(this.position, other.position);
            if (d > 0 && d < CONFIG.PERCEPTION_RADIUS && this.isInFOV(other)) {
                sum.add(other.velocity); count++;
            }
        }
        if (count > 0) {
            sum.div(count); sum.setMag(CONFIG.MAX_SPEED);
            const steer = Vector.sub(sum, this.velocity);
            steer.limit(CONFIG.MAX_FORCE); return steer;
        }
        return new Vector(0, 0);
    }

    cohesion(neighbors) {
        let sum = new Vector(0, 0); let count = 0;
        for (const other of neighbors) {
            if (other === this) continue;
            const d = Vector.dist(this.position, other.position);
            if (d > 0 && d < CONFIG.PERCEPTION_RADIUS && this.isInFOV(other)) {
                sum.add(other.position); count++;
            }
        }
        if (count > 0) { sum.div(count); return this.seek(sum); }
        return new Vector(0, 0);
    }

    boundaries() {
        let s = new Vector(0, 0);
        const m = 100, f = CONFIG.MAX_FORCE * 2;
        if (this.position.x < m) s.x = f;
        if (this.position.x > CONFIG.WORLD_WIDTH - m) s.x = -f;
        if (this.position.y < m) s.y = f;
        if (this.position.y > CONFIG.WORLD_HEIGHT - m) s.y = -f;
        return s;
    }

    update() {
        if (this.stunTimer > 0) {
            this.stunTimer--;
            this.velocity.mult(CONFIG.JELLY_SLOW_FACTOR);
        }
        this.velocity.add(this.acceleration);
        this.velocity.limit(this.frightened ? CONFIG.MAX_SPEED * 1.3 : CONFIG.MAX_SPEED);
        this.position.add(this.velocity);
        this.acceleration.mult(0);
        this.tailPhase += 0.15;
    }

    render(ctx) {
        const theta = this.velocity.heading();
        const s = this.size;
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(theta);

        // Tail wag
        const tailWag = Math.sin(this.tailPhase) * 0.3;

        // Body
        ctx.beginPath();
        ctx.moveTo(s * 2, 0);
        ctx.quadraticCurveTo(s * 0.5, -s * 1.1, -s * 0.5, -s * 0.5);
        ctx.lineTo(-s * 1.5, -s * 0.7 + tailWag * s);
        ctx.lineTo(-s * 0.8, 0);
        ctx.lineTo(-s * 1.5, s * 0.7 + tailWag * s);
        ctx.lineTo(-s * 0.5, s * 0.5);
        ctx.quadraticCurveTo(s * 0.5, s * 1.1, s * 2, 0);
        ctx.closePath();

        if (this.stunTimer > 0) ctx.fillStyle = '#aa88ff';
        else if (this.frightened) ctx.fillStyle = '#ff8866';
        else if (this.inLight) ctx.fillStyle = '#88ffee';
        else ctx.fillStyle = '#3a7a99';
        ctx.fill();

        if (this.inLight) {
            ctx.shadowBlur = 8; ctx.shadowColor = '#88ffff';
            ctx.fill(); ctx.shadowBlur = 0;
        }

        // Eye
        ctx.fillStyle = this.frightened ? '#ff0000' : '#112233';
        ctx.beginPath();
        ctx.arc(s * 0.8, -s * 0.2, s * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ---- Creature: Shark ----
class Shark {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = Vector.random();
        this.velocity.setMag(CONFIG.SHARK_PATROL_SPEED);
        this.acceleration = new Vector(0, 0);
        this.size = CONFIG.SHARK_SIZE;
        this.state = 'patrol'; // patrol, stalk, charge, cooldown, flee
        this.target = null;
        this.cooldownTimer = 0;
        this.chargeTimer = 0;
        this.wanderAngle = Math.random() * Math.PI * 2;
    }

    applyForce(f) { this.acceleration.add(f); }

    think(boids, obstacles, lightPos, lightIntensity) {
        // Check if should flee from light
        const distToLight = Vector.dist(this.position, lightPos);
        const lightR = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * lightIntensity;

        if (lightIntensity > CONFIG.SHARK_FEAR_LIGHT && distToLight < lightR * 1.5) {
            this.state = 'flee';
            const fleeDir = Vector.sub(this.position, lightPos);
            fleeDir.setMag(CONFIG.SHARK_CHARGE_SPEED);
            const steer = Vector.sub(fleeDir, this.velocity);
            steer.limit(CONFIG.SHARK_MAX_FORCE * 2);
            steer.mult(CONFIG.SHARK_FLEE_WEIGHT);
            this.applyForce(steer);
        } else if (this.cooldownTimer > 0) {
            this.state = 'cooldown';
            this.cooldownTimer--;
            // Slow wander
            this.applyForce(this._wander(0.3));
        } else {
            // Find target
            this.target = this._findTarget(boids, lightPos, lightIntensity);

            if (this.target) {
                const d = Vector.dist(this.position, this.target.position);
                if (d < CONFIG.SHARK_CHARGE_DIST) {
                    // CHARGE
                    this.state = 'charge';
                    const desired = Vector.sub(this.target.position, this.position);
                    desired.setMag(CONFIG.SHARK_CHARGE_SPEED);
                    const steer = Vector.sub(desired, this.velocity);
                    steer.limit(CONFIG.SHARK_MAX_FORCE * 2);
                    this.applyForce(steer);
                    this.chargeTimer++;
                    if (this.chargeTimer > 120) { // Gave up after 2 sec
                        this.target = null;
                        this.chargeTimer = 0;
                        this.cooldownTimer = 60;
                    }
                } else {
                    // STALK
                    this.state = 'stalk';
                    this.chargeTimer = 0;
                    const desired = Vector.sub(this.target.position, this.position);
                    desired.setMag(CONFIG.SHARK_PATROL_SPEED * 1.2);
                    const steer = Vector.sub(desired, this.velocity);
                    steer.limit(CONFIG.SHARK_MAX_FORCE * 0.8);
                    this.applyForce(steer);
                }
            } else {
                // PATROL
                this.state = 'patrol';
                this.chargeTimer = 0;
                this.applyForce(this._wander(0.5));
            }
        }

        // Avoid obstacles
        if (obstacles.length) {
            let avoid = this._avoidObstacles(obstacles);
            avoid.mult(CONFIG.OBSTACLE_AVOIDANCE_WEIGHT);
            this.applyForce(avoid);
        }
        this.applyForce(this._boundaries());
    }

    checkEat(boids, particles, floatingTexts) {
        if (this.state !== 'charge' && this.state !== 'stalk') return;
        for (let i = boids.length - 1; i >= 0; i--) {
            const d = Vector.dist(this.position, boids[i].position);
            if (d < this.size + boids[i].size) {
                // Eat!
                const pos = boids[i].position.copy();
                boids.splice(i, 1);
                // Particles
                for (let j = 0; j < 10; j++) particles.push(new Particle(pos.x, pos.y, '#ff4444', 2, 30));
                this.cooldownTimer = CONFIG.SHARK_COOLDOWN;
                this.target = null;
                this.chargeTimer = 0;
                break;
            }
        }
    }

    _findTarget(boids, lightPos, lightIntensity) {
        let closest = null, record = Infinity;
        for (const b of boids) {
            const d = Vector.dist(this.position, b.position);
            if (d < CONFIG.SHARK_PERCEPTION && !b.inLight && d < record) {
                record = d; closest = b;
            }
        }
        return closest;
    }

    _wander(strength) {
        this.wanderAngle += (Math.random() - 0.5) * 0.6;
        const ahead = this.velocity.copy();
        ahead.normalize(); ahead.mult(30);
        const offset = new Vector(Math.cos(this.wanderAngle), Math.sin(this.wanderAngle));
        offset.mult(15);
        ahead.add(offset);
        ahead.limit(CONFIG.SHARK_MAX_FORCE * strength);
        return ahead;
    }

    _avoidObstacles(obstacles) {
        let steer = new Vector(0, 0); let count = 0;
        for (const obs of obstacles) {
            const d = Vector.dist(this.position, obs.position);
            if (d > 0 && d < obs.radius + this.size * 4) {
                const diff = Vector.sub(this.position, obs.position);
                diff.normalize(); diff.div(d);
                steer.add(diff); count++;
            }
        }
        if (count > 0) {
            steer.div(count);
            if (steer.magSq() > 0) { steer.setMag(CONFIG.SHARK_CHARGE_SPEED); steer.sub(this.velocity); steer.limit(CONFIG.SHARK_MAX_FORCE * 2); }
        }
        return steer;
    }

    _boundaries() {
        let s = new Vector(0, 0);
        const m = 120, f = CONFIG.SHARK_MAX_FORCE * 2;
        if (this.position.x < m) s.x = f; if (this.position.x > CONFIG.WORLD_WIDTH - m) s.x = -f;
        if (this.position.y < m) s.y = f; if (this.position.y > CONFIG.WORLD_HEIGHT - m) s.y = -f;
        return s;
    }

    update() {
        this.velocity.add(this.acceleration);
        const maxSpd = this.state === 'charge' ? CONFIG.SHARK_CHARGE_SPEED
            : this.state === 'cooldown' ? CONFIG.SHARK_PATROL_SPEED * 0.5
            : CONFIG.SHARK_PATROL_SPEED;
        this.velocity.limit(maxSpd);
        this.position.add(this.velocity);
        this.acceleration.mult(0);
    }

    render(ctx) {
        const theta = this.velocity.heading();
        const s = this.size;
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(theta);

        // Speed lines when charging
        if (this.state === 'charge') {
            ctx.strokeStyle = 'rgba(255, 80, 80, 0.3)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 3; i++) {
                const ly = (i - 1) * s * 0.8;
                ctx.beginPath();
                ctx.moveTo(-s * 2, ly);
                ctx.lineTo(-s * 4, ly);
                ctx.stroke();
            }
        }

        // Body
        ctx.beginPath();
        ctx.moveTo(s * 2.5, 0);
        ctx.quadraticCurveTo(s, -s * 1.1, -s * 0.5, -s * 0.5);
        ctx.lineTo(-s * 2, -s * 0.7);
        ctx.lineTo(-s * 1.2, 0);
        ctx.lineTo(-s * 2, s * 0.7);
        ctx.lineTo(-s * 0.5, s * 0.5);
        ctx.quadraticCurveTo(s, s * 1.1, s * 2.5, 0);
        ctx.closePath();

        // Dorsal fin
        ctx.moveTo(s * 0.5, -s * 0.5);
        ctx.lineTo(0, -s * 1.8);
        ctx.lineTo(-s * 0.6, -s * 0.5);

        const colors = { charge: '#cc2222', stalk: '#993333', cooldown: '#555555', flee: '#ffaaaa', patrol: '#774444' };
        ctx.fillStyle = colors[this.state] || '#774444';
        ctx.fill();
        ctx.strokeStyle = '#aa4444'; ctx.lineWidth = 1.5; ctx.stroke();

        // Eye
        ctx.fillStyle = this.state === 'charge' ? '#ff0000' : '#ffcc00';
        ctx.beginPath();
        ctx.arc(s * 1.3, -s * 0.3, s * 0.22, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ---- Creature: Anglerfish ----
class Anglerfish {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = Vector.random();
        this.velocity.setMag(CONFIG.ANGLER_SPEED * 0.5);
        this.acceleration = new Vector(0, 0);
        this.size = CONFIG.ANGLER_SIZE;
        this.lurePos = new Vector(x, y);
        this.lurePhase = Math.random() * Math.PI * 2;
        this.state = 'lurking'; // lurking, luring, flee
        this.wanderAngle = Math.random() * Math.PI * 2;
    }

    applyForce(f) { this.acceleration.add(f); }

    updateLure() {
        const theta = this.velocity.heading();
        const localX = this.size * 3;
        const localY = -this.size * 2;
        this.lurePos = new Vector(
            this.position.x + Math.cos(theta) * localX - Math.sin(theta) * localY,
            this.position.y + Math.sin(theta) * localX + Math.cos(theta) * localY
        );
        this.lurePhase += 0.05;
    }

    think(boids, obstacles, lightPos, lightIntensity) {
        // Flee from strong player light
        const distToLight = Vector.dist(this.position, lightPos);
        const lightR = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * lightIntensity;

        if (lightIntensity > CONFIG.ANGLER_FEAR_LIGHT && distToLight < lightR * 1.8) {
            this.state = 'flee';
            const fleeDir = Vector.sub(this.position, lightPos);
            fleeDir.setMag(CONFIG.ANGLER_SPEED * 2);
            const steer = Vector.sub(fleeDir, this.velocity);
            steer.limit(CONFIG.ANGLER_MAX_FORCE * 3);
            this.applyForce(steer);
        } else {
            // Check if fish are nearby → luring
            let nearbyFish = 0;
            for (const b of boids) {
                if (Vector.dist(b.position, this.position) < CONFIG.ANGLER_LURE_RADIUS * 2) nearbyFish++;
            }
            this.state = nearbyFish > 0 ? 'luring' : 'lurking';
            // Slow wander
            this.applyForce(this._wander());
        }

        // Avoid obstacles
        for (const obs of obstacles) {
            const d = Vector.dist(this.position, obs.position);
            if (d > 0 && d < obs.radius + this.size * 3) {
                const diff = Vector.sub(this.position, obs.position);
                diff.normalize(); diff.mult(CONFIG.ANGLER_MAX_FORCE * 2);
                this.applyForce(diff);
            }
        }
        this.applyForce(this._boundaries());
    }

    checkEat(boids, particles) {
        for (let i = boids.length - 1; i >= 0; i--) {
            const d = Vector.dist(this.lurePos, boids[i].position);
            if (d < CONFIG.ANGLER_EAT_RADIUS) {
                const pos = boids[i].position.copy();
                boids.splice(i, 1);
                for (let j = 0; j < 8; j++) particles.push(new Particle(pos.x, pos.y, '#ff6644', 2, 25));
                break; // one per frame
            }
        }
    }

    _wander() {
        this.wanderAngle += (Math.random() - 0.5) * 0.3;
        const ahead = this.velocity.copy();
        ahead.normalize(); ahead.mult(15);
        const offset = new Vector(Math.cos(this.wanderAngle), Math.sin(this.wanderAngle));
        offset.mult(8);
        ahead.add(offset);
        ahead.limit(CONFIG.ANGLER_MAX_FORCE);
        return ahead;
    }

    _boundaries() {
        let s = new Vector(0, 0);
        const m = 150, f = CONFIG.ANGLER_MAX_FORCE * 2;
        if (this.position.x < m) s.x = f; if (this.position.x > CONFIG.WORLD_WIDTH - m) s.x = -f;
        if (this.position.y < m) s.y = f; if (this.position.y > CONFIG.WORLD_HEIGHT - m) s.y = -f;
        return s;
    }

    update() {
        this.velocity.add(this.acceleration);
        this.velocity.limit(this.state === 'flee' ? CONFIG.ANGLER_SPEED * 2 : CONFIG.ANGLER_SPEED);
        this.position.add(this.velocity);
        this.acceleration.mult(0);
        this.updateLure();
    }

    render(ctx) {
        const theta = this.velocity.heading();
        const s = this.size;

        // Render lure glow in world space
        const pulseR = s * 0.5 + Math.sin(this.lurePhase) * s * 0.2;
        const glow = ctx.createRadialGradient(this.lurePos.x, this.lurePos.y, 0, this.lurePos.x, this.lurePos.y, CONFIG.ANGLER_LURE_RADIUS * 0.6);
        glow.addColorStop(0, 'rgba(255, 170, 68, 0.35)');
        glow.addColorStop(0.5, 'rgba(255, 170, 68, 0.1)');
        glow.addColorStop(1, 'rgba(255, 170, 68, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(this.lurePos.x, this.lurePos.y, CONFIG.ANGLER_LURE_RADIUS * 0.6, 0, Math.PI * 2);
        ctx.fill();

        // Lure core
        ctx.fillStyle = '#ffcc44';
        ctx.shadowBlur = 12; ctx.shadowColor = '#ffaa22';
        ctx.beginPath();
        ctx.arc(this.lurePos.x, this.lurePos.y, pulseR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Body
        ctx.save();
        ctx.translate(this.position.x, this.position.y);
        ctx.rotate(theta);

        // Antenna line to lure (in local space approx)
        ctx.strokeStyle = '#5a3a6a'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s * 0.5, -s * 0.6);
        ctx.quadraticCurveTo(s * 2, -s * 2, s * 3, -s * 2);
        ctx.stroke();

        // Body ellipse
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 1.5, s * 1.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#2a1a3a';
        ctx.fill();
        ctx.strokeStyle = '#4a2a5a'; ctx.lineWidth = 2; ctx.stroke();

        // Mouth
        ctx.beginPath();
        ctx.arc(s * 1.0, 0, s * 0.5, -0.4, 0.4);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.stroke();

        // Eye
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(s * 0.4, -s * 0.4, s * 0.18, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}

// ---- Creature: Jellyfish ----
class Jellyfish {
    constructor(x, y) {
        this.position = new Vector(x, y);
        this.velocity = Vector.random();
        this.velocity.setMag(CONFIG.JELLY_SPEED * 0.5);
        this.size = CONFIG.JELLY_SIZE;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.tentaclePhase = Math.random() * Math.PI * 2;
        this.wanderAngle = Math.random() * Math.PI * 2;
    }

    drift() {
        this.wanderAngle += (Math.random() - 0.5) * 0.2;
        const force = new Vector(Math.cos(this.wanderAngle), Math.sin(this.wanderAngle));
        force.mult(0.02);
        this.velocity.add(force);
        this.velocity.limit(CONFIG.JELLY_SPEED);
        this.position.add(this.velocity);

        // Boundaries
        const m = 100;
        if (this.position.x < m) this.velocity.x += 0.05;
        if (this.position.x > CONFIG.WORLD_WIDTH - m) this.velocity.x -= 0.05;
        if (this.position.y < m) this.velocity.y += 0.05;
        if (this.position.y > CONFIG.WORLD_HEIGHT - m) this.velocity.y -= 0.05;
    }

    checkStun(boids) {
        for (const b of boids) {
            const d = Vector.dist(this.position, b.position);
            if (d < CONFIG.JELLY_SLOW_RADIUS + this.size) {
                b.stunTimer = 40; // ~0.66 sec
                // Knockback
                const knock = Vector.sub(b.position, this.position);
                knock.setMag(CONFIG.JELLY_KNOCKBACK);
                b.velocity.add(knock);
            }
        }
    }

    update() {
        this.drift();
        this.pulsePhase += 0.04;
        this.tentaclePhase += 0.03;
    }

    render(ctx) {
        const s = this.size;
        const pulse = Math.sin(this.pulsePhase) * 0.2;

        ctx.save();
        ctx.translate(this.position.x, this.position.y);

        // Glow
        const gGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 3);
        gGrad.addColorStop(0, 'rgba(255, 100, 255, 0.12)');
        gGrad.addColorStop(1, 'rgba(255, 100, 255, 0)');
        ctx.fillStyle = gGrad;
        ctx.beginPath();
        ctx.arc(0, 0, s * 3, 0, Math.PI * 2);
        ctx.fill();

        // Bell (dome)
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.2, s * (1 + pulse), s * 0.7 * (1 - pulse * 0.5), 0, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 150, 255, 0.35)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 200, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Tentacles
        ctx.strokeStyle = 'rgba(255, 150, 255, 0.25)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
            const baseX = (i - 2) * s * 0.4;
            const wave = Math.sin(this.tentaclePhase + i * 0.8) * s * 0.4;
            ctx.beginPath();
            ctx.moveTo(baseX, s * 0.1);
            ctx.quadraticCurveTo(baseX + wave, s * 1.0, baseX + wave * 0.6, s * 2.2);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// ==========================
// ---- GAME ENGINE ----
// ==========================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let particles = [];
let floatingTexts = [];
let spatialGrid = new SpatialGrid(CONFIG.GRID_CELL_SIZE, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);

let gameState = {
    state: 'start',
    currentWave: 0,
    waveTimer: 0,
    stateTimer: 0,
    boids: [], sharks: [], anglerfish: [], jellyfish: [],
    obstacles: [], currents: [], whirlpools: [], foods: [],
    lightPos: new Vector(0, 0),
    targetLightPos: new Vector(0, 0),
    lightIntensity: 0,
    cameraOffset: new Vector(0, 0),
    score: 0, combo: 1, comboTimer: 0, maxCombo: 1,
    totalFoodCollected: 0,
    waveStartFishCount: CONFIG.NUM_BOIDS,
    waveFoodCollected: 0,
    highScore: parseInt(localStorage.getItem('shoal_highscore') || '0'),
    frameCount: 0,
    foodSpawnTimer: CONFIG.FOOD_SPAWN_INTERVAL,
};

function addParticles(pos, count, color) {
    for (let i = 0; i < count; i++) particles.push(new Particle(pos.x, pos.y, color, 2 + Math.random() * 2));
}
function addFloatingText(x, y, text, color) {
    floatingTexts.push(new FloatingText(x, y, text, color));
}

// ---- Initialize First Game ----
function initGame() {
    gameState.state = 'wave_intro';
    gameState.currentWave = 0;
    gameState.score = 0;
    gameState.combo = 1;
    gameState.comboTimer = 0;
    gameState.maxCombo = 1;
    gameState.totalFoodCollected = 0;
    gameState.lightIntensity = 0;
    particles = [];
    floatingTexts = [];

    // Create boids
    const startX = 400, startY = CONFIG.WORLD_HEIGHT / 2;
    gameState.boids = [];
    for (let i = 0; i < CONFIG.NUM_BOIDS; i++) {
        gameState.boids.push(new Boid(startX + (Math.random() - 0.5) * 400, startY + (Math.random() - 0.5) * 400));
    }

    gameState.lightPos = new Vector(startX, startY);
    gameState.targetLightPos = gameState.lightPos.copy();
    gameState.cameraOffset = new Vector(0, 0);

    // Create obstacles (persistent across waves)
    gameState.obstacles = [];
    for (let i = 0; i < CONFIG.NUM_OBSTACLES; i++) {
        const x = 300 + Math.random() * (CONFIG.WORLD_WIDTH - 600);
        const y = 300 + Math.random() * (CONFIG.WORLD_HEIGHT - 600);
        const r = CONFIG.OBSTACLE_MIN_R + Math.random() * (CONFIG.OBSTACLE_MAX_R - CONFIG.OBSTACLE_MIN_R);
        gameState.obstacles.push(new Obstacle(x, y, r));
    }

    startWave(0);
}

function startWave(index) {
    gameState.currentWave = index;
    const wave = WAVES[index];
    gameState.waveTimer = wave.duration * 60; // seconds → frames
    gameState.stateTimer = CONFIG.WAVE_INTRO_DURATION;
    gameState.state = 'wave_intro';
    gameState.waveStartFishCount = gameState.boids.length;
    gameState.waveFoodCollected = 0;

    // Clear previous enemies & environment
    gameState.sharks = [];
    gameState.anglerfish = [];
    gameState.jellyfish = [];
    gameState.currents = [];
    gameState.whirlpools = [];
    gameState.foods = [];
    gameState.foodSpawnTimer = CONFIG.FOOD_SPAWN_INTERVAL;

    // Spawn sharks far from fish
    const fishCenter = getFishCenter();
    for (let i = 0; i < wave.sharks; i++) {
        const pos = randomFarFrom(fishCenter, 800);
        gameState.sharks.push(new Shark(pos.x, pos.y));
    }
    for (let i = 0; i < wave.anglers; i++) {
        const pos = randomFarFrom(fishCenter, 900);
        gameState.anglerfish.push(new Anglerfish(pos.x, pos.y));
    }
    for (let i = 0; i < wave.jellies; i++) {
        const pos = randomFarFrom(fishCenter, 600);
        gameState.jellyfish.push(new Jellyfish(pos.x, pos.y));
    }
    // Currents
    for (let i = 0; i < wave.currents; i++) {
        const x = 300 + Math.random() * (CONFIG.WORLD_WIDTH - 600);
        const y = 300 + Math.random() * (CONFIG.WORLD_HEIGHT - 600);
        const length = 400 + Math.random() * 500;
        const angle = Math.random() * Math.PI * 2;
        gameState.currents.push(new Current(x, y, length, angle));
    }
    // Whirlpools
    for (let i = 0; i < wave.whirlpools; i++) {
        const x = 400 + Math.random() * (CONFIG.WORLD_WIDTH - 800);
        const y = 400 + Math.random() * (CONFIG.WORLD_HEIGHT - 800);
        gameState.whirlpools.push(new Whirlpool(x, y));
    }

    // Show wave overlay
    document.getElementById('wave-title').textContent = `WAVE ${index + 1}`;
    document.getElementById('wave-subtitle').textContent = WAVES[index].hint || 'Survive!';
    showEl('wave-overlay');
    hideEl('wave-complete-screen');

    // Update HUD
    document.getElementById('wave-number').textContent = index + 1;
}

function getFishCenter() {
    if (gameState.boids.length === 0) return new Vector(CONFIG.WORLD_WIDTH / 2, CONFIG.WORLD_HEIGHT / 2);
    let cx = 0, cy = 0;
    for (const b of gameState.boids) { cx += b.position.x; cy += b.position.y; }
    return new Vector(cx / gameState.boids.length, cy / gameState.boids.length);
}

function randomFarFrom(center, minDist) {
    for (let attempt = 0; attempt < 50; attempt++) {
        const x = 200 + Math.random() * (CONFIG.WORLD_WIDTH - 400);
        const y = 200 + Math.random() * (CONFIG.WORLD_HEIGHT - 400);
        const v = new Vector(x, y);
        if (Vector.dist(v, center) > minDist) return v;
    }
    // Fallback: just place far right
    return new Vector(CONFIG.WORLD_WIDTH - 300, Math.random() * CONFIG.WORLD_HEIGHT);
}

// ---- Update Functions ----
function updateLightIntensity() {
    const move = Vector.sub(gameState.targetLightPos, gameState.lightPos);
    move.mult(0.1);
    gameState.lightPos.add(move);

    let densityCount = 0;
    for (const b of gameState.boids) {
        if (Vector.dist(b.position, gameState.lightPos) < CONFIG.DENSITY_RADIUS) densityCount++;
    }
    const target = Math.min(1, Math.max(0, densityCount / (gameState.boids.length * 0.5 || 1)));
    if (gameState.lightIntensity < target) gameState.lightIntensity += CONFIG.LIGHT_GROWTH_RATE;
    else gameState.lightIntensity -= CONFIG.LIGHT_DECAY_RATE;
    gameState.lightIntensity = Math.min(1, Math.max(0, gameState.lightIntensity));
}

function updateCamera() {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    let tx = gameState.lightPos.x - cx, ty = gameState.lightPos.y - cy;
    tx = Math.max(0, Math.min(tx, CONFIG.WORLD_WIDTH - canvas.width));
    ty = Math.max(0, Math.min(ty, CONFIG.WORLD_HEIGHT - canvas.height));
    gameState.cameraOffset.x += (tx - gameState.cameraOffset.x) * 0.05;
    gameState.cameraOffset.y += (ty - gameState.cameraOffset.y) * 0.05;
}

function spawnFood() {
    gameState.foodSpawnTimer--;
    if (gameState.foodSpawnTimer <= 0 && gameState.foods.length < CONFIG.FOOD_MAX) {
        const fishC = getFishCenter();
        // Spawn near-ish to fish center but not right on top
        const angle = Math.random() * Math.PI * 2;
        const dist = 200 + Math.random() * 500;
        let fx = fishC.x + Math.cos(angle) * dist;
        let fy = fishC.y + Math.sin(angle) * dist;
        fx = Math.max(100, Math.min(CONFIG.WORLD_WIDTH - 100, fx));
        fy = Math.max(100, Math.min(CONFIG.WORLD_HEIGHT - 100, fy));
        gameState.foods.push(new Food(fx, fy));
        gameState.foodSpawnTimer = CONFIG.FOOD_SPAWN_INTERVAL + Math.random() * 120;
    }
}

function checkFoodCollection() {
    for (const food of gameState.foods) {
        if (food.collected) continue;
        for (const boid of gameState.boids) {
            if (Vector.dist(boid.position, food.position) < CONFIG.FOOD_RADIUS + boid.size) {
                food.collected = true;
                gameState.combo = Math.min(CONFIG.MAX_COMBO, gameState.combo + 1);
                gameState.comboTimer = CONFIG.COMBO_TIMEOUT;
                const points = CONFIG.FOOD_SCORE * gameState.combo;
                gameState.score += points;
                gameState.totalFoodCollected++;
                gameState.waveFoodCollected++;
                gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
                addParticles(food.position, 10, '#ffdd44');
                addFloatingText(food.position.x, food.position.y - 20, `+${points}`, '#ffdd44');
                if (gameState.combo > 1) {
                    addFloatingText(food.position.x, food.position.y - 45, `x${gameState.combo} COMBO!`, '#ff8844');
                }
                gameState.lightIntensity = Math.min(1, gameState.lightIntensity + 0.05);
                break;
            }
        }
    }
    gameState.foods = gameState.foods.filter(f => !f.collected);

    // Combo decay
    if (gameState.comboTimer > 0) {
        gameState.comboTimer--;
    } else {
        gameState.combo = 1;
    }
}

function checkWaveEnd() {
    if (gameState.state !== 'playing') return;

    // All fish dead
    if (gameState.boids.length === 0) {
        showGameOver();
        return;
    }

    // Wave timer
    gameState.waveTimer--;
    if (gameState.waveTimer <= 0) {
        showWaveComplete();
    }
}

function showWaveComplete() {
    gameState.state = 'wave_complete';
    gameState.stateTimer = CONFIG.WAVE_REST_DURATION;

    // Remove predators
    gameState.sharks = [];
    gameState.anglerfish = [];
    gameState.jellyfish = [];
    gameState.currents = [];
    gameState.whirlpools = [];

    // Reinforcements
    const reinforcements = Math.min(20, Math.ceil(gameState.boids.length * 0.12));
    for (let i = 0; i < reinforcements; i++) {
        gameState.boids.push(new Boid(
            gameState.lightPos.x + (Math.random() - 0.5) * 200,
            gameState.lightPos.y + (Math.random() - 0.5) * 200
        ));
    }

    // Wave bonus
    const waveBonus = CONFIG.WAVE_BONUS + gameState.boids.length * 10;
    gameState.score += waveBonus;

    // Update stats UI
    document.getElementById('wave-fish-survived').textContent = gameState.boids.length;
    document.getElementById('wave-food-collected').textContent = gameState.waveFoodCollected;
    document.getElementById('wave-bonus').textContent = waveBonus;
    document.getElementById('wave-total-score').textContent = gameState.score;
    const nextIdx = gameState.currentWave + 1;
    document.getElementById('next-wave-hint').textContent = nextIdx < WAVES.length ? WAVES[gameState.currentWave].hint : 'Victory is close!';
    document.getElementById('wave-complete-title').textContent = `Wave ${gameState.currentWave + 1} Complete!`;

    showEl('wave-complete-screen');
    hideEl('wave-overlay');

    // Celebration particles
    for (let i = 0; i < 30; i++) addParticles(gameState.lightPos, 3, ['#88ff88', '#ffdd44', '#88ddff'][i % 3]);
}

function showGameOver() {
    gameState.state = 'lose';
    canvas.style.cursor = 'default';
    document.getElementById('final-wave').textContent = `${gameState.currentWave + 1}`;
    document.getElementById('final-score').textContent = gameState.score;
    hideEl('hud');
    showEl('game-over-screen');
    saveHighScore();
}

function showWin() {
    gameState.state = 'win';
    canvas.style.cursor = 'default';
    document.getElementById('win-fish').textContent = gameState.boids.length;
    document.getElementById('win-food').textContent = gameState.totalFoodCollected;
    document.getElementById('win-combo').textContent = gameState.maxCombo;
    document.getElementById('win-score').textContent = gameState.score;
    hideEl('hud');
    showEl('win-screen');
    saveHighScore();
}

function saveHighScore() {
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('shoal_highscore', String(gameState.highScore));
    }
}

function showEl(id) { document.getElementById(id).classList.remove('hidden'); }
function hideEl(id) { document.getElementById(id).classList.add('hidden'); }

// ---- Main Update ----
function updateGame() {
    gameState.frameCount++;
    updateLightIntensity();
    updateCamera();

    // Rebuild spatial grid
    spatialGrid.clear();
    for (const b of gameState.boids) spatialGrid.insert(b);

    // Update boids
    for (const b of gameState.boids) {
        b.flock(spatialGrid, gameState.obstacles, gameState.lightPos, gameState.lightIntensity,
            gameState.sharks, gameState.anglerfish, gameState.foods, gameState.currents, gameState.whirlpools);
        b.update();
    }

    // Update sharks
    for (const s of gameState.sharks) {
        s.think(gameState.boids, gameState.obstacles, gameState.lightPos, gameState.lightIntensity);
        s.update();
        s.checkEat(gameState.boids, particles, floatingTexts);
    }

    // Update anglerfish
    for (const a of gameState.anglerfish) {
        a.think(gameState.boids, gameState.obstacles, gameState.lightPos, gameState.lightIntensity);
        a.update();
        a.checkEat(gameState.boids, particles);
    }

    // Update jellyfish
    for (const j of gameState.jellyfish) {
        j.update();
        j.checkStun(gameState.boids);
    }

    // Update whirlpools
    for (const w of gameState.whirlpools) w.update();

    // Food
    spawnFood();
    checkFoodCollection();

    // Particles & text
    particles = particles.filter(p => { p.update(); return !p.dead; });
    floatingTexts = floatingTexts.filter(t => { t.update(); return !t.dead; });

    // Wave check
    checkWaveEnd();

    // Update HUD
    document.getElementById('fish-count').textContent = gameState.boids.length;
    document.getElementById('light-intensity').textContent = Math.round(gameState.lightIntensity * 100) + '%';
    document.getElementById('time-remaining').textContent = Math.ceil(gameState.waveTimer / 60);
    document.getElementById('score').textContent = gameState.score;

    if (gameState.combo > 1) {
        showEl('combo-display');
        document.getElementById('combo-value').textContent = gameState.combo;
    } else {
        hideEl('combo-display');
    }
}

// ---- Render ----
function renderBackground() {
    // Deep ocean gradient
    const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height)
    );
    grad.addColorStop(0, '#0a2e3f');
    grad.addColorStop(1, '#020c1b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function renderCaustics(frame) {
    ctx.save();
    for (let i = 0; i < 8; i++) {
        const x = (Math.sin(frame * 0.0008 + i * 1.7) * 0.5 + 0.5) * CONFIG.WORLD_WIDTH;
        const y = (Math.cos(frame * 0.0006 + i * 1.1) * 0.5 + 0.5) * CONFIG.WORLD_HEIGHT;
        const r = 80 + Math.sin(frame * 0.001 + i) * 40;
        const cGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
        cGrad.addColorStop(0, 'rgba(80, 180, 220, 0.04)');
        cGrad.addColorStop(1, 'rgba(80, 180, 220, 0)');
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function renderLight() {
    const r = CONFIG.LIGHT_RADIUS_MIN + (CONFIG.LIGHT_RADIUS_MAX - CONFIG.LIGHT_RADIUS_MIN) * gameState.lightIntensity;
    const lx = gameState.lightPos.x, ly = gameState.lightPos.y;
    const alpha = 0.15 + gameState.lightIntensity * 0.35;

    // Outer glow
    const g1 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 1.3);
    g1.addColorStop(0, `rgba(136, 255, 255, ${alpha * 0.5})`);
    g1.addColorStop(1, 'rgba(136, 255, 255, 0)');
    ctx.fillStyle = g1;
    ctx.beginPath(); ctx.arc(lx, ly, r * 1.3, 0, Math.PI * 2); ctx.fill();

    // Inner glow
    const g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
    g2.addColorStop(0, `rgba(136, 255, 255, ${alpha})`);
    g2.addColorStop(0.6, `rgba(136, 255, 255, ${alpha * 0.3})`);
    g2.addColorStop(1, 'rgba(136, 255, 255, 0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(lx, ly, r, 0, Math.PI * 2); ctx.fill();

    // Core dot
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 15; ctx.shadowColor = '#88ffff';
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
}

function renderScene(isActive) {
    ctx.save();
    ctx.translate(-gameState.cameraOffset.x, -gameState.cameraOffset.y);

    // Caustics
    renderCaustics(gameState.frameCount);

    // World border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, CONFIG.WORLD_WIDTH, CONFIG.WORLD_HEIGHT);

    // Environment
    for (const c of gameState.currents) c.render(ctx, gameState.frameCount);
    for (const w of gameState.whirlpools) w.render(ctx, gameState.frameCount);
    for (const obs of gameState.obstacles) obs.render(ctx);

    // Light
    renderLight();

    // Food
    for (const f of gameState.foods) f.render(ctx, gameState.frameCount);

    // Boids
    for (const b of gameState.boids) b.render(ctx);

    // Predators
    for (const s of gameState.sharks) s.render(ctx);
    for (const a of gameState.anglerfish) a.render(ctx);
    for (const j of gameState.jellyfish) j.render(ctx);

    // Particles
    for (const p of particles) p.render(ctx);
    for (const t of floatingTexts) t.render(ctx);

    ctx.restore();
}

// ---- Main Animation Loop ----
function animate() {
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    renderBackground();

    switch (gameState.state) {
        case 'start':
            // Just background
            break;

        case 'wave_intro':
            gameState.stateTimer--;
            updateCamera();
            // Gently update light so camera follows
            updateLightIntensity();
            renderScene(false);
            // Overlay is shown via HTML
            if (gameState.stateTimer <= 0) {
                gameState.state = 'playing';
                hideEl('wave-overlay');
                showEl('hud');
            }
            break;

        case 'playing':
            updateGame();
            renderScene(true);
            break;

        case 'wave_complete':
            gameState.stateTimer--;
            gameState.frameCount++;
            updateLightIntensity();
            updateCamera();
            // Fish still flock gently to light during rest
            spatialGrid.clear();
            for (const b of gameState.boids) spatialGrid.insert(b);
            for (const b of gameState.boids) {
                b.flock(spatialGrid, gameState.obstacles, gameState.lightPos, gameState.lightIntensity,
                    [], [], [], [], []);
                b.update();
            }
            particles = particles.filter(p => { p.update(); return !p.dead; });
            floatingTexts = floatingTexts.filter(t => { t.update(); return !t.dead; });
            renderScene(false);

            if (gameState.stateTimer <= 0) {
                hideEl('wave-complete-screen');
                if (gameState.currentWave >= WAVES.length - 1) {
                    showWin();
                } else {
                    startWave(gameState.currentWave + 1);
                }
            }
            break;

        case 'lose':
        case 'win':
            renderScene(false);
            break;
    }

    requestAnimationFrame(animate);
}

// ---- Event Handlers ----
window.addEventListener('load', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Display high score
    document.getElementById('high-score').textContent = gameState.highScore;

    document.getElementById('start-btn').addEventListener('click', () => {
        hideEl('start-screen');
        canvas.style.cursor = 'none';
        initGame();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        hideEl('game-over-screen');
        showEl('hud');
        canvas.style.cursor = 'none';
        initGame();
    });

    document.getElementById('win-restart-btn').addEventListener('click', () => {
        hideEl('win-screen');
        showEl('hud');
        canvas.style.cursor = 'none';
        initGame();
    });

    window.addEventListener('mousemove', (e) => {
        gameState.targetLightPos.x = e.clientX + gameState.cameraOffset.x;
        gameState.targetLightPos.y = e.clientY + gameState.cameraOffset.y;
    });

    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            gameState.targetLightPos.x = e.touches[0].clientX + gameState.cameraOffset.x;
            gameState.targetLightPos.y = e.touches[0].clientY + gameState.cameraOffset.y;
        }
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
        if (e.touches.length > 0) {
            gameState.targetLightPos.x = e.touches[0].clientX + gameState.cameraOffset.x;
            gameState.targetLightPos.y = e.touches[0].clientY + gameState.cameraOffset.y;
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });

    requestAnimationFrame(animate);
});
