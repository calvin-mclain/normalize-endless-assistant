/* The build itself: roles, starters, splice list, final team, item targets, boss notes and troubleshooting.
 * Strategy text follows Grex's Endless Entrainment Normalize Build and the owner's project guide;
 * every Pokémon, move and ability is referenced by the game's own enum key so the data module can check it. */
NZ.kb = (function () {
  "use strict";

  var ROLE_ORDER = ["carry", "staller", "runner", "partner", "killer", "tutor"];

  var roles = {
    carry: {
      name: "Carry", pick: "REGIGIGAS", finalHalf: "partner",
      job: "Clears every double battle with one spread move while the others learn their moves. At the end it becomes the Normalize half of Jynxgigas."
    },
    staller: {
      name: "Staller", pick: "PUMPKABOO", finalName: "Mega Gouot",
      job: "Lure and crowd control. Leads once you run: Dark Void, Mat Block, Powder Snow, Trick-or-Treat."
    },
    runner: {
      name: "Runner", pick: "TEDDIURSA", finalName: "Teddiurk",
      job: "Flees every wave with Run Away. Also Roars away what you don't want, steals with Thief and answers Neutralizing Gas."
    },
    partner: {
      name: "Normalize partner", pick: "SMOOCHUM", finalName: "Jynxgigas",
      job: "Fast Psychic Surge Pokémon. Fused with the carry it gives bosses Normalize with Entrainment, then Curses them."
    },
    killer: {
      name: "Boss killer", pick: "YAMASK", finalName: "Yamazone",
      job: "Sits at 1 HP on Sturdy, heals to full from Leech Seed and kills with Salt Cure on a Soaked boss."
    },
    tutor: {
      name: "Tutor", pick: "SMEARGLE",
      job: "Only here to teach Dark Void and Sketch to the staller. Gone after the first splice."
    }
  };

  /* What each starter has to bring. Keys are checked against game data and, when synced, against your unlocks. */
  var needs = {
    carry: {
      ability: ["NORMALIZE"], abilityWhy: "Normalize is what Entrainment hands to the boss.",
      passive: ["SCRAPPY"], passiveOptional: true, passiveWhy: "Scrappy lets its Normal-type moves hit Ghosts while it carries.",
      natureNames: ["Adamant"], natureWhy: "Adamant for the carry phase.",
      eggMoves: [{ key: "STORM_THROW", why: "The single-target move it starts with." }, { key: "LANDS_WRATH", why: "A stronger spread move than Rock Slide (90 power, never misses). Ground-type when Neutralizing Gas turns Normalize off. Optional.", optional: true }],
      tms: ["ROCK_SLIDE", "DARKEST_LARIAT", "ENDURE"],
      tmWhy: "Rock Slide for doubles, Darkest Lariat as the single-target alternative, Endure for berry boosts.",
      alternatives: ["SKITTY"],
      altNote: "Skitty has Normalize as a regular ability and Entrainment as an egg move; it is a far weaker carry (the Kyogre variant pairs Delcatty with a Kyogre carry)."
    },
    staller: {
      passiveSet: "lure", passiveWhy: "A lure passive plus a lure ability later is what makes every wave a double.",
      form: 0, formWhy: "Only Average Size has Illuminate.",
      ability: ["PICKUP", "FRISK"], abilityOptional: true, abilityWhy: "Pickup for early items; Frisk shows wild abilities without catching.",
      speedNature: true, natureWhy: "Jolly or Timid: this is one of the two speed-invested Pokémon.",
      levelMoves: ["TRICK_OR_TREAT"], levelWhy: "Trick-or-Treat is why this build needs the Pumpkaboo line.",
      speedIv: true,
      alternatives: [],
      altNote: "No substitute: only Pumpkaboo and Gourgeist learn Trick-or-Treat."
    },
    runner: {
      passive: ["RUN_AWAY"], passiveWhy: "Run Away as a passive leaves the ability slot free for a lure.",
      ability: ["HONEY_GATHER", "PICKUP"], abilityOptional: true, abilityWhy: "Honey Gather (hidden) speeds early rerolls; Pickup is fine.",
      tms: ["THIEF", "ROAR"], tmWhy: "Thief steals eggs, Roar removes the Pokémon you don't want.",
      keepUnevolved: true,
      alternatives: ["COMBEE", "ZIGZAGOON"],
      altNote: "Any Run Away passive works; Combee brings Honey Gather."
    },
    partner: {
      passive: ["PSYCHIC_SURGE"], passiveWhy: "Psychic Terrain blocks priority moves and overwrites Electric Terrain.",
      speedNature: true, natureWhy: "Timid: it must move before the boss.",
      speedIv: true,
      alternatives: ["SPOINK", "CELEBI", "BLIPBUG"],
      altNote: "Blipbug only gains Psychic Surge once it evolves into Dottler; Orbeetle is slower, so give it more Lucky and Golden Eggs."
    },
    killer: {
      passive: ["PURIFYING_SALT"], passiveWhy: "Purifying Salt stops the poison, burn and paralysis tokens from breaking the Sturdy loop.",
      type: "GHOST", typeWhy: "Ghost-type, so a Normalized boss cannot touch it.",
      alternatives: ["PICHU", "DIGLETT", "SINISTEA"],
      altNote: "Spiky-eared Pichu, Diglett and Antique Sinistea have Sturdy as the passive instead; only Sinistea is Ghost-type."
    },
    tutor: {
      eggMoves: [{ key: "DARK_VOID", why: "The move it exists to teach." }],
      levelMoves: ["SKETCH"], levelWhy: "Sketch copies Mat Block or Powder Snow later.",
      alternatives: ["DROWZEE", "ESPURR", "GASTLY", "LUNATONE"],
      altNote: "Any starter with Dark Void as its rare egg move can teach it; only Smeargle adds Sketch."
    }
  };

  /* The four fusions you run with. Move entries that are arrays mean "either one". */
  var finalTeam = {
    staller: {
      name: "Mega Gouot", made: "Gourgeist + a fast No Guard Pokémon", ability: "No Guard", passive: "Illuminate", nature: "Jolly or Timid",
      moves: ["DARK_VOID", "MAT_BLOCK", "POWDER_SNOW", "TRICK_OR_TREAT"],
      items: { CARBOS: 31, SOUL_DEW: 10, LUCKY_EGG: 99, GOLDEN_EGG: 20, WIDE_LENS: 3, MULTI_LENS: 2, KINGS_ROCK: 3, MINI_BLACK_HOLE: 1 },
      why: "Two lure sources (ability and passive) drive the doubles chain. Dark Void and Mat Block control doubles, Powder Snow flinches and freezes, Trick-or-Treat makes a target Ghost-type."
    },
    runner: {
      name: "Teddiurk", made: "Teddiursa + a lure-ability Pokémon (Golurk)", ability: "No Guard", passive: "Run Away", nature: "any",
      moves: ["THIEF", ["RUINATION", "NATURES_MADNESS"], "ROAR", ["GASTRO_ACID", "CORE_ENFORCER"]],
      items: { MINI_BLACK_HOLE: 1, MULTI_LENS: 2, REVIVER_SEED: 1 },
      why: "Guaranteed escape, the third lure, Roar, a half-HP move for catches, Thief for eggs and Gastro Acid for Neutralizing Gas without switching."
    },
    partner: {
      name: "Jynxgigas", made: "Jynx + Regigigas", ability: "Normalize", passive: "Psychic Surge", nature: "Timid",
      moves: ["ENTRAINMENT", "CURSE", "GASTRO_ACID", "DISABLE"],
      items: { CARBOS: 31, SOUL_DEW: 10, LUCKY_EGG: 99, GOLDEN_EGG: 20, MYSTICAL_ROCK: 2, MINI_BLACK_HOLE: 1 },
      tera: "GHOST",
      why: "Moves first, gives the boss Normalize, then Curses it while immune as a Tera Ghost."
    },
    killer: {
      name: "Yamazone", made: "Yamask + a Rock, Ground or Steel Sturdy Pokémon", ability: "Sturdy", passive: "Purifying Salt", nature: "any",
      moves: ["HEAL_BLOCK", "LEECH_SEED", "SOAK", "SALT_CURE"],
      items: { LEFTOVERS: 4, WIDE_LENS: 2 },
      why: "Heals to full every turn from Leech Seed, blocks the boss's healing and stacks Salt Cure, doubled on a Soaked boss."
    }
  };

  var itemInfo = {
    CARBOS: { name: "Carbos", why: "Speed. Fed through fuse-and-dump. Capped by the holder's Speed IV." },
    SOUL_DEW: { name: "Soul Dew", why: "+10 % nature effect each, so the +Speed nature scales." },
    LUCKY_EGG: { name: "Lucky Egg", why: "+40 % EXP each. Levels keep the two speed Pokémon fast. Only found on wild Pokémon, never in the shop." },
    GOLDEN_EGG: { name: "Golden Egg", why: "+100 % EXP each. About 20 is enough. Only found on wild Pokémon, never in the shop." },
    WIDE_LENS: { name: "Wide Lens", why: "+5 accuracy each: Dark Void and Leech Seed stop missing." },
    MULTI_LENS: { name: "Multi Lens", why: "Extra strikes: Powder Snow flinches more often, Thief hits three times." },
    KINGS_ROCK: { name: "King's Rock", why: "+10 % flinch each on Powder Snow. Does nothing for moves that already flinch." },
    LEFTOVERS: { name: "Leftovers", why: "Healing every turn on top of Leech Seed." },
    MINI_BLACK_HOLE: { name: "Mini Black Hole", why: "Takes one item from a foe at the end of every turn, whatever move you used." },
    GRIP_CLAW: { name: "Grip Claw", why: "10 % per claw per hit, attacking moves only. Useful on whoever attacks; does nothing on Jynxgigas." },
    REVIVER_SEED: { name: "Reviver Seed", why: "One safe turn to Gastro Acid a Paradox Pokémon or Eternatus." },
    MYSTICAL_ROCK: { name: "Mystical Rock", why: "Psychic Terrain lasts two turns longer." },
    TERA_ORB: { name: "Tera Orb", why: "Needed to Terastallize; Tera Shards appear once you hold it." },
    LOCK_CAPSULE: { name: "Lock Capsule", why: "Lock rarities while rerolling for balls." },
    SHINY_CHARM: { name: "Shiny Charm", why: "Four charms make wild shinies 1 in 32." },
    AMULET_COIN: { name: "Amulet Coin", why: "+20 % money each." },
    BERRY_POUCH: { name: "Berry Pouch", why: "Berries are kept more often." },
    MEGA_BRACELET: { name: "Mega Bracelet", why: "Mega Stones appear, for a Mega Pidgeot partner." }
  };

  var bagTargets = [
    { key: "TERA_ORB", target: 1, note: "plus Ghost Tera Shards for Jynxgigas and Teddiurk" },
    { key: "LOCK_CAPSULE", target: 1 },
    { key: "SHINY_CHARM", target: 4 },
    { key: "AMULET_COIN", target: 5, soft: true }
  ];

  /* The splice list, in the guide's priority order. A rarer carrier jumps the queue when it shows up. */
  var steps = [
    { id: "s1", kind: "learn", who: "staller", from: "tutor", moves: ["DARK_VOID"], extra: ["SKETCH"],
      title: "Dark Void and Sketch", how: "Fuse the tutor onto the staller, learn Dark Void and two Sketches (or one Sketch plus Powder Snow from Jynx), then unsplice." },
    { id: "s2", kind: "learn", who: "staller", moves: ["MAT_BLOCK"], rare: true, sketch: true,
      title: "Mat Block", how: "Very few carriers, so take one whenever it appears. Can also be Sketched." },
    { id: "s3", kind: "learn", who: "killer", moves: ["SALT_CURE"], title: "Salt Cure", how: "Garganacl line." },
    { id: "s4", kind: "learn", who: "carry", moves: ["ENTRAINMENT"], title: "Entrainment",
      how: "Regigigas holds it until the final fusion hands it to Jynx." },
    { id: "s5", kind: "learn", who: "runner", anyOf: ["RUINATION", "NATURES_MADNESS"], title: "Ruination or Nature's Madness",
      how: "Halves the target's HP for safer catches. Only the Treasures of Ruin and the Tapus learn these." },
    { id: "s6", kind: "learn", who: "runner", anyOf: ["GASTRO_ACID", "CORE_ENFORCER"], title: "Gastro Acid on the runner",
      how: "So Teddiurk can answer Neutralizing Gas without switching. Core Enforcer (Zygarde) also works." },
    { id: "s7", kind: "learn", who: "killer", moves: ["LEECH_SEED"], title: "Leech Seed", how: "The heal that re-arms Sturdy every turn." },
    { id: "s8", kind: "learn", who: "killer", moves: ["SOAK"], title: "Soak", how: "Makes the boss pure Water: Salt Cure doubles and Grass-types can be seeded." },
    { id: "s9", kind: "learn", who: "killer", moves: ["HEAL_BLOCK"], title: "Heal Block", how: "Yamask no longer learns it by level, so it needs its own splice." },
    { id: "s10", kind: "fuse", who: "killer", need: "sturdy", title: "Sturdy fusion (keep fused)",
      how: "Yamask first, so it keeps Purifying Salt and gains Sturdy. The partner's typing must leave the fusion Rock, Ground or Steel for sandstorm immunity." },
    { id: "s11", kind: "learn", who: "partner", moves: ["GASTRO_ACID"], title: "Gastro Acid on the partner", how: "For problem abilities during boss fights." },
    { id: "s12", kind: "learn", who: "partner", moves: ["CURSE", "DISABLE"], title: "Curse and Disable",
      how: "One wild Pokémon with both saves a splicer." },
    { id: "s13", kind: "learn", who: "staller", moves: ["POWDER_SNOW"], sketch: true, title: "Powder Snow", how: "Can be Sketched, or learned from Jynx." },
    { id: "s14", kind: "carbos", who: "carry", title: "Carbos on the carry", how: "Fuse a wild Carbos holder on, unfuse, repeat until 31. They move to Jynx at the final fusion." },
    { id: "s15", kind: "carbos", who: "staller", title: "Carbos on the staller", how: "Same fuse-and-dump until 31." },
    { id: "s16", kind: "fuse", who: "staller", need: "lureFast", title: "Fast lure fusion (keep fused)",
      how: "Gourgeist first. Mega Pidgeot is Grex's pick for Dark Void builds; an Arena Trap Dugtrio or Illuminate Starmie also keeps two lures with more Speed." },
    { id: "s17", kind: "fuse", who: "runner", need: "lure", title: "Lure fusion for the runner (keep fused)",
      how: "Teddiursa first. A hidden-ability Golurk adds No Guard and Ghost typing; any No Guard, Illuminate, Arena Trap or Commander Pokémon works." },
    { id: "s18", kind: "fuse", who: "partner", need: "normalize", title: "Jynx + Regigigas (keep fused)",
      how: "The last fusion before running. Jynx first for Psychic Surge, Regigigas second for Normalize." }
  ];

  /* Guide notes for the forced bosses. Everything else in a boss dossier is computed from game data. */
  var bossNotes = {
    SLITHER_WING: {
      level: "danger",
      problem: "Scrappy is its passive, so Entrainment cannot remove it and its Normalized moves still hit Ghosts. Dual Wingbeat hits twice and breaks Sturdy. Morning Sun heals.",
      plan: [
        "Do not lead Jynxgigas.",
        "Yamazone alone: Leech Seed first so Sturdy re-arms every turn, then Heal Block, Soak, Salt Cure.",
        "Or open with Gastro Acid, which also switches the passive off, then use the standard line.",
        "If it uses Dual Wingbeat: Disable it after a safe turn (Gouot's entry-turn Mat Block, or the Reviver Seed).",
        "When it is one turn from dead, let it KO a spare Pokémon so Gouot enters without taking a hit."
      ]
    },
    BRUTE_BONNET: {
      level: "care",
      problem: "Grass-type, so Leech Seed fails. Dark-type, so Prankster status moves aimed at it fail. Ingrain and Synthesis heal. Sucker Punch has priority.",
      plan: ["Soak before Leech Seed.", "Heal Block early.", "Psychic Terrain blocks Sucker Punch against grounded Pokémon."]
    },
    IRON_THORNS: {
      level: "care",
      problem: "Sand Stream is its passive: sandstorm chips after the Leech Seed heal. Pin Missile is multi-hit. Stealth Rock.",
      plan: ["Yamazone's Rock, Ground or Steel half makes it sandstorm-immune.", "Once it has Normalize, Pin Missile cannot hit a Ghost.", "Nothing to do about Stealth Rock."]
    },
    FLUTTER_MANE: {
      level: "care",
      problem: "Perish Song hits you regardless of type (bosses are immune). Dazzling, its passive, blocks priority moves aimed at it. Mean Look.",
      plan: ["Switch out before the third turn of Perish Song and come back; Curse on Jynxgigas is the natural pivot.", "Outspeed it instead of relying on Prankster moves."]
    },
    SCREAM_TAIL: {
      level: "care",
      problem: "Perish Song hits you regardless of type (bosses are immune). Wish and Rest heal.",
      plan: ["Switch out before the third turn of Perish Song and come back.", "Heal Block."]
    },
    ROARING_MOON: { level: "ok", problem: "Dark-type: Prankster status moves aimed at it fail. Roost heals.", plan: ["Tailwind still works, because it targets your own side.", "Heal Block."] },
    GOUGING_FIRE: { level: "ok", problem: "Burning Bulwark and Morning Sun.", plan: ["Nothing special: its attacks become Normal-type. Purifying Salt covers the burn.", "Heal Block."] },
    IRON_HANDS: { level: "ok", problem: "Arm Thrust is multi-hit; Focus Punch, Fake Out, Whirlwind.", plan: ["Once it has Normalize none of its attacks hit a Ghost.", "Whirlwind can drag another Pokémon in: switch back."] },
    IRON_CROWN: { level: "ok", problem: "Tachyon Cutter is multi-hit.", plan: ["Once it has Normalize it cannot hit a Ghost."] },
    IRON_BOULDER: { level: "ok", problem: "Mighty Cleave ignores Protect.", plan: ["Irrelevant here: its attacks become Normal-type."] }
  };

  var eternatusCases = [
    { when: "Carries many Carbos", problem: "It outspeeds Jynxgigas and hits before Entrainment lands.", plan: "Whimsicott first: Prankster Tailwind, then Entrainment." },
    { when: "Fused with Zygarde (Power Construct)", problem: "Entrainment and Skill Swap cannot overwrite the ability.", plan: "Yamazone line only: Sturdy and the Leech Seed loop, no Normalize." },
    { when: "Fused with Calyrex, Reshiram or Zekrom", problem: "Unnerve blocks berries; Turboblaze and Teravolt ignore Sturdy.", plan: "Entrainment replaces the ability either way, so the standard line works. Gastro Acid is the fallback." },
    { when: "Fused with Miraidon", problem: "Electric Terrain blocks sleep.", plan: "Jynxgigas's Psychic Surge overwrites it; it only matters for Dark Void." }
  ];

  var standardLine = [
    { t: "Lead Jynxgigas and Terastallize Ghost.", d: "It moves first: Timid, 31 Carbos, and Psychic Terrain blocks priority." },
    { t: "Entrainment.", d: "The boss now has Normalize: every move it uses is Normal-type and cannot hit a Ghost. Paradox bosses keep their passive; Eternatus has none." },
    { t: "Curse.", d: "Jynxgigas drops to half HP, which is fine. The boss loses a quarter of its HP each turn while Mini Black Hole takes an item a turn." },
    { t: "Switch to Yamazone: Heal Block, Leech Seed, Soak, Salt Cure.", d: "In that order. Soak makes the boss pure Water, which doubles Salt Cure." },
    { t: "One turn before it dies, switch Gouot in.", d: "Safe, because the boss cannot hit a Ghost. Gouot on the field at the end makes the next wave a double." }
  ];

  /* When Normalize cannot protect you (Scrappy as a passive, or an ability Entrainment cannot replace). */
  var sturdyLine = [
    { t: "Lead Yamazone, not Jynxgigas.", d: "Without Normalize protecting it, Jynxgigas has no Sturdy and falls to the first hit." },
    { t: "Leech Seed first.", d: "The drain heals Yamazone to full every turn, which re-arms Sturdy. Two Wide Lens make it always hit." },
    { t: "Heal Block, then Soak, then Salt Cure.", d: "Heal Block lasts 5 turns: reapply it. Soak makes the boss pure Water, which doubles Salt Cure." },
    { t: "A move that hits more than once breaks Sturdy.", d: "Disable it after it has been used once. You need one safe turn first: Gouot's entry-turn Mat Block, or the Reviver Seed." },
    { t: "One turn before it dies, let it KO a spare Pokémon so Gouot enters without taking a hit.", d: "Gouot must be on the field when the battle ends. Mat Block on its entry turn, Dark Void after." }
  ];

  /* Ball rules live in shopRules; the two-on-the-field rule is step 1 of safeCapture; the free shop is in the Shop panel. */
  var catching = [
    "A shiny on a normal wave: Master Ball it if you cannot afford to lose it. Shinies have a 2× catch bonus, so a Rogue Ball usually works on anything you can weaken first.",
    "Running low on balls: catch something that is not a boss with Rogue Balls just to reach a shop."
  ];

  var freeSlots = [
    { name: "Whimsicott", how: "Catch one: it has Prankster and Tailwind by itself.",
      why: "Priority Tailwind doubles your side's Speed for four turns, so Jynxgigas still moves before an Eternatus that has eaten Carbos. It works against Dark-type bosses too, because it targets your own side." },
    { name: "Mold Breaker + Gastro Acid", how: "Catch a Mold Breaker Pokémon and fuse a Gastro Acid user onto it.",
      why: "For the abilities that stop your status moves: Good as Gold blocks them, Magic Bounce reflects them, and Magic Guard ignores damage over time on X0 waves where you cannot Roar. Mold Breaker Roar also removes such a Pokémon on normal waves." }
  ];

  var safeCapture = [
    { t: "Teddiurk: Roar the Pokémon you don't want.", d: "Not possible on X0 waves: bosses cannot be forced out. Balls cannot be thrown while two wild Pokémon are on the field." },
    { t: "Jynxgigas: Entrainment on the target.", d: "It now has Normalize and cannot hurt your Ghosts." },
    { t: "Teddiurk: Ruination or Nature's Madness. Gouot: Dark Void.", d: "Half HP and asleep." },
    { t: "Throw balls until it stays in.", d: "Slow, but it costs no Master Ball and the shop afterwards restocks you." }
  ];

  var troubleshooting = [
    { q: "Yamazone does not heal to full and dies after a few turns",
      intro: "Sturdy only works at full HP, and Leech Seed against a boss heals far more than Yamazone's whole bar. Something is chipping you after the heal, or the seed is not there. Check in this order:",
      list: [
        "Fusion order. The summary must show Sturdy as the ability and Purifying Salt as the passive. If Yamask was second in the fusion it kept neither.",
        "Status. Poison and burn from the enemy tokens tick after the heal. Purifying Salt as the passive is the fix; Lum Berries only mask it.",
        "Weather and hazards. Sandstorm chips after the heal, so the Sturdy half must be Rock, Ground or Steel. Salt Cure on you hurts double if your fusion is Water or Steel.",
        "The seed itself. Leech Seed is 90 % accurate without two Wide Lens, fails on Grass-types (Soak first), does nothing through Magic Guard and hurts you through Liquid Ooze.",
        "Curse. Here Curse belongs to Jynxgigas. Cursing with Yamazone leaves it at half HP with Sturdy down.",
        "Multi-hit moves and Parental Bond kill through Sturdy outright. That is a Normalize or Scrappy problem, not a healing one."
      ] },
    { q: "Doubles stop happening",
      intro: "Gouot was not on the field when the previous battle ended, or it was fainted or its abilities were suppressed (Gastro Acid, Neutralizing Gas). A fainted or suppressed lure does not count. Get Gouot back on the field; the Doubles chain panel shows which sources count right now. Forced bosses are never doubles." },
    { q: "The wave started with the wrong Pokémon out",
      intro: "Do not switch the right one straight in: a normal switch takes a hit. Switch to one of your two extra Pokémon and let it be knocked out. The Pokémon you send in after a faint enters without being attacked, so the correct one comes in safely." },
    { q: "Mat Block fails", intro: "It only works on Gouot's first turn after entering the field. Use it on the switch-in turn and Dark Void after." },
    { q: "Entrainment fails or does nothing",
      intro: "Some abilities cannot be replaced (Comatose, Power Construct on a Zygarde fusion, and the form-change abilities). Good as Gold blocks it and Magic Bounce reflects it: Mold Breaker Gastro Acid first. Against Slither Wing it works, but Scrappy is the passive and still lets its moves hit Ghosts." },
    { q: "A Neutralizing Gas Pokémon is the one you want", intro: "Gastro Acid it first, which turns your lures and Run Away back on, then follow the safe-capture steps." },
    { q: "A boss outspeeds you", intro: "Whimsicott's Tailwind, or more eggs on Jynxgigas. Carbos are capped by the Speed IV, so a low Speed IV on the partner is a permanent handicap." }
  ];

  var variants = [
    { name: "Kyogre + Delcatty (“Kyotty”)", change: "Regigigas becomes Delcatty (Normalize) and Jynx becomes Kyogre (Mold Breaker passive).",
      trade: "Loses Psychic Terrain; gains Mold Breaker for Gholdengo-type problems. Kyogre carries the early game." },
    { name: "Orbeetle as the partner", change: "Start Blipbug when the Jynx or Celebi passive is not unlocked.",
      trade: "Slower: compensate with more Lucky and Golden Eggs. A Gigantamax Orbeetle must be Dynamaxed with a Max Mushroom before it can Terastallize." },
    { name: "Antique Sinistea + Gholdengo boss killer", change: "Antique Sinistea (Sturdy passive) finished with Gholdengo for Steel typing and Good as Gold.",
      trade: "Good as Gold blocks the status moves some Paradox Pokémon fall back on. Grex called it experimental in July 2026." }
  ];

  var speedNotes = [
    "Only Gouot and Jynxgigas need levels, and only for Speed: about 400,000 Speed by wave 5850, roughly level 25,000.",
    "Speed comes from a +Speed nature, 10 Soul Dew, 31 Carbos and levels. Levels come from Lucky and Golden Eggs on the EXP you earn from catches. Fleeing earns none.",
    "Rare Candies and Candy Jars are wasted picks for this build.",
    "Reference from Grex's wave 1152 run: Gouot level 2,300 with 42,900 Speed, the partner level 3,100 with 50,300 Speed, runner and boss killer level 1,900."
  ];

  var shopRules = [
    "Down a Master Ball: lock the Master tier and reroll until one appears.",
    "Down on Rogue Balls: reroll for the pack of five.",
    "Never an egg. Lucky and Golden Eggs are not sold: they only come off wild Pokémon, by Thief, Mini Black Hole or a catch.",
    "Never a lure once you run: Gouot and Teddiurk's lure abilities guarantee every wave. In the carry phase, take one.",
    "Otherwise anything Ultra tier or better.",
    "With a Lock Capsule: reroll normally until you see two Ultra-tier items or one Rogue-tier item, then lock and reroll."
  ];

  var sources = [
    { label: "Grex, Endless Entrainment Normalize Build (PokéRogue wiki)", url: "https://wiki.pokerogue.net/guides:endless_normalize_build" },
    { label: "Community high-level Endless guide", url: "https://docs.google.com/document/d/1vAgiz1xfT3Ul-ZEmP7B4saDt_kX-_mnAIe3pu8kv-rk" },
    { label: "PokéRogue source, pagefaultgames/pokerogue (live branch, 1.12.0.11)", url: "https://github.com/pagefaultgames/pokerogue/tree/e4e9b5383be7c9e171d32a9daaea2658d475c521" },
    { label: "Sandstorm's PokéRogue SearchDex", url: "https://github.com/Sandstormer/PokeRogue-Dex" },
    { label: "PokéRogue wiki: Endless Mode", url: "https://wiki.pokerogue.net/gameplay:modes:endless" }
  ];

  return {
    ROLE_ORDER: ROLE_ORDER, roles: roles, needs: needs, finalTeam: finalTeam, itemInfo: itemInfo, bagTargets: bagTargets,
    steps: steps, bossNotes: bossNotes, eternatusCases: eternatusCases, standardLine: standardLine, safeCapture: safeCapture,
    troubleshooting: troubleshooting, variants: variants, speedNotes: speedNotes, shopRules: shopRules, sources: sources,
    sturdyLine: sturdyLine, catching: catching, freeSlots: freeSlots,
    STARTER_POINTS: 15, FINAL_WAVE: 5850
  };
})();
