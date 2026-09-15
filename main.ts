namespace SpriteKind {
    /**
     * The sprite kind used by hazards made with create moving hazard.
     */
    export const MovingHazard = SpriteKind.create()
}

/**
 * Simple platformer mechanics that keep the interesting game choices visible.
 */
//% block="Platformer Helpers"
//% color="#7c3aed"
//% icon="\uf1b0"
//% groups='["Platforms", "Enemies", "Hazards"]'
namespace platformerHelpers {
    const ENEMY_GRAVITY = 500
    const MOVING_PLATFORM_KIND = SpriteKind.create()

    interface PathMover {
        sprite: Sprite
        startX: number
        startY: number
        endX: number
        endY: number
        distance: number
        progress: number
        direction: number
        speed: number
        isPlatform: boolean
        lastDx: number
        lastDy: number
    }

    interface WalkingEnemy {
        sprite: Sprite
        speed: number
        direction: number
    }

    interface PlayerSnapshot {
        sprite: Sprite
        left: number
        right: number
        bottom: number
    }

    interface Rider {
        player: Sprite
        mover: PathMover
    }

    interface StompContact {
        player: Sprite
        enemy: Sprite
    }

    interface SpriteWithObstacles {
        _obstacles: sprites.Obstacle[]
    }

    let movers: PathMover[] = []
    let walkingEnemies: WalkingEnemy[] = []
    let riders: Rider[] = []
    let playerSnapshots: PlayerSnapshot[] = []
    let stompContacts: StompContact[] = []
    let stompHandlers: ((player: Sprite, enemy: Sprite) => void)[] = []
    let runtimeScene: scene.Scene = null
    let lastUpdateMillis = 0

    function isDestroyed(sprite: Sprite): boolean {
        return !sprite || !!(sprite.flags & sprites.Flag.Destroyed)
    }

    function ensureRuntime(): void {
        const current = game.currentScene()
        if (runtimeScene === current) return

        runtimeScene = current
        movers = []
        walkingEnemies = []
        riders = []
        playerSnapshots = []
        stompContacts = []
        lastUpdateMillis = control.millis()

        current.eventContext.registerFrameHandler(scene.PHYSICS_PRIORITY - 1, function () {
            capturePlayerPositions()
        })
        current.eventContext.registerFrameHandler(scene.PHYSICS_PRIORITY + 1, function () {
            updateRuntime()
        })
    }

    function capturePlayerPositions(): void {
        playerSnapshots = []
        for (const player of sprites.allOfKind(SpriteKind.Player)) {
            playerSnapshots.push({
                sprite: player,
                left: player.left,
                right: player.right,
                bottom: player.bottom
            })
        }
    }

    function snapshotFor(player: Sprite): PlayerSnapshot {
        for (const snapshot of playerSnapshots) {
            if (snapshot.sprite === player) return snapshot
        }
        return null
    }

    function riderFor(player: Sprite): Rider {
        for (const rider of riders) {
            if (rider.player === player) return rider
        }
        return null
    }

    function overlapsHorizontally(left: number, right: number, platform: Sprite): boolean {
        return right > platform.left + 1 && left < platform.right - 1
    }

    function isStompContact(player: Sprite, enemy: Sprite): boolean {
        if (isDestroyed(player)
            || isDestroyed(enemy)
            || player.vy < 0
            || !overlapsHorizontally(player.left, player.right, enemy)
            || player.top >= enemy.bottom) {
            return false
        }

        const snapshot = snapshotFor(player)
        if (snapshot) {
            return snapshot.bottom <= enemy.top + 1
                && player.bottom >= enemy.top
        }

        // A snapshot is not available when this is the first helper block used
        // in an already-running scene. Keep that first contact useful while
        // still rejecting obvious side and underside hits.
        const penetration = player.bottom - enemy.top
        return player.y < enemy.y
            && penetration >= -1
            && penetration <= Math.max(2, Math.min(player.height, enemy.height) / 2)
    }

    function stillInStompContact(contact: StompContact): boolean {
        if (isDestroyed(contact.player) || isDestroyed(contact.enemy)) return false
        return overlapsHorizontally(contact.player.left, contact.player.right, contact.enemy)
            && contact.player.bottom >= contact.enemy.top - 1
            && contact.player.top < contact.enemy.bottom
            && contact.player.y < contact.enemy.y
    }

    function detectStomps(): void {
        const retained: StompContact[] = []
        for (const contact of stompContacts) {
            if (stillInStompContact(contact)) retained.push(contact)
        }
        stompContacts = retained

        if (!stompHandlers.length) return
        for (const player of sprites.allOfKind(SpriteKind.Player)) {
            if (isDestroyed(player) || player.vy < 0) continue
            const snapshot = snapshotFor(player)
            if (!snapshot) continue

            for (const enemy of sprites.allOfKind(SpriteKind.Enemy)) {
                if (!isStompContact(player, enemy)) continue

                let alreadyActive = false
                for (const contact of stompContacts) {
                    if (contact.player === player && contact.enemy === enemy) {
                        alreadyActive = true
                        break
                    }
                }
                if (alreadyActive) continue

                stompContacts.push({ player: player, enemy: enemy })
                const handlers = stompHandlers.slice()
                for (const handler of handlers) {
                    handler(player, enemy)
                }
            }
        }
    }

    function setBottomContact(player: Sprite, platform: Sprite): void {
        const internalPlayer = player as any as SpriteWithObstacles
        if (!internalPlayer._obstacles) internalPlayer._obstacles = []
        internalPlayer._obstacles[CollisionDirection.Bottom] = platform as any as sprites.Obstacle
    }

    function moveSpriteThroughTilePhysics(sprite: Sprite, dx: number, dy: number): void {
        let remainingX = dx
        let remainingY = dy
        let steps = 0

        while ((Math.abs(remainingX) > 0.01 || Math.abs(remainingY) > 0.01) && steps < 64) {
            const stepX = Math.max(-1, Math.min(1, remainingX))
            const stepY = Math.max(-1, Math.min(1, remainingY))
            game.currentScene().physicsEngine.moveSprite(sprite, Fx8(stepX), Fx8(stepY))
            remainingX -= stepX
            remainingY -= stepY
            steps++
        }
    }

    function advanceMover(mover: PathMover, seconds: number): void {
        const oldX = mover.sprite.x
        const oldY = mover.sprite.y

        if (mover.distance > 0 && mover.speed > 0) {
            const cycleLength = mover.distance * 2
            const phase = mover.direction > 0
                ? mover.progress
                : cycleLength - mover.progress
            let nextPhase = (phase + mover.speed * seconds) % cycleLength
            if (nextPhase < 0) nextPhase += cycleLength

            if (nextPhase < mover.distance) {
                mover.progress = nextPhase
                mover.direction = 1
            } else {
                mover.progress = cycleLength - nextPhase
                mover.direction = -1
            }

            const portion = mover.progress / mover.distance
            mover.sprite.setPosition(
                mover.startX + (mover.endX - mover.startX) * portion,
                mover.startY + (mover.endY - mover.startY) * portion
            )
        }

        mover.lastDx = mover.sprite.x - oldX
        mover.lastDy = mover.sprite.y - oldY
    }

    function updateRiders(platformMovers: PathMover[]): void {
        const players = sprites.allOfKind(SpriteKind.Player)
        const retained: Rider[] = []

        for (const player of players) {
            if (isDestroyed(player)) continue

            const existing = riderFor(player)
            if (existing
                && !isDestroyed(existing.mover.sprite)
                && player.vy >= 0
                && overlapsHorizontally(player.left, player.right, existing.mover.sprite)) {
                moveSpriteThroughTilePhysics(player, existing.mover.lastDx, existing.mover.lastDy)
                player.bottom = existing.mover.sprite.top
                if (player.vy > 0) player.vy = 0
                setBottomContact(player, existing.mover.sprite)
                retained.push(existing)
                continue
            }

            const snapshot = snapshotFor(player)
            if (!snapshot || player.vy < 0) continue

            let landing: PathMover = null
            let landingTop = 0x7fffffff
            for (const mover of platformMovers) {
                if (isDestroyed(mover.sprite)) continue
                const oldTop = mover.sprite.top - mover.lastDy
                if (snapshot.bottom <= oldTop + 1
                    && player.bottom >= mover.sprite.top
                    && overlapsHorizontally(player.left, player.right, mover.sprite)
                    && mover.sprite.top < landingTop) {
                    landing = mover
                    landingTop = mover.sprite.top
                }
            }

            if (landing) {
                moveSpriteThroughTilePhysics(player, landing.lastDx, 0)
                player.bottom = landing.sprite.top
                if (player.vy > 0) player.vy = 0
                setBottomContact(player, landing.sprite)
                retained.push({ player: player, mover: landing })
            }
        }

        riders = retained
    }

