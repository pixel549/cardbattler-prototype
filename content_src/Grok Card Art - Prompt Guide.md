# Grok Card Art — Universal Prompt Language & Instructions

The goal of this document is to give Grok a consistent shared vocabulary for card art.
Every card prompt should be built on the **Master System Prompt** below,
then extended with the **type**, **tag**, and **rarity** vocabulary from the sections that follow.

---

## 1. Master System Prompt
> **Paste this at the start of every Grok conversation, or pin it as a system instruction.**

```
You are generating card art for a dark cyberpunk card game called CARDBATTLER.

HARD RULES (never break these):
• Portrait orientation, 3:4 ratio.
• NO text, numbers, labels, or UI elements anywhere in the image.
• NO card frames, card borders, or game UI chrome.
• NO realistic human faces — stylised cyborg, robotic, or fully abstract figures only.
• Background must be dark (near-black #0A0A10). Never a bright or white background.
• Subject fills roughly 70% of the frame. Leave a subtle glow halo around the subject.

ART STYLE:
Dark neon cyberpunk. Hard-edge geometric shapes fused with organic tech. Neon circuit-trace
glows on dark carbon/matte surfaces. Film noir contrast — deep shadows, pinpoint highlights.
Reference style: Nier: Automata item art × Cyberpunk 2077 skill icons × dark Magic: The Gathering sci-fi sets.

COMPOSITION:
Each card art conveys ONE clear action or state. No busy collage art.
The dominant colour comes from the card's TYPE (see below).
Secondary accent colour comes from the card's primary TAG.
Background has a faint circuit-board texture (barely visible at 10–15% opacity).
```

---

## 2. Card Type Colour Palette & Visual Language

Use the TYPE to set the dominant colour and compositional mood.

| Type | Dominant Colour | Hex | Visual Mood |
|------|----------------|-----|-------------|
| **Attack** | Hot red → orange | `#CC2200` → `#FF6600` | Kinetic, aggressive, impact-forward |
| **Defense** | Electric cyan → blue | `#00CCDD` → `#0055FF` | Solid, geometric, protective |
| **Support** | Bioluminescent green → teal | `#00FF88` → `#009966` | Organic, flowing, restorative |
| **Utility** | Cold violet → silver-white | `#8844FF` → `#CCCCFF` | Cerebral, abstract, analytical |
| **Status / Junk** | Corrupted grey → sickly green | `#445566` → `#667744` | Broken, glitched, parasitic |
| **Skill** | Amber gold → prismatic | `#FFAA00` → iridescent | Unique, high-value, versatile |

### Attack — Visual Vocabulary
Attack art should *feel like impact*. The image must convey motion and force.

Compositional sub-types (pick based on card name/effect):

| Sub-type | Cards (examples) | Visual Elements |
|----------|-----------------|-----------------|
| **Melee / Contact** | Strike, Rootkit Stab | Close-up strike or blade contact; motion blur on weapon; shatter/impact sparks at contact point |
| **Projectile** | Burst Shot, Ricochet, Heavy Shot, Burst Cannon | Projectile in flight; muzzle flash or launch trail; shallow depth-of-field; speed lines |
| **Beam / Lance** | RAM Lance, Plasma Lance, Chain Bolt | Sustained energy beam crossing frame; charged emitter in corner; lens flare at origin |
| **AoE / Explosive** | Logic Bomb, Heat Burst, Broadcast Surge, Sweep Pulse, Scatterfire | Radial shockwave expanding outward; subject at epicentre; secondary debris |
| **Debuff-Attack** | Corrode Dart, Malware Seeder | Fluid/bio-organic element (acid drip, malware slug) fused with kinetic impact; dual-colour splash |
| **Drain / Heist** | Kill Switch, Credit Heist | Extraction motion; data being pulled toward viewer; target silhouette fading |

### Defense — Visual Vocabulary
Defense art should feel **immovable and radiating outward**.
- Hexagonal energy wall or shield dome assembling from geometric fragments
- Concentric ripple rings radiating from barrier surface
- Barrier is translucent with internal circuit-lines
- For *Firewall*-tagged cards: blue-hex tiles cascade into frame from edges

### Support — Visual Vocabulary
Support art should feel **alive and flowing inward** (healing directed toward a subject).
- Nanite swarms as glowing green micro-particles converging
- Bioluminescent tendrils curling inward around a central point
- For Nanoflow cards: flowing streams of warm amber-green light
- Avoid hard edges — curves, waves, organic motion

### Utility — Visual Vocabulary
Utility art should feel **intelligent and layered**.
- Holographic data panels stacked in 3D depth
- Code cascades (matrix-style but neon violet/white, not green)
- AR scan beams sweeping across a subject
- Abstract: overlapping semi-transparent geometry

