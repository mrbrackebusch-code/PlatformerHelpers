function compileCoverage(): void {
    platformerHelpers.createMovingPlatform(image.create(16, 4), 2, 8, 8, 8, 30)
    platformerHelpers.createWalkingEnemy(image.create(16, 16), 10, 8, 25)
    platformerHelpers.createMovingHazard(image.create(16, 16), 12, 8, 12, 4, 35)
    platformerHelpers.createThreeKeys(image.create(8, 8), 3, 7, 7, 5, 11, 7)
    platformerHelpers.allThreeKeysCollected()
}

let collisionScenario = 0
let stompOverlapCount = 0
let sideOverlapCount = 0
let undersideOverlapCount = 0
let stompClassified = false
let sideClassified = true
let undersideClassified = true

sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (player, enemy) {
    const classifiedAsStomp = platformerHelpers.playerStompsEnemy(player, enemy)
    if (collisionScenario === 1) {
        stompOverlapCount += 1
        stompClassified = classifiedAsStomp
    } else if (collisionScenario === 2) {
        sideOverlapCount += 1
        sideClassified = classifiedAsStomp
    } else if (collisionScenario === 3) {
        undersideOverlapCount += 1
        undersideClassified = classifiedAsStomp
    }

    // Keep each scenario to one overlap callback so the result is exact.
    player.setFlag(SpriteFlag.GhostThroughSprites, true)
    enemy.setFlag(SpriteFlag.GhostThroughSprites, true)
})

function paddedPlayerArt(): Image {
    const art = image.create(24, 24)
    art.fillRect(5, 4, 14, 14, 8)
    return art
}

function paddedEnemyArt(): Image {
    const art = image.create(24, 24)
    art.fillRect(4, 5, 16, 15, 4)
    return art
}

function spawnStationaryEnemy(x: number, y: number): Sprite {
    const enemy = platformerHelpers.createWalkingEnemy(paddedEnemyArt(), 4, 4, 0)
    enemy.setPosition(x, y)
    enemy.ay = 0
    enemy.vx = 0
    return enemy
}

function spawnPlayer(x: number, y: number): Sprite {
    const player = sprites.create(paddedPlayerArt(), SpriteKind.Player)
    player.setPosition(x, y)
    return player
}

const blankTile = image.create(16, 16)
const tileData = control.createBuffer(4 + 8 * 8)
tileData.setNumber(NumberFormat.UInt16LE, 0, 8)
tileData.setNumber(NumberFormat.UInt16LE, 2, 8)
tiles.setCurrentTilemap(tiles.createTilemap(
    tileData,
    image.create(8, 8),
    [blankTile],
    TileScale.Sixteen
))

// Falling from above must be classified as a stomp. Both images have a fully
// transparent outer border, so their image rectangles overlap before their
// opaque-pixel hitboxes do.
collisionScenario = 1
let proofEnemy = spawnStationaryEnemy(64, 72)
let proofPlayer = spawnPlayer(64, 36)
proofPlayer.vy = 120
pause(700)
proofPlayer.destroy()
proofEnemy.destroy()

// Contact at the enemy's side must not be classified as a stomp.
collisionScenario = 2
proofEnemy = spawnStationaryEnemy(64, 72)
proofPlayer = spawnPlayer(30, 72)
proofPlayer.vx = 100
pause(500)
proofPlayer.destroy()
proofEnemy.destroy()

// Contact while rising into the enemy's underside must not be a stomp either.
collisionScenario = 3
proofEnemy = spawnStationaryEnemy(64, 60)
proofPlayer = spawnPlayer(64, 92)
proofPlayer.vy = -100
pause(500)

const collisionProofPassed = stompOverlapCount === 1
    && stompClassified
    && sideOverlapCount === 1
    && !sideClassified
    && undersideOverlapCount === 1
    && !undersideClassified

console.log("PLATFORMER_HELPERS_COLLISION result=" + (collisionProofPassed ? "PASS" : "FAIL")
    + " stompOverlap=" + stompOverlapCount
    + " stompClassified=" + stompClassified
    + " sideOverlap=" + sideOverlapCount
    + " sideClassified=" + sideClassified
    + " undersideOverlap=" + undersideOverlapCount
    + " undersideClassified=" + undersideClassified)

proofPlayer.destroy()
proofEnemy.destroy()

function keyArt(): Image {
    const art = image.create(8, 8)
    art.fill(5)
    return art
}

