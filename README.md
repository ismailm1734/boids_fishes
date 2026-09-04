# Shoal

**[▶ Play it in your browser](https://ismailm1734.github.io/boids_fishes/)**

**Shoal** is a 2D web-based game prototype built with HTML5 Canvas and vanilla JavaScript.

In this game, you guide a school of fish through an ocean environment using a light cursor. You do not directly control the fish; instead, they follow [Boids flocking rules](https://en.wikipedia.org/wiki/Boids) (separation, alignment, cohesion) combined with a weak attraction to your light.

### Emergent Mechanics
The core theme of the game is emergent behavior.
- **The Light:** As you gather more fish closely together within the light's radius, the light's intensity grows.
- **Predators:** Predator fish roam the environment seeking out stray, isolated fish. However, they fear bright light and will flee if the light's intensity is high enough.
- **Survival:** No single fish can survive a predator alone. By staying grouped together near the light, the school generates enough intensity to ward off predators, ensuring collective survival.

### How to Play
Play it right away at **[ismailm1734.github.io/boids_fishes](https://ismailm1734.github.io/boids_fishes/)** — no install needed.

1. Move your mouse or drag your finger on mobile to control the light cursor.
2. Guide the school to the green goal zone on the right side of the map while avoiding obstacles and protecting the fish from predators.

### Running Locally
This game requires no build step and can be run locally in any modern browser.

1. Clone or download this repository.
2. Open `index.html` in your web browser (e.g., double-click the file or use a local server like VSCode's Live Server).

### Configuration
All core game parameters (boid speeds, steering weights, predator mechanics) are located at the very top of `game.js` in the `CONFIG` object. You can easily tweak these to see how they change the emergent behavior of the school!

### Technical Details
- Vanilla JavaScript (ES6)
- HTML5 `<canvas>` for rendering
- No external libraries or game engines
- Runs at 60fps using `requestAnimationFrame`