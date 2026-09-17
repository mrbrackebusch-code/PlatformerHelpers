# Platformer Helpers

Four focused MakeCode Arcade blocks for student-built platformer games:

- create a moving platform from one tile coordinate to another;
- create a walking enemy that turns at walls and ledges;
- tell a stomp from a dangerous side or underside collision;
- create a moving hazard from one tile coordinate to another.

The extension handles movement plumbing while leaving game rules with the student. It does not replace Arcade's physics engine, change global gravity, or decide what stomping and touching hazards should do.

## Use in MakeCode Arcade

1. Open **Extensions** in a MakeCode Arcade project.
2. Search for this repository's GitHub URL.
3. Choose **Platformer Helpers**.
4. Set the tilemap before creating helpers that use tile coordinates.

The moving-platform helper is intentionally a flat, top-ridable platform. Player sprites can stand on and ride it. Landing and riding use Arcade's opaque-pixel collision bounds, so transparent padding around the platform or Player art does not create invisible support. Side and underside platform collisions are not added. Moving hazards remain ordinary sprites so the game's normal overlap events can decide what touching one means.

## Blocks

### Moving platform

Creates a platform from student-selected art, places its center at the starting tile, and moves it back and forth between the two coordinates. The block returns the platform sprite.

### Walking enemy

Creates a built-in Enemy sprite, applies gravity only to that enemy, and makes it turn around at walls and ledges. The block returns the enemy sprite.

### Player stomps Enemy (logic)

Use the normal **on Player overlaps Enemy** event, then place **Player sprite stomps Enemy otherSprite** in an `if` block. Put the enemy-defeat behavior in `then`; the `else` branch means the player touched the enemy from the side or underside.

```text
on Player overlaps Enemy
    if Player sprite stomps Enemy otherSprite
        destroy otherSprite
    else
        game over LOSE
```

The block contains the direction and motion checks. Students do not need to compare positions, velocities, or sprite edges themselves. It uses Arcade's opaque-pixel collision bounds, so transparent padding around either sprite does not turn a real stomp into a side hit. This single-overlap pattern also prevents a valid stomp from being treated as an unconditional lethal Player/Enemy overlap.

### Moving hazard

Creates a sprite of kind MovingHazard and moves it back and forth between two tile coordinates. It does not carry the player or prescribe damage behavior.

## Design boundary

This package deliberately does not include keys, doors, switches, checkpoints, puzzle systems, falling platforms, disappearing platforms, or other game-specific rules. Those remain student-authored game logic.

## License

MIT. Classroom use, copying, modification, and redistribution are welcome.

for PXT/arcade

