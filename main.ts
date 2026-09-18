namespace SpriteKind {
    /**
     * The sprite kind used by hazards made with create moving hazard.
     */
    //% isKind
    export const MovingHazard = SpriteKind.create()

    /**
     * The sprite kind used by keys made with create 3 keys.
     */
    //% isKind
    export const PlatformerKey = SpriteKind.create()
}

/**
 * Simple platformer mechanics that keep the interesting game choices visible.
 */
//% block="Platformer Helpers"
//% color="#7c3aed"
//% icon="\uf1b0"
//% groups='["Platforms", "Enemies", "Hazards", "Keys"]'
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

    interface CollisionBounds {
        left: number
        right: number
        top: number
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
    let activeKeys: Sprite[] = []
    let keysCollected = 0
    let keysRequired = 0
    let runtimeScene: scene.Scene = null
    let lastUpdateMillis = 0

    function isDestroyed(sprite: Sprite): boolean {
        return !sprite || !!(sprite.flags & sprites.Flag.Destroyed)
    }

    function ensureRuntime(): void {
        // PXT can invoke an exported helper before the extension's global array
        // initializers have run in a test/consumer program. Keep every exported
        // entry point safe in that ordering as well as during normal play.
        if (!stompHandlers) stompHandlers = []
        if (!activeKeys) activeKeys = []

        const current = game.currentScene()
        if (runtimeScene === current) return

        runtimeScene = current
        movers = []
        walkingEnemies = []
        riders = []
        playerSnapshots = []
        stompContacts = []
        activeKeys = []
        keysCollected = 0
        keysRequired = 0
        lastUpdateMillis = control.millis()

        sprites.onOverlap(SpriteKind.Player, SpriteKind.PlatformerKey, function (player, key) {
            if (isDestroyed(key)) return

            let belongsToActiveSet = false
            const retainedKeys: Sprite[] = []
            for (const activeKey of activeKeys) {
                if (activeKey === key) {
                    belongsToActiveSet = true
                } else {
                    retainedKeys.push(activeKey)
                }
            }
            if (!belongsToActiveSet) return

            activeKeys = retainedKeys
            key.destroy()
            keysCollected += 1
        })

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
            const bounds = collisionBounds(player)
            playerSnapshots.push({
                sprite: player,
                left: bounds.left,
                right: bounds.right,
                bottom: bounds.bottom
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

    function collisionBounds(sprite: Sprite): CollisionBounds {
        const hitbox = game.calculateHitBox(sprite)
        return {
            left: Fx.toFloat(hitbox.left),
            right: Fx.toFloat(hitbox.right) + 1,
            top: Fx.toFloat(hitbox.top),
            bottom: Fx.toFloat(hitbox.bottom) + 1
        }
    }

    function boundsOverlapHorizontally(
        left: number,
        right: number,
        other: CollisionBounds
    ): boolean {
        return right > other.left + 1 && left < other.right - 1
    }

    function alignPlayerOnPlatform(player: Sprite, platformBounds: CollisionBounds): void {
        const playerBounds = collisionBounds(player)
        player.bottom += platformBounds.top - playerBounds.bottom
    }

    function isStompContact(player: Sprite, enemy: Sprite): boolean {
        if (isDestroyed(player) || isDestroyed(enemy)) return false

        const playerBounds = collisionBounds(player)
        const enemyBounds = collisionBounds(enemy)
        if (player.vy < 0
            || !boundsOverlapHorizontally(playerBounds.left, playerBounds.right, enemyBounds)
            || playerBounds.top >= enemyBounds.bottom) {
            return false
        }

        const snapshot = snapshotFor(player)
        if (snapshot) {
            return snapshot.bottom <= enemyBounds.top + 1
                && playerBounds.bottom >= enemyBounds.top
        }

        // A snapshot is not available when this is the first helper block used
        // in an already-running scene. Keep that first contact useful while
        // still rejecting obvious side and underside hits.
        const penetration = playerBounds.bottom - enemyBounds.top
        return player.y < enemy.y
            && penetration >= -1
            && penetration <= Math.max(
                2,
                Math.min(
                    playerBounds.bottom - playerBounds.top,
                    enemyBounds.bottom - enemyBounds.top
                ) / 2
            )
    }

    function stillInStompContact(contact: StompContact): boolean {
        if (isDestroyed(contact.player) || isDestroyed(contact.enemy)) return false
        const playerBounds = collisionBounds(contact.player)
        const enemyBounds = collisionBounds(contact.enemy)
        return boundsOverlapHorizontally(playerBounds.left, playerBounds.right, enemyBounds)
            && playerBounds.bottom >= enemyBounds.top - 1
            && playerBounds.top < enemyBounds.bottom
            && contact.player.y < contact.enemy.y
    }

    function detectStomps(): void {
        const retained: StompContact[] = []
        for (const contact of stompContacts) {
            if (stillInStompContact(contact)) retained.push(contact)
        }
        stompContacts = retained

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
                const handlers = stompHandlers ? stompHandlers.slice() : []
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
            if (existing && !isDestroyed(existing.mover.sprite)) {
                const playerBounds = collisionBounds(player)
                const platformBounds = collisionBounds(existing.mover.sprite)
                if (player.vy >= 0
                    && boundsOverlapHorizontally(
                        playerBounds.left,
                        playerBounds.right,
                        platformBounds
                    )) {
                    moveSpriteThroughTilePhysics(player, existing.mover.lastDx, existing.mover.lastDy)
                    alignPlayerOnPlatform(player, platformBounds)
                    if (player.vy > 0) player.vy = 0
                    setBottomContact(player, existing.mover.sprite)
                    retained.push(existing)
                    continue
                }
            }

            const snapshot = snapshotFor(player)
            if (!snapshot || player.vy < 0) continue

            const playerBounds = collisionBounds(player)
            let landing: PathMover = null
            let landingTop = 0x7fffffff
            for (const mover of platformMovers) {
                if (isDestroyed(mover.sprite)) continue
                const platformBounds = collisionBounds(mover.sprite)
                const oldTop = platformBounds.top - mover.lastDy
                if (snapshot.bottom <= oldTop + 1
                    && playerBounds.bottom >= platformBounds.top
                    && boundsOverlapHorizontally(
                        playerBounds.left,
                        playerBounds.right,
                        platformBounds
                    )
                    && platformBounds.top < landingTop) {
                    landing = mover
                    landingTop = platformBounds.top
                }
            }

            if (landing) {
                moveSpriteThroughTilePhysics(player, landing.lastDx, 0)
                alignPlayerOnPlatform(player, collisionBounds(landing.sprite))
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

        // Arcade dispatches overlap events in parallel with its physics frame.
        // Use the contact classified immediately after physics when available;
        // otherwise classify the live contact from the pre-physics snapshot.
        for (const contact of stompContacts) {
            if (contact.player === player && contact.enemy === enemy) return true
        }
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

    function createKey(art: Image, column: number, row: number): Sprite {
        const key = sprites.create(art || img`
            . . 5 5 5 . . .
            . 5 . . . 5 . .
            . 5 . . . 5 . .
            . . 5 5 5 . . .
            . . . 5 . . . .
            . . . 5 5 5 . .
            . . . 5 . 5 . .
            . . . 5 5 5 . .
        `, SpriteKind.PlatformerKey)
        const location = tiles.getTileLocation(Math.round(column), Math.round(row))
        if (location) tiles.placeOnTile(key, location)
        return key
    }

    /**
     * Create three automatically collected keys at three tile locations.
     * Creating a new set removes any keys from the previous set and resets the count.
     * @param art the key picture
     * @param firstColumn first key tile column, eg: 4
     * @param firstRow first key tile row, eg: 7
     * @param secondColumn second key tile column, eg: 8
     * @param secondRow second key tile row, eg: 5
     * @param thirdColumn third key tile column, eg: 12
     * @param thirdRow third key tile row, eg: 7
     */
    //% blockId=platformer_helpers_create_three_keys
    //% block="create 3 keys $art=screen_image_picker at col $firstColumn row $firstRow, col $secondColumn row $secondRow, and col $thirdColumn row $thirdRow"
    //% duplicateShadowOnDrag
    //% group="Keys"
    //% weight=100
    export function createThreeKeys(
        art: Image,
        firstColumn: number,
        firstRow: number,
        secondColumn: number,
        secondRow: number,
        thirdColumn: number,
        thirdRow: number
    ): void {
        ensureRuntime()

        for (const key of activeKeys) {
            key.destroy()
        }

        activeKeys = []
        keysCollected = 0
        keysRequired = 3
        activeKeys.push(createKey(art, firstColumn, firstRow))
        activeKeys.push(createKey(art, secondColumn, secondRow))
        activeKeys.push(createKey(art, thirdColumn, thirdRow))
    }

    /**
     * Report whether all three keys from create 3 keys have been collected.
     */
    //% blockId=platformer_helpers_all_three_keys_collected
    //% block="all 3 keys collected"
    //% group="Keys"
    //% weight=95
    export function allThreeKeysCollected(): boolean {
        ensureRuntime()
        return keysRequired === 3 && keysCollected >= keysRequired
    }
}

/**
 * Migration copies of Platformer Helpers blocks. The separate category lets an
 * old art-bearing block remain in the workspace until its replacement is ready.
 */
//% block="Platformer Helpers 2"
//% color="#2563eb"
//% icon="\uf1b0"
//% groups='["Platforms", "Enemies", "Hazards", "Keys"]'
namespace platformerHelpers2 {
    //% blockId=platformer_helpers_create_moving_platform_2
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
        return platformerHelpers.createMovingPlatform(
            art,
            startColumn,
            startRow,
            endColumn,
            endRow,
            speed
        )
    }

    //% blockId=platformer_helpers_create_walking_enemy_2
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
        return platformerHelpers.createWalkingEnemy(art, column, row, speed)
    }

    //% blockId=platformer_helpers_player_stomps_enemy_2
    //% block="Player $player=variables_get(sprite) stomps Enemy $enemy=variables_get(otherSprite)"
    //% group="Enemies"
    //% weight=95
    export function playerStompsEnemy(player: Sprite, enemy: Sprite): boolean {
        return platformerHelpers.playerStompsEnemy(player, enemy)
    }

    //% blockId=platformer_helpers_create_moving_hazard_2
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
        return platformerHelpers.createMovingHazard(
            art,
            startColumn,
            startRow,
            endColumn,
            endRow,
            speed
        )
    }

    //% blockId=platformer_helpers_create_three_keys_2
    //% block="create 3 keys $art=screen_image_picker at col $firstColumn row $firstRow, col $secondColumn row $secondRow, and col $thirdColumn row $thirdRow"
    //% duplicateShadowOnDrag
    //% group="Keys"
    //% weight=100
    export function createThreeKeys(
        art: Image,
        firstColumn: number,
        firstRow: number,
        secondColumn: number,
        secondRow: number,
        thirdColumn: number,
        thirdRow: number
    ): void {
        platformerHelpers.createThreeKeys(
            art,
            firstColumn,
            firstRow,
            secondColumn,
            secondRow,
            thirdColumn,
            thirdRow
        )
    }

    //% blockId=platformer_helpers_all_three_keys_collected_2
    //% block="all 3 keys collected"
    //% group="Keys"
    //% weight=95
    export function allThreeKeysCollected(): boolean {
        return platformerHelpers.allThreeKeysCollected()
    }
}

