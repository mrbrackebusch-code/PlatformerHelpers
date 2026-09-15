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

let movingHazard = platformerHelpers.createMovingHazard(
    image.create(16, 16),
    12,
    8,
    12,
    4,
    35
)

platformerHelpers.onPlayerStompsEnemy(function (player, enemy) {
    enemy.destroy()
    player.vy = -100
})


