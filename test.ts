let movingPlatform = platformerHelpers.createMovingPlatform(
    image.create(16, 4),
    2,
    8,
    8,
    8,
    30
)

let walkingEnemy = platformerHelpers.createWalkingEnemy(
    image.create(16, 16),
    10,
    8,
    25
)

sprites.onOverlap(SpriteKind.Player, SpriteKind.Enemy, function (sprite, otherSprite) {
    if (platformerHelpers.playerStompsEnemy(sprite, otherSprite)) {
        otherSprite.destroy()
    } else {
        game.over(false)
    }
})

// Regression fixture: Arcade ignores transparent padding when it builds a
// sprite hitbox. Stomp detection must use that same opaque-pixel boundary.
let paddedEnemyArt = image.create(24, 24)
paddedEnemyArt.fillRect(4, 4, 16, 15, 4)
let paddedEnemy = sprites.create(paddedEnemyArt, SpriteKind.Enemy)

// Regression fixture: moving-platform support must also follow the opaque
// pixels instead of the outer dimensions of the selected art.
let paddedPlatformArt = image.create(24, 8)
paddedPlatformArt.fillRect(4, 3, 16, 3, 7)
let paddedMovingPlatform = platformerHelpers.createMovingPlatform(
    paddedPlatformArt,
    2,
    6,
    8,
    6,
    30
)

let movingHazard = platformerHelpers.createMovingHazard(
    image.create(16, 16),
    12,
    8,
    12,
    4,
    35
)

