"""The 50 fictional sample accounts every new database is seeded with (app.accounts).

Generated from fixed lists with a fixed random seed, so every database gets the same 50 accounts.
Names, addresses and balances are invented. Each entry has the shape of app.accounts.AccountIn.
"""

import random
from decimal import Decimal

_FIRST = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "David",
    "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah",
    "Carlos", "Karen", "Daniel", "Lisa", "Matthew", "Nancy", "Anthony", "Sandra", "Mark", "Ashley",
    "Wei", "Priya", "Andrew", "Emily", "Joshua", "Michelle", "Kenji", "Amanda",
]  # fmt: skip
_LAST = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez",
    "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore",
    "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Clark", "Lewis", "Nguyen",
    "Patel", "Kim", "Walker", "Young", "Allen", "King", "Wright", "Scott",
]  # fmt: skip
_STREETS = [
    "Maple Ave", "Oak St", "Pine Rd", "Cedar Ln", "Elm St", "Birch Dr", "Willow Way",
    "Lakeview Blvd", "Park Pl", "Hillcrest Rd", "Sunset Ave", "River Rd", "Highland Ave",
    "Main St", "Church St",
]  # fmt: skip
# (city, state, ZIP prefix)
_CITIES = [
    ("Boston", "MA", "021"), ("New York", "NY", "100"), ("Philadelphia", "PA", "191"),
    ("Chicago", "IL", "606"), ("Austin", "TX", "787"), ("Denver", "CO", "802"),
    ("Seattle", "WA", "981"), ("San Diego", "CA", "921"), ("Atlanta", "GA", "303"),
    ("Charlotte", "NC", "282"), ("Columbus", "OH", "432"), ("Phoenix", "AZ", "850"),
    ("Minneapolis", "MN", "554"), ("Nashville", "TN", "372"), ("Portland", "OR", "972"),
]  # fmt: skip
_TYPES = ["Standard", "Standard", "IRA", "IRA", "Joint"]


def _generate(count: int) -> list[dict]:
    rng = random.Random(13334)
    accounts = []
    for _ in range(count):
        city, state, zip_prefix = rng.choice(_CITIES)
        accounts.append(
            {
                "first_name": rng.choice(_FIRST),
                "last_name": rng.choice(_LAST),
                "address": {
                    "street1": f"{rng.randint(10, 9899)} {rng.choice(_STREETS)}",
                    "street2": f"Apt {rng.randint(1, 40)}" if rng.random() < 0.25 else None,
                    "city": city,
                    "state": state,
                    "zip": f"{zip_prefix}{rng.randint(1, 99):02d}",
                },
                "account_type": rng.choice(_TYPES),
                "cash_balance": Decimal(rng.randint(0, 50_000_000)) / 100,
            }
        )
    return accounts


SAMPLE_ACCOUNTS = _generate(50)
