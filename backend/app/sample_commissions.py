"""The sample commissions every new database is seeded with (app.commissions).

For each account that exists when the commissions table is created, and for each of the six months
May-October 2026: a $10.00 Monthly fee on the 1st, and 20 Per Order commissions of $10.00-$15.00 on
random days of that month. Percentage and Minimum fees have no samples. A fixed random seed per
account makes every database get the same charges for the same account IDs.
"""

import calendar
import random
from datetime import date
from decimal import Decimal

MONTHS = [(2026, m) for m in range(5, 11)]
MONTHLY_FEE = Decimal("10.00")
ORDERS_PER_MONTH = 20
ORDER_FEE_CENTS = (1000, 1500)


def sample_commissions(account_id: int) -> list[tuple[date, str, Decimal]]:
    """(charged_on, commission_type, amount) rows for one account, oldest first."""
    rng = random.Random(f"commissions-13850-{account_id}")
    rows = []
    for year, month in MONTHS:
        days = calendar.monthrange(year, month)[1]
        rows.append((date(year, month, 1), "Monthly", MONTHLY_FEE))
        orders = sorted(
            (date(year, month, rng.randint(1, days)), Decimal(rng.randint(*ORDER_FEE_CENTS)) / 100)
            for _ in range(ORDERS_PER_MONTH)
        )
        rows += [(day, "Per Order", amount) for day, amount in orders]
    return rows
