#!/usr/bin/env python3
"""
Patches gamedata.json to fix all content issues:
1. Convert core card RawText effects to proper engine ops
2. Convert non-core card RawText effects where possible
3. Create enemy action cards with distinct behaviors
4. Update enemy rotations to use those cards
5. Add actBalance defaults
6. Add weight to all encounters
"""
import json, sys, re, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "..", "src", "data", "gamedata.json")

with open(DATA_PATH) as f:
    data = json.load(f)

cards = data["cards"]
enemies = data["enemies"]
encounters = data["encounters"]

# ============================================================
# 1. Convert player card RawText effects to proper ops
# ============================================================

def parse_rawtext(text):
    """Try to convert a RawText string to a proper effect op."""
    t = text.strip().rstrip(".")
    
    # "Gain X Firewall" -> GainBlock
    m = re.match(r"Gain (\d+) Firewall", t)
    if m:
        return {"op": "GainBlock", "target": "Self", "amount": int(m.group(1))}
    
    # "Gain X Block" -> GainBlock
    m = re.match(r"Gain (\d+) Block", t)
    if m:
        return {"op": "GainBlock", "target": "Self", "amount": int(m.group(1))}
    
    # "Heal X HP" -> Heal
    m = re.match(r"Heal (\d+) HP", t)
    if m:
        return {"op": "Heal", "target": "Self", "amount": int(m.group(1))}
    
    # "Gain X RAM" -> GainRAM
    m = re.match(r"Gain (\d+) RAM", t)
    if m:
        return {"op": "GainRAM", "target": "Self", "amount": int(m.group(1))}
    
    # "Restore X RAM" -> GainRAM
    m = re.match(r"Restore (\d+) RAM", t)
    if m:
        return {"op": "GainRAM", "target": "Self", "amount": int(m.group(1))}
    
    # "+X RAM" -> GainRAM
    m = re.match(r"\+(\d+) RAM", t)
    if m:
        return {"op": "GainRAM", "target": "Self", "amount": int(m.group(1))}
    
    # "Lose X RAM" -> LoseRAM (on enemy = debuff to player)
    m = re.match(r"Lose (\d+) RAM", t)
    if m:
        return {"op": "LoseRAM", "target": "Self", "amount": int(m.group(1))}

    # "Draw X card(s)" -> DrawCards
    m = re.match(r"Draw (\d+) cards?", t, re.IGNORECASE)
    if m:
        return {"op": "DrawCards", "target": "Self", "amount": int(m.group(1))}
    
    # "Deal X damage" -> DealDamage
    m = re.match(r"Deal (\d+) damage", t, re.IGNORECASE)
    if m:
        return {"op": "DealDamage", "target": "Enemy", "amount": int(m.group(1))}
    
    # "Apply X Weak" -> ApplyStatus
    m = re.match(r"Apply (\d+) (Weak|Vulnerable)", t)
    if m:
        return {"op": "ApplyStatus", "target": "Enemy", "statusId": m.group(2), "stacks": int(m.group(1))}
    
    # "Gain X Nanoflow" -> treat as Heal (thematic equivalent)
    m = re.match(r"Gain (\d+) Nanoflow", t)
    if m:
        return {"op": "Heal", "target": "Self", "amount": int(m.group(1))}

    # "Apply X <StatusName>" -> ApplyStatus (generic)
    m = re.match(r"Apply (\d+) (\w[\w\s]*)", t)
    if m:
        return {"op": "ApplyStatus", "target": "Enemy", "statusId": m.group(2).strip(), "stacks": int(m.group(1))}
    
    return None


converted = 0
kept_raw = 0
for cid, card in cards.items():
    new_effects = []
    for eff in card["effects"]:
        if eff.get("op") == "RawText":
            parsed = parse_rawtext(eff.get("text", ""))
            if parsed:
                new_effects.append(parsed)
                converted += 1
            else:
                new_effects.append(eff)
                kept_raw += 1
        else:
            new_effects.append(eff)
    card["effects"] = new_effects

print(f"[patch] Converted {converted} RawText effects to proper ops, {kept_raw} remain as RawText")


# ============================================================
# 2. Create enemy action cards
# ============================================================

# Define a set of enemy action cards with real effects
# These are tagged "EnemyAction" so they skip finalMutation validation
enemy_cards = {
    # --- Basic attacks at various power levels ---
    "EA_STRIKE_4": {
        "id": "EA_STRIKE_4", "name": "Light Strike", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 4}]
    },
    "EA_STRIKE_6": {
        "id": "EA_STRIKE_6", "name": "Strike", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 6}]
    },
    "EA_STRIKE_8": {
        "id": "EA_STRIKE_8", "name": "Heavy Strike", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 8}]
    },
    "EA_STRIKE_10": {
        "id": "EA_STRIKE_10", "name": "Overclocked Strike", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 10}]
    },
    "EA_STRIKE_12": {
        "id": "EA_STRIKE_12", "name": "Power Surge", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 12}]
    },
    "EA_STRIKE_15": {
        "id": "EA_STRIKE_15", "name": "Overload Burst", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 15}]
    },
    "EA_STRIKE_20": {
        "id": "EA_STRIKE_20", "name": "System Crash", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 20}]
    },
    "EA_STRIKE_25": {
        "id": "EA_STRIKE_25", "name": "Core Meltdown", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 25}]
    },

    # --- Defense ---
    "EA_BLOCK_5": {
        "id": "EA_BLOCK_5", "name": "Patch Shield", "type": "Defense", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "GainBlock", "target": "Self", "amount": 5}]
    },
    "EA_BLOCK_8": {
        "id": "EA_BLOCK_8", "name": "Firewall Up", "type": "Defense", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "GainBlock", "target": "Self", "amount": 8}]
    },
    "EA_BLOCK_12": {
        "id": "EA_BLOCK_12", "name": "Hardened Shell", "type": "Defense", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "GainBlock", "target": "Self", "amount": 12}]
    },
    "EA_BLOCK_16": {
        "id": "EA_BLOCK_16", "name": "Fortified Protocol", "type": "Defense", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "GainBlock", "target": "Self", "amount": 16}]
    },

    # --- Attack + Block combos ---
    "EA_STRIKE_4_BLOCK_4": {
        "id": "EA_STRIKE_4_BLOCK_4", "name": "Defensive Jab", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 4},
            {"op": "GainBlock", "target": "Self", "amount": 4}
        ]
    },
    "EA_STRIKE_6_BLOCK_6": {
        "id": "EA_STRIKE_6_BLOCK_6", "name": "Counter Protocol", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 6},
            {"op": "GainBlock", "target": "Self", "amount": 6}
        ]
    },
    "EA_STRIKE_10_BLOCK_5": {
        "id": "EA_STRIKE_10_BLOCK_5", "name": "Shielded Assault", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 10},
            {"op": "GainBlock", "target": "Self", "amount": 5}
        ]
    },

    # --- Debuffs ---
    "EA_WEAK_1": {
        "id": "EA_WEAK_1", "name": "Signal Jam", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "ApplyStatus", "target": "Enemy", "statusId": "Weak", "stacks": 1}]
    },
    "EA_WEAK_2": {
        "id": "EA_WEAK_2", "name": "Deep Jam", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "ApplyStatus", "target": "Enemy", "statusId": "Weak", "stacks": 2}]
    },
    "EA_VULN_1": {
        "id": "EA_VULN_1", "name": "Expose Ports", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "ApplyStatus", "target": "Enemy", "statusId": "Vulnerable", "stacks": 1}]
    },
    "EA_VULN_2": {
        "id": "EA_VULN_2", "name": "Full Breach", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "ApplyStatus", "target": "Enemy", "statusId": "Vulnerable", "stacks": 2}]
    },

    # --- Attack + Debuff combos ---
    "EA_STRIKE_5_WEAK_1": {
        "id": "EA_STRIKE_5_WEAK_1", "name": "Disruptor Shot", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 5},
            {"op": "ApplyStatus", "target": "Enemy", "statusId": "Weak", "stacks": 1}
        ]
    },
    "EA_STRIKE_6_VULN_1": {
        "id": "EA_STRIKE_6_VULN_1", "name": "Piercing Shot", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 6},
            {"op": "ApplyStatus", "target": "Enemy", "statusId": "Vulnerable", "stacks": 1}
        ]
    },
    "EA_STRIKE_8_VULN_1": {
        "id": "EA_STRIKE_8_VULN_1", "name": "Armor Piercer", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 8},
            {"op": "ApplyStatus", "target": "Enemy", "statusId": "Vulnerable", "stacks": 1}
        ]
    },

    # --- Heal ---
    "EA_HEAL_5": {
        "id": "EA_HEAL_5", "name": "Self-Repair", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "Heal", "target": "Self", "amount": 5}]
    },
    "EA_HEAL_8": {
        "id": "EA_HEAL_8", "name": "System Restore", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "Heal", "target": "Self", "amount": 8}]
    },
    "EA_HEAL_12": {
        "id": "EA_HEAL_12", "name": "Full Restore", "type": "Skill", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "Heal", "target": "Self", "amount": 12}]
    },

    # --- Block + Heal ---
    "EA_BLOCK_6_HEAL_4": {
        "id": "EA_BLOCK_6_HEAL_4", "name": "Turtle Protocol", "type": "Defense", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "GainBlock", "target": "Self", "amount": 6},
            {"op": "Heal", "target": "Self", "amount": 4}
        ]
    },

    # --- Multi-hit ---
    "EA_MULTI_3x3": {
        "id": "EA_MULTI_3x3", "name": "Burst Fire", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 3},
            {"op": "DealDamage", "target": "Enemy", "amount": 3},
            {"op": "DealDamage", "target": "Enemy", "amount": 3}
        ]
    },
    "EA_MULTI_4x3": {
        "id": "EA_MULTI_4x3", "name": "Triple Shot", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 4},
            {"op": "DealDamage", "target": "Enemy", "amount": 4},
            {"op": "DealDamage", "target": "Enemy", "amount": 4}
        ]
    },

    # --- Big boss moves ---
    "EA_STRIKE_15_VULN_2": {
        "id": "EA_STRIKE_15_VULN_2", "name": "Devastating Strike", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "DealDamage", "target": "Enemy", "amount": 15},
            {"op": "ApplyStatus", "target": "Enemy", "statusId": "Vulnerable", "stacks": 2}
        ]
    },
    "EA_BLOCK_20_HEAL_8": {
        "id": "EA_BLOCK_20_HEAL_8", "name": "Emergency Protocols", "type": "Defense", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [
            {"op": "GainBlock", "target": "Self", "amount": 20},
            {"op": "Heal", "target": "Self", "amount": 8}
        ]
    },
    "EA_STRIKE_30": {
        "id": "EA_STRIKE_30", "name": "Obliterate", "type": "Attack", "costRAM": 0,
        "tags": ["EnemyAction"],
        "effects": [{"op": "DealDamage", "target": "Enemy", "amount": 30}]
    },
}

# Add all enemy cards to the cards dict
for cid, card in enemy_cards.items():
    cards[cid] = card

print(f"[patch] Added {len(enemy_cards)} enemy action cards")


# ============================================================
# 3. Assign enemy rotations based on their role/HP
# ============================================================

# Enemy archetypes based on 'extra' data in CSV (we don't have it in JSON,
# so we'll derive from name patterns and HP values)

def assign_rotation(enemy_id, enemy):
    hp = enemy["maxHP"]
    name = enemy["name"].lower()
    
    # Boss-tier (HP > 200)
    if hp > 200:
        if "heal" in name or "patch" in name or "cleric" in name or "medic" in name:
            return ["EA_STRIKE_12", "EA_BLOCK_16", "EA_HEAL_12", "EA_STRIKE_15_VULN_2", "EA_BLOCK_20_HEAL_8"]
        if "tank" in name or "goliath" in name or "titan" in name or "fortress" in name or "sentinel" in name:
            return ["EA_STRIKE_15", "EA_BLOCK_16", "EA_STRIKE_20", "EA_BLOCK_20_HEAL_8", "EA_STRIKE_25"]
        if "assassin" in name or "rogue" in name or "phantom" in name or "ghost" in name:
            return ["EA_STRIKE_20", "EA_VULN_2", "EA_STRIKE_25", "EA_MULTI_4x3", "EA_STRIKE_15_VULN_2"]
        # Default boss
        return ["EA_STRIKE_15", "EA_BLOCK_12", "EA_STRIKE_20", "EA_WEAK_2", "EA_STRIKE_25", "EA_BLOCK_16"]

    # Elite-tier (HP 100-200)
    if hp > 100:
        if "heal" in name or "patch" in name or "cleric" in name or "medic" in name:
            return ["EA_STRIKE_8", "EA_BLOCK_8", "EA_HEAL_8", "EA_STRIKE_10_BLOCK_5"]
        if "tank" in name or "bruiser" in name or "guardian" in name or "sentinel" in name:
            return ["EA_STRIKE_10", "EA_BLOCK_12", "EA_STRIKE_12", "EA_BLOCK_8"]
        if "sniper" in name or "assassin" in name or "rogue" in name:
            return ["EA_STRIKE_12", "EA_VULN_2", "EA_STRIKE_15", "EA_WEAK_1"]
        # Default elite
        return ["EA_STRIKE_10", "EA_BLOCK_8", "EA_STRIKE_12", "EA_STRIKE_8_VULN_1"]

    # Normal-tier (HP 50-100)
    if hp > 50:
        if "heal" in name or "patch" in name or "sprite" in name or "cleric" in name:
            return ["EA_STRIKE_4_BLOCK_4", "EA_HEAL_5", "EA_STRIKE_6"]
        if "tank" in name or "pod" in name or "firewall" in name or "guardian" in name or "shell" in name:
            return ["EA_BLOCK_8", "EA_STRIKE_6", "EA_STRIKE_4_BLOCK_4"]
        if "imp" in name or "signal" in name or "control" in name or "sapper" in name:
            return ["EA_WEAK_1", "EA_STRIKE_6", "EA_VULN_1", "EA_STRIKE_8"]
        if "drone" in name or "hacker" in name or "runner" in name:
            return ["EA_STRIKE_8", "EA_STRIKE_6", "EA_STRIKE_5_WEAK_1"]
        # Default normal (medium)
        return ["EA_STRIKE_6", "EA_STRIKE_8", "EA_BLOCK_5"]

    # Weak-tier (HP <= 50)
    if "heal" in name or "patch" in name or "sprite" in name:
        return ["EA_HEAL_5", "EA_STRIKE_4", "EA_BLOCK_5"]
    if "pod" in name or "firewall" in name or "shell" in name:
        return ["EA_BLOCK_5", "EA_STRIKE_4", "EA_BLOCK_5"]
    if "imp" in name or "rat" in name or "minion" in name:
        return ["EA_STRIKE_4", "EA_STRIKE_6", "EA_WEAK_1"]
    if "drone" in name or "hacker" in name:
        return ["EA_STRIKE_6", "EA_STRIKE_4", "EA_STRIKE_6"]
    # Default weak
    return ["EA_STRIKE_4", "EA_STRIKE_6", "EA_BLOCK_5"]