    function tileSize(): number {
        const origin = tiles.getTileLocation(0, 0)
        if (!origin) return 16
        return origin.right - origin.left
    }

    function isLedgeAhead(enemy: Sprite, direction: number): boolean {
        if (!enemy.isHittingTile(CollisionDirection.Bottom)) return false
        const size = tileSize()
        const probeX = direction > 0 ? enemy.right + 1 : enemy.left - 1
        const probeY = enemy.bottom + 1
        const column = Math.floor(probeX / size)
        const row = Math.floor(probeY / size)
        return !tiles.tileAtLocationIsWall(tiles.getTileLocation(column, row))
    }

    function updateWalkingEnemies(): void {
        const retained: WalkingEnemy[] = []
        for (const state of walkingEnemies) {
            const enemy = state.sprite
            if (isDestroyed(enemy)) continue

            let turn = false
            if (state.direction > 0 && enemy.isHittingTile(CollisionDirection.Right)) {
                turn = true
            } else if (state.direction < 0 && enemy.isHittingTile(CollisionDirection.Left)) {
                turn = true
            } else if (isLedgeAhead(enemy, state.direction)) {
                turn = true
            }

            if (turn) state.direction *= -1
            enemy.vx = state.direction * state.speed
            retained.push(state)
        }
        walkingEnemies = retained
    }

    function updateRuntime(): void {
        const now = control.millis()
        const seconds = Math.min(0.1, Math.max(0, now - lastUpdateMillis) / 1000)
        lastUpdateMillis = now

        detectStomps()

        const retainedMovers: PathMover[] = []
        const platforms: PathMover[] = []
        for (const mover of movers) {
            if (isDestroyed(mover.sprite)) continue
            advanceMover(mover, seconds)
            retainedMovers.push(mover)
            if (mover.isPlatform) platforms.push(mover)
        }
        movers = retainedMovers

        updateRiders(platforms)
        updateWalkingEnemies()
    }

    function createPathMover(
        art: Image,
        startColumn: number,
        startRow: number,
        endColumn: number,
        endRow: number,
        speed: number,
        kind: number,
        isPlatform: boolean
    ): Sprite {
        ensureRuntime()

        const sprite = sprites.create(art || image.create(16, 16), kind)
        sprite.setFlag(SpriteFlag.AutoDestroy, false)
        sprite.setFlag(SpriteFlag.StayInScreen, false)
        sprite.setFlag(SpriteFlag.GhostThroughWalls, true)
        if (isPlatform) sprite.setFlag(SpriteFlag.GhostThroughSprites, true)

        const start = tiles.getTileLocation(Math.round(startColumn), Math.round(startRow))
        const end = tiles.getTileLocation(Math.round(endColumn), Math.round(endRow))
        if (start && end) {
            sprite.setPosition(start.x, start.y)
            const dx = end.x - start.x
            const dy = end.y - start.y
            movers.push({
                sprite: sprite,
                startX: start.x,
                startY: start.y,
                endX: end.x,
                endY: end.y,
                distance: Math.sqrt(dx * dx + dy * dy),
                progress: 0,
                direction: 1,
                speed: Math.abs(speed),
                isPlatform: isPlatform,
                lastDx: 0,
                lastDy: 0
            })
        }

        return sprite
    }

