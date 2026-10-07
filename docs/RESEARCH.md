# Existing products — a quick competitive check

Done before finalising the architecture, to avoid unknowingly re-implementing an existing design and to find room for a distinct identity. Nothing from these products (characters, assets, UI, terminology, levels or code) is used.

| Product | What it does | Similar | Different in מבוך החידות |
| --- | --- | --- | --- |
| **Encarta MindMaze** (Microsoft, 1993–1997) | First-person walk through a medieval castle; answering a trivia question opens the door to the next room. | First-person fantasy setting with trivia as the gate to progress. | A wrong answer never locks anything. Questions give *information* (the creature reveals the route) instead of acting as keys. Each labyrinth is procedurally generated, there's a timer with lives, and the game is designed in Hebrew. |
| **Treasure Mountain!** (The Learning Company, 1990) | Children catch elves who ask riddles; a correct answer gives a clue toward hidden treasure. | Knowledge → clue. Characters who ask questions. | Real-time first-person 3D navigation; the clue is a physical, in-world magical route rather than text. Age-adaptive content from 5 to adult. |
| **QuizzLand** and similar mobile "trivia maze" games | Quiz levels alternating with a 2D maze screen, with hint purchases. | Combines trivia with mazes. | No separate quiz screens and no route-selection menu: the 3D world stays visible and the player always walks the route themselves. |
| **Small itch.io maze/trivia games** ("MindMaze Challenge" and others) | Mostly quiz menus with maze theming, or plain first-person mazes without questions. | Theme overlap. | A full game loop (encounters at meaningful junctions, checkpoints, rare events, score transparency, age-separated leaderboards). |

## What makes this game its own

- **Knowledge buys information, not permission.** A wrong answer costs certainty and time — never a door, a life or the player's freedom of movement.
- **Diegetic guidance.** Creatures point, fly or breathe fire toward the right archway; the arch ignites and runes glow on the floor. No arrows, no menus.
- **Physical navigation is the interface.** There is no "choose left/right" UI anywhere.
- **Hebrew-first.** Native Hebrew questions and dialogue, gender-aware second-person address and full RTL.
- **Age-adaptive.** Separate question banks, maze sizes and difficulty curves for five age groups, including challenging adult trivia for 16+.

Sources: [Encarta MindMaze (Wikipedia)](https://en.wikipedia.org/wiki/Encarta_MindMaze), [Treasure Mountain! (Wikipedia)](https://en.wikipedia.org/wiki/Treasure_Mountain!), [QuizzLand](https://www.bluestacks.com/campaign/com.xmonetize.quizzland/en), [MindMaze Challenge (itch.io)](https://xizequaltoy.itch.io/mindmaze-challenge).