for eid, enemy in enemies.items():
    enemy["rotation"] = assign_rotation(eid, enemy)

print(f"[patch] Assigned rotations to {len(enemies)} enemies")


# ============================================================
# 4. Add weight to all encounters
# ============================================================
for eid, enc in encounters.items():
    if "weight" not in enc:
        enc["weight"] = 1.0

print(f"[patch] Added weight to {len(encounters)} encounters")


# ============================================================
# 5. Add actBalance defaults
# ============================================================
if not data.get("actBalance") or len(data["actBalance"]) == 0:
    data["actBalance"] = [
        {"act": 1, "enemyHpMult": 1.0, "enemyDmgMult": 1.0, "goldNormal": 25, "goldElite": 50, "goldBoss": 99},
        {"act": 2, "enemyHpMult": 1.3, "enemyDmgMult": 1.2, "goldNormal": 30, "goldElite": 60, "goldBoss": 120},
        {"act": 3, "enemyHpMult": 1.6, "enemyDmgMult": 1.4, "goldNormal": 35, "goldElite": 70, "goldBoss": 150},
    ]
    print("[patch] Added default actBalance for 3 acts")


# ============================================================
# 6. Update build timestamp
# ============================================================
from datetime import datetime, timezone
data["builtAt"] = datetime.now(timezone.utc).isoformat()
data["version"] = 2  # bump so old saves know this is patched

# Write
with open(DATA_PATH, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print(f"[patch] Wrote patched gamedata.json ({len(cards)} cards, {len(enemies)} enemies, {len(encounters)} encounters)")
