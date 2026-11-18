# Auto Card Fuse

## Commands

Enter commands in the Toolbox chat channel (`/8`).

| Command | Action |
| --- | --- |
| `fuse 1` | Fuse common cards |
| `fuse 2` | Fuse uncommon cards |
| `fuse 3` or `fuse` | Fuse rare cards |
| `fusestop` | Stop fusion and cancel any pending restart |
| `cardfusion register` | Register fragments up to 20 per card type |
| `cardfusion stop` | Stop the active card operation |

## How it works

Close the manual Random Fusion window before starting. The mod opens its own table on TERA Asura (protocol `376012`). It picks the largest eligible stacks of four distinct card types in your bag and pockets. Each type needs at least 20 registered copies, and you need four free inventory slots. Fusion skips card IDs `341034`, `340034`, `311068`, `310068`, and `311027`.

The smallest stack sets the batch size. For stacks of 7, 5, 4, and 2, the mod runs up to two confirmed fusions before closing the table. Once the server confirms closure and inventory updates, the mod rescans and opens a fresh table if four eligible types remain. It stops on a manual stop, a server rejection, or an unconfirmed fusion.