function kindContains(target: Sprite): boolean {
    for (const sprite of sprites.allOfKind(SpriteKind.PlatformerKey)) {
        if (sprite === target) return true
    }
    return false
}

function helperKeyIsAt(column: number, row: number, unrelated: Sprite): boolean {
    const location = tiles.getTileLocation(column, row)
    for (const key of sprites.allOfKind(SpriteKind.PlatformerKey)) {
        if (key !== unrelated && key.x === location.x && key.y === location.y) return true
    }
    return false
}

function collectKeyAt(player: Sprite, column: number, row: number): void {
    const location = tiles.getTileLocation(column, row)
    player.setPosition(location.x, location.y)
    pause(120)
}

// A public kind must not make arbitrary PlatformerKey sprites part of the
// helper's private three-key goal. This sprite represents a student's separate
// key-like object and must survive setup and contact.
control.runInParallel(function () {
    pause(50)
    const unrelatedKey = sprites.create(keyArt(), SpriteKind.PlatformerKey)
    unrelatedKey.setPosition(112, 112)

    platformerHelpers.createThreeKeys(keyArt(), 1, 1, 3, 1, 5, 1)
    pause(50)

    const unrelatedSurvivedSetup = kindContains(unrelatedKey)
    const spawnedExactlyThreeHelpers = sprites.allOfKind(SpriteKind.PlatformerKey).length === 4
        && helperKeyIsAt(1, 1, unrelatedKey)
        && helperKeyIsAt(3, 1, unrelatedKey)
        && helperKeyIsAt(5, 1, unrelatedKey)
    const falseBeforeCollection = !platformerHelpers.allThreeKeysCollected()

    const keyPlayer = sprites.create(paddedPlayerArt(), SpriteKind.Player)
    keyPlayer.setPosition(unrelatedKey.x, unrelatedKey.y)
    pause(120)
    const unrelatedIgnored = kindContains(unrelatedKey)
        && !platformerHelpers.allThreeKeysCollected()

    collectKeyAt(keyPlayer, 1, 1)
    const falseAfterFirst = !platformerHelpers.allThreeKeysCollected()
        && sprites.allOfKind(SpriteKind.PlatformerKey).length === 3

    collectKeyAt(keyPlayer, 3, 1)
    const falseAfterSecond = !platformerHelpers.allThreeKeysCollected()
        && sprites.allOfKind(SpriteKind.PlatformerKey).length === 2

    collectKeyAt(keyPlayer, 5, 1)
    const trueAfterThird = platformerHelpers.allThreeKeysCollected()
        && sprites.allOfKind(SpriteKind.PlatformerKey).length === 1

    // Starting a new set must reset progress while preserving unrelated sprites.
    platformerHelpers.createThreeKeys(keyArt(), 1, 2, 3, 2, 5, 2)
    pause(50)
    const completedSetReset = !platformerHelpers.allThreeKeysCollected()
        && kindContains(unrelatedKey)
        && sprites.allOfKind(SpriteKind.PlatformerKey).length === 4

    collectKeyAt(keyPlayer, 1, 2)
    platformerHelpers.createThreeKeys(keyArt(), 1, 3, 3, 3, 5, 3)
    pause(50)
    const partialSetReplaced = !platformerHelpers.allThreeKeysCollected()
        && kindContains(unrelatedKey)
        && sprites.allOfKind(SpriteKind.PlatformerKey).length === 4
        && helperKeyIsAt(1, 3, unrelatedKey)
        && helperKeyIsAt(3, 3, unrelatedKey)
        && helperKeyIsAt(5, 3, unrelatedKey)

    const keyProofPassed = unrelatedSurvivedSetup
        && spawnedExactlyThreeHelpers
        && falseBeforeCollection
        && unrelatedIgnored
        && falseAfterFirst
        && falseAfterSecond
        && trueAfterThird
        && completedSetReset
        && partialSetReplaced

    console.log("PLATFORMER_HELPERS_KEYS result=" + (keyProofPassed ? "PASS" : "FAIL")
        + " unrelatedSurvivedSetup=" + unrelatedSurvivedSetup
        + " spawnedExactlyThreeHelpers=" + spawnedExactlyThreeHelpers
        + " falseBeforeCollection=" + falseBeforeCollection
        + " unrelatedIgnored=" + unrelatedIgnored
        + " falseAfterFirst=" + falseAfterFirst
        + " falseAfterSecond=" + falseAfterSecond
        + " trueAfterThird=" + trueAfterThird
        + " completedSetReset=" + completedSetReset
        + " partialSetReplaced=" + partialSetReplaced)
})

