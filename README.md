# [sightread](http://sightread.dev)

A free and open-source webapp for learning to play Piano. Play music without needing to learn sheet music. Plug in your MIDI keyboard for the optimal experience. See full details on the [website](https://sightread.dev/about).

<img alt="app screenshot" src="./public/images/mode_sheet_hero_readme.png" style="max-width: 100%"/>

## Project Status Update (March 2026)

Effective March 4, 2026, Sightread is transitioning to a **private development phase** while we iterate faster on product and sustainability. We are actively thinking about which parts of the project can stay open long-term, and will open source as much as possible in 2027.

Thank you for supporting the project and helping shape what comes next.

### What this means

- The code in this repository remains available under its current open-source license.
- The code and feature set in this snapshot will remain **free forever**.
- Pull requests are disabled. New development is happening in a private repository.
- We intend to open-source the core again in the future, and ideally as much of the full app as possible.

There was a 4, 5, crossover, those should basically never happen. Additionally, there was another scenario where the fingering was set to be a crossover from finger 2 to finger 1, but on a black key. That should never happen, other than very very rare cases. Using 1 on black keys should have a negative weighting, and also based on the time till next note, the algorithm should take that into account so it can decide if it wants to use the same finger twice. However, that also has to be pretty justified