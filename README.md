# Platformer Helpers

Six focused MakeCode Arcade blocks for student-built platformer games:

- create a moving platform from one tile coordinate to another;
- create a walking enemy that turns at walls and ledges;
- tell a stomp from a dangerous side or underside collision;
- create a moving hazard from one tile coordinate to another;
- create three automatically collected keys at three tile coordinates; and
- check whether all three keys have been collected.

The extension handles movement plumbing while leaving game rules with the student. It does not replace Arcade's physics engine, change global gravity, or decide what stomping and touching hazards should do.

## Use in MakeCode Arcade

1. Open **Extensions** in a MakeCode Arcade project.
2. Search for this repository's GitHub URL.
3. Choose **Platformer Helpers**.
4. Set the tilemap before creating helpers that use tile coordinates.

The moving-platform helper is intentionally a flat, top-ridable platform. Player sprites can stand on and ride it. Landing and riding use Arcade's opaque-pixel collision bounds, so transparent padding around the platform or Player art does not create invisible support. Side and underside platform collisions are not added. Moving hazards remain ordinary sprites so the game's normal overlap events can decide what touching one means.

## Classroom migration category

The blue **Platformer Helpers 2** toolbox category contains one-for-one copies of every visible block in the original purple **Platformer Helpers** category. The block names, inputs, output types, default variable names, sprite kinds, and runtime behavior are the same; only the toolbox category and block identities are new.

To replace a block without risking its selected art, first drag the old block out of its event or stack but leave it in the workspace. Add the matching block from **Platformer Helpers 2**, select the same art and copy the values, connect the new block, and only then remove or ignore the old block.

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

**MovingHazard** appears in Arcade's sprite-kind dropdown. To make contact lethal, use the normal sprite-overlap event:

```text
on Player overlaps MovingHazard
    game over LOSE
```

### Three-key goal

**Create 3 keys** uses one student-selected picture for all three keys and places them at three tile coordinates. Touching a key with a Player automatically collects it. Running the setup block again removes the old key set and starts the count over at zero.

**PlatformerKey** appears in Arcade's sprite-kind dropdown, so ordinary overlap blocks can identify the keys created by the helper without inventing a separate kind.

Place **all 3 keys collected** inside an `if` in the normal overlap event for the level's win-area tile. The student still decides what happens when the condition is true.

```text
on Player overlaps win-area tile
    if all 3 keys collected
        game over WIN
```

The key count is private to this helper and only the three keys created by the latest **create 3 keys** block can satisfy it. Other Food sprites, collectibles, and separately created PlatformerKey sprites are preserved and do not count.

## Executable regression proofs

The package's executable Arcade test uses 24-by-24 Player and Enemy images whose opaque art is surrounded on every side by transparent pixels. It drives three real Player/Enemy overlaps through Arcade's physics and public overlap event: a descending top contact must report a stomp, while side and rising underside contacts must not. The test fails unless all three callbacks occur exactly once with those classifications.

The same running test creates a separate PlatformerKey sprite and a helper-owned three-key set. It proves the unrelated sprite survives setup and Player contact; the goal remains false after zero, one, and two collected helper keys; it becomes true after exactly the third; and both complete and partial key sets reset cleanly when a new set is created.

## Design boundary

This package deliberately does not include doors, switches, checkpoints, broader inventory systems, falling platforms, disappearing platforms, or other game-specific rules. Those remain student-authored game logic.

## License

MIT. Classroom use, copying, modification, and redistribution are welcome.

for PXT/arcade

