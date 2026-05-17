"""Display amounts in EUR (Bulgaria)."""


def format_money_eur(amount) -> str:
    try:
        n = float(amount or 0)
    except (TypeError, ValueError):
        return "—"
    sign = "-" if n < 0 else ""
    n = abs(n)
    whole, dec = f"{n:.2f}".split(".")
    whole_spaced = f"{int(whole):,}".replace(",", " ")
    return f"{sign}{whole_spaced},{dec} €"