### Status / Junk — Visual Vocabulary
Status art should feel **wrong and corrupted**.
- Subject appears incomplete: missing pixel sections, RGB-split artefacts, glitch bands
- Parts of the image are "void" — solid black patches eating into the subject
- Dirty grey and sickly green palette
- No clean lines — everything is fragmented, low-res, degraded

---

## 3. Tag-Specific Visual Accent Elements

After establishing type colour and mood, layer in one (max two) tag visual from this table.

| Tag | Visual Accent to Add |
|-----|---------------------|
| **Firewall** | Blue hexagonal energy tiles/wall in mid-ground |
| **Corrode** | Acid-green fluid dripping from cracked circuit panels |
| **Exploit** | A broken padlock or open data-port, red intrusion vector glow |
| **Nanoflow** | Flowing amber-green nanite streams, like tiny luminous rivers |
| **Overclocked** | Blazing gold/orange aura; circuits visibly crackling with too much power |
| **Underclock** | Ice-blue frost creeping across circuit traces; particle effects slowed/frozen |
| **OneShot** | A single glowing charge indicator (fuse, countdown ring); singular burst of light |
| **Volatile** | Unstable arcing electricity; sparks flying; visibly barely-contained energy |
| **Power** (persistent) | Steady persistent aura radiating from a central installed object; calm, not explosive |
| **XCost** | A RAM meter/gauge visibly draining to empty; "all-in" energy expenditure visual |
| **Leak** | Dark iridescent fluid draining from cracks in a system chassis |
| **Sensor Glitch** | Radar/sonar overlay with false echo rings; interference ripples |
| **Target Spoof** | Ghost double-exposure of a figure — one solid, one translucent decoy |
| **AOE** | Radial shockwave or pulse ring expanding outward from epicentre |
| **Scry** | A large eye or camera-lens peering down through a fanned stack of translucent cards |
| **Topdeck / Retrieve** | A spotlight or tractor-beam pulling a single glowing card from a stack |
| **Tutor** | A search beam scanning through a deck spread, one card highlighted |
| **Purge / Cleanup** | Digital files/fragments being incinerated; ember particle effects |
| **Patch** | Nano-stitches or circuit-repair seams closing over a damaged surface |
| **Shuffle / Cycle** | Fanned cards mid-spin, motion blur creating a circular sweep |
| **RAM** | A visible RAM bar or crystal battery pack, glowing and full/empty as context demands |

---

## 4. Rarity / Card Set Visual Treatment

| Prefix | Set Name | Visual Treatment |
|--------|----------|-----------------|
| **C-** | Core | Clean, minimal. Matte carbon surface. Single-colour glow, no lens flares. Simple subject, uncluttered background. |
| **NC-** | Standard | Polished, moderate complexity. Two-tone glow. Background has light circuit texture. |
| **UC-** | Uncommon | Enhanced glow intensity. Background has visible circuit geometry. Subtle lens bloom. |
| **R-** | Rare | Dramatic, high-contrast lighting. Complex background layers. Lens flares. Subject is more detailed/intricate. |
| **P-** | Prism | Prismatic / iridescent colour shift on edges. Maximum subject detail. Background has full environment suggestion. Unique feel vs. other sets. |

---

## 5. Per-Card Prompt Formula

Build every card prompt using this template:

```
[1-sentence subject description]: [WHAT is depicted and WHAT ACTION is happening].
[Tag visual element sentence].
[Rarity treatment sentence].
Cyberpunk card art. Dark near-black background with faint circuit texture.
[Card type] dominant colour: [HEX]. No text. No card border. Portrait orientation.
```

### Worked Examples

---

**C-001 · Strike · Attack · Core · 1 RAM**

> A hacker's fist wrapped in red circuit-traces delivers a kinetic data-strike; the impact point erupts in hot-orange sparks and fragmented data-pixels.
> No tag accent needed (Core).
> Core finish: clean matte surface, single red glow halo, no lens flares, uncluttered.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Attack dominant colour: #CC2200. No text. No card border. Portrait orientation.

---

**NC-003 · Firewall Patch · Defense · Firewall · 2 RAM**

> A hexagonal cyan energy wall assembles from crystalline data-blocks; electric arcs bridge each glowing blue tile as they lock into place.
> Firewall accent: blue hex-tiles cascading in from the frame edges.
> Standard finish: two-tone cyan and electric-blue edge glow, light circuit geometry in background.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Defense dominant colour: #00CCDD. No text. No card border. Portrait orientation.

---

**NC-009 · Spoof Ping · Utility · Target Spoof · 2 RAM**