    /**
     * Create a solid platform that travels between two tile locations and carries Player sprites standing on it.
     * @param art the platform picture
     * @param startColumn starting tile column, eg: 4
     * @param startRow starting tile row, eg: 7
     * @param endColumn ending tile column, eg: 10
     * @param endRow ending tile row, eg: 7
     * @param speed movement speed in pixels per second, eg: 30
     */
    //% blockId=platformer_helpers_create_moving_platform
    //% block="create moving platform $art=screen_image_picker from col $startColumn row $startRow to col $endColumn row $endRow at speed $speed"
    //% blockSetVariable="movingPlatform"
    //% duplicateShadowOnDrag
    //% group="Platforms"
    //% weight=100
    //% speed.min=0 speed.max=200
    export function createMovingPlatform(
        art: Image,
        startColumn: number,
        startRow: number,
        endColumn: number,
        endRow: number,
        speed: number
    ): Sprite {
        return createPathMover(
            art,
            startColumn,
            startRow,
            endColumn,
            endRow,
            speed,
            MOVING_PLATFORM_KIND,
            true
        )
    }

    /**
     * Create an Enemy that walks automatically and turns around at walls and platform ledges.
     * @param art the enemy picture
     * @param column starting tile column, eg: 8
     * @param row starting tile row, eg: 6
     * @param speed walking speed in pixels per second, eg: 30
     */
    //% blockId=platformer_helpers_create_walking_enemy
    //% block="create walking enemy $art=screen_image_picker at col $column row $row with speed $speed"
    //% blockSetVariable="walkingEnemy"
    //% duplicateShadowOnDrag
    //% group="Enemies"
    //% weight=100
    //% speed.min=0 speed.max=150
    export function createWalkingEnemy(
        art: Image,
        column: number,
        row: number,
        speed: number
    ): Sprite {
        ensureRuntime()

        const enemy = sprites.create(art || image.create(16, 16), SpriteKind.Enemy)
        const location = tiles.getTileLocation(Math.round(column), Math.round(row))
        if (location) tiles.placeOnTile(enemy, location)
        enemy.ay = ENEMY_GRAVITY

        const walkingSpeed = Math.abs(speed)
        enemy.vx = walkingSpeed
        walkingEnemies.push({
            sprite: enemy,
            speed: walkingSpeed,
            direction: 1
        })
        return enemy
    }

    /**
     * Report whether this Player/Enemy overlap is a stomp from above.
     * Use it inside Arcade's normal Player overlaps Enemy event. The else
     * branch then represents contact with the enemy's sides or underside.
     * @param player the Player from the overlap event
     * @param enemy the Enemy from the overlap event
     */
    //% blockId=platformer_helpers_player_stomps_enemy
    //% block="Player $player=variables_get(sprite) stomps Enemy $enemy=variables_get(otherSprite)"
    //% group="Enemies"
    //% weight=95
    export function playerStompsEnemy(player: Sprite, enemy: Sprite): boolean {
        ensureRuntime()
        return isStompContact(player, enemy)
    }

    /**
     * Run student code when a falling Player lands on top of an Enemy.
     */
    //% blockId=platformer_helpers_on_player_stomps_enemy
    //% block="on $player Player stomps $enemy Enemy"
    //% blockHidden=true
    //% draggableParameters="reporter"
    //% group="Enemies"
    //% weight=90
    export function onPlayerStompsEnemy(handler: (player: Sprite, enemy: Sprite) => void): void {
        ensureRuntime()
        stompHandlers.push(handler)
    }

    /**
     * Create a MovingHazard sprite that travels between two tile locations.
     * @param art the hazard picture
     * @param startColumn starting tile column, eg: 6
     * @param startRow starting tile row, eg: 5
     * @param endColumn ending tile column, eg: 6
     * @param endRow ending tile row, eg: 9
     * @param speed movement speed in pixels per second, eg: 40
     */
    //% blockId=platformer_helpers_create_moving_hazard
    //% block="create moving hazard $art=screen_image_picker from col $startColumn row $startRow to col $endColumn row $endRow at speed $speed"
    //% blockSetVariable="movingHazard"
    //% duplicateShadowOnDrag
    //% group="Hazards"
    //% weight=100
    //% speed.min=0 speed.max=200
    export function createMovingHazard(
        art: Image,
        startColumn: number,
        startRow: number,
        endColumn: number,
        endRow: number,
        speed: number
    ): Sprite {
        return createPathMover(
            art,
            startColumn,
            startRow,
            endColumn,
            endRow,
            speed,
            SpriteKind.MovingHazard,
            false
        )
    }
}

