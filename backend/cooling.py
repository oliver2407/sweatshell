"""
Cooling physics for SweatShell.

Every constant here is an assumption we show on the dashboard. Do not hide them:
judges will ask, and the honest answer is stronger than a big number.
"""

# Latent heat of vaporisation of water at ambient temperature (~25 C).
# 2442 kJ/kg -> 2.44 kJ per gram. We use 2.45 as the commonly quoted figure.
LATENT_HEAT_KJ_PER_G = 2.45

# Coefficient of performance of a typical residential split-system air conditioner.
# An AC moves ~3 kWh of heat for every 1 kWh of electricity it consumes, so the
# electricity we "save" is the heat we removed DIVIDED by the COP, not equal to it.
# Getting this wrong overstates the saving by ~3x.
ASSUMED_AC_COP = 3.0

# Grid emissions intensity, kg CO2 per kWh. Victoria is coal-heavy.
# Replace with the current DCCEEW figure before presenting.
GRID_KG_CO2_PER_KWH = 0.79

ASSUMPTIONS = {
    "latent_heat_kj_per_g": LATENT_HEAT_KJ_PER_G,
    "assumed_ac_cop": ASSUMED_AC_COP,
    "grid_kg_co2_per_kwh": GRID_KG_CO2_PER_KWH,
    "notes": [
        "Heat removed assumes all mass lost from the gel left as water vapour.",
        "Electricity saved = heat removed / COP. It is not equal to heat removed.",
        "Evaporative cooling weakens as humidity rises; humidity is logged alongside.",
        "A heat lamp is not the sun: no UV, and indoors there is no sky for the roof "
        "to radiate to. We make no radiative-cooling claim.",
    ],
}


def heat_removed_kj(grams_evaporated: float) -> float:
    """Heat carried away by evaporating `grams_evaporated` of water."""
    return max(0.0, grams_evaporated) * LATENT_HEAT_KJ_PER_G


def ac_electricity_saved_kwh(grams_evaporated: float) -> float:
    """
    Electricity an air conditioner would have used to remove the same heat.

    kJ -> kWh is /3600, then /COP because the AC only pays for a fraction of the
    heat it moves.
    """
    return heat_removed_kj(grams_evaporated) / 3600.0 / ASSUMED_AC_COP


def co2_avoided_kg(grams_evaporated: float) -> float:
    return ac_electricity_saved_kwh(grams_evaporated) * GRID_KG_CO2_PER_KWH


def water_cost(grams_evaporated: float, delta_c: float, hours: float) -> float | None:
    """
    Litres of water per degree C of cooling per hour.

    This is the single most important number in the project. It is the direct
    answer to "you are pouring water on a roof in a drought country". Never let a
    judge have to work it out themselves.

    Returns None when there is not enough signal to divide by yet.
    """
    if delta_c <= 0.1 or hours <= 0.01:
        return None
    return (grams_evaporated / 1000.0) / (delta_c * hours)


def deltas(inside: dict[str, float | None]) -> dict[str, float | None]:
    """
    Split the cooling into what each layer actually contributes.

    Reporting only box1 - box3 hides which trick did the work, and hides whether
    the gel beats a wet cloth at all. Box 4 exists so we can answer that.

      box1  bare metal
      box2  eggshell coat only
      box3  eggshell + bio gel   (SweatShell)
      box4  eggshell + wet cloth (control: does the gel beat a wet rag?)
    """

    def sub(a: str, b: str) -> float | None:
        if inside.get(a) is None or inside.get(b) is None:
            return None
        return round(inside[a] - inside[b], 2)

    return {
        # What the reflective coat alone buys us.
        "reflect_delta": sub("box1", "box2"),
        # What sweating adds on top of the coat. This is SweatShell's real claim.
        "sweat_delta": sub("box2", "box3"),
        # Headline number for the hero tile.
        "total_delta": sub("box1", "box3"),
        # Positive means the gel beat a plain wet cloth. If this sits near zero,
        # say so: the honest finding is that the cloth was already doing the work.
        "gel_vs_cloth": sub("box4", "box3"),
    }