> A ghosted double-exposure: one solid cyborg silhouette and one translucent decoy phase-shifted beside it; interference rings ripple outward.
> Target Spoof accent: double-exposure ghost figure, one solid and one translucent.
> Standard finish: violet and silver-white two-tone glow.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Utility dominant colour: #8844FF. No text. No card border. Portrait orientation.

---

**NC-025 · Zero-Day Injector · Attack · Exploit + OneShot · 2 RAM**

> A sleek matte-black syringe packed with volatile red exploit code fires its singular devastating payload into an open data-port.
> Exploit accent: a broken digital padlock fragmenting on impact, red glow. OneShot accent: a single glowing countdown ring — one shot remaining.
> Standard finish: hot red and orange two-tone edge glow.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Attack dominant colour: #CC2200. No text. No card border. Portrait orientation.

---

**NC-058 · Daemon Thread · Support · Power + RAM · 2 RAM**

> A spectral AI process — translucent teal figure — sits installed and quietly radiating a steady pulse of +1 RAM per turn; a glowing RAM crystal floats before it.
> Power accent: calm persistent teal aura radiating from the installed figure. RAM accent: a glowing RAM-bar crystal clearly visible, partially charged.
> Standard finish: teal-green and amber two-tone glow.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Support dominant colour: #00FF88. No text. No card border. Portrait orientation.

---

**R-004 · Freeze RAM Use · Utility · Rare · 3 RAM**

> A RAM gauge encased in spreading ice-blue frost — all circuit pathways frozen mid-transfer, energy suspended in crystalline stasis; frost fractures crawl across dark panels.
> No tag accent (unique effect, frost IS the visual).
> Rare finish: dramatic high-contrast light beam on frost crystals, lens flare at freeze origin, deep shadows, complex panel background.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Utility dominant colour: #8844FF with ice-blue (#AADDFF) secondary. No text. No card border. Portrait orientation.

---

**P-001 · Assimilate Weak · Utility · Prism · 3 RAM**

> A smaller fractured enemy silhouette is being absorbed into a stronger cyborg form; prismatic light fractures outward from the point of assimilation.
> Sensor Glitch / Overclocked tags visible: radar-echo interference rings on the absorbed target.
> Prism finish: iridescent colour shift on all glow edges — violet-to-amber; fully detailed environment suggestion; maximum complexity.
> Cyberpunk card art. Dark near-black background with faint circuit texture. Utility dominant colour: #FFAA00 prismatic. No text. No card border. Portrait orientation.

---

## 6. Troubleshooting Grok

**Grok adds text or numbers to the image:**
→ Append: `Absolutely no text, glyphs, numbers, letters, or UI labels anywhere in the image. Clean art only.`

**Grok adds a bright or white background:**
→ Append: `Background must be near-black (#0A0A10). No light backgrounds. No white. No grey gradients.`

**Grok makes all Attack cards look the same:**
→ Specify the sub-type explicitly (melee, projectile, beam, AoE, debuff-attack, drain).
→ Add the exact motion/action: `motion blur on the weapon`, `radial shockwave expanding outward`, `beam crossing full width of frame`, etc.

**Grok ignores the cyberpunk style:**
→ Append: `Reference art: Nier: Automata weapon icons. Cyberpunk 2077 cyberware UI. Magic: The Gathering — Phyrexia or Kamigawa: Neon Dynasty card art.`

**Grok produces human-looking faces:**
→ Append: `Figures must be robotic, cyborg, or fully abstract — no realistic human facial features.`

**Grok makes Defense look too similar to Attack:**
- **Attack** must always include: `kinetic motion blur`, `impact sparks`, `explosive discharge`
- **Defense** must always include: `static solidity`, `concentric barrier rings`, `repulsion or containment`

**Grok makes Support too similar to Utility:**
- **Support** → organic, warm, flowing INWARD (toward a subject)
- **Utility** → cold, geometric, expanding/scanning OUTWARD (toward viewer or horizon)

---

## 7. Quick-Reference Cheat Sheet

```
ATTACK   → red/orange · impact · kinetic · weapon-forward
DEFENSE  → cyan/blue  · static · geometric · radiating outward
SUPPORT  → green/teal · organic · flowing inward
UTILITY  → violet     · cerebral · layered · scanning
STATUS   → grey/sick  · corrupted · glitched · broken
SKILL    → gold       · prismatic · unique

TAGS: add ONE visual accent element from the tag table

RARITY:
  C  → clean, minimal, matte
  NC → standard glow, light detail
  UC → bright glow, visible circuit geo
  R  → dramatic, lens flare, complex
  P  → prismatic, iridescent, max detail

ALWAYS: dark bg · no text · no UI · no human faces · portrait 3:4
```
