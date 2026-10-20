"""
database/seed.py
================

Standalone, idempotent database seeder for ShaMart's initial tech inventory.

Run either of::

    python -m database.seed
    python database/seed.py

Behavior
--------
* Ensures the schema exists (``init_db()``).
* If the ``products`` table is already populated, it exits without changes.
* Otherwise it inserts at least six realistic developer-merch items.

Pass ``--reset`` to wipe the catalog and reseed from scratch.
"""

import logging
import sys

from .connection import get_db_session, init_db
from .models import Product

logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("shamart.seed")


SEED_PRODUCTS = [
    {
        "name": "Kubernetes Hoodie",
        "description": "Heavyweight fleece hoodie with an embroidered Helm wheel "
        "and 'kubectl apply -f warm.yaml' on the sleeve. Unisex fit.",
        "category": "apparel",
        "price": 59.00,
        "stock": 75,
        "rating": 4.8,
        "image_url": "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=640&q=80",
    },
    {
        "name": "Docker Whale Desk Toy",
        "description": "Hand-painted resin Docker whale figurine that keeps your "
        "containers company while they ship. ~9cm tall.",
        "category": "collectibles",
        "price": 24.50,
        "stock": 140,
        "rating": 4.6,
        "image_url": "https://images.unsplash.com/photo-1608889175123-8ee362201f81?w=640&q=80",
    },
    {
        "name": "Linux Terminal Mug",
        "description": "15oz ceramic mug printed with a root shell prompt. "
        "'sudo refill coffee' on the base. Microwave safe.",
        "category": "drinkware",
        "price": 18.00,
        "stock": 210,
        "rating": 4.7,
        "image_url": "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=640&q=80",
    },
    {
        "name": "Mechanical Keyboard (TKL)",
        "description": "Tenkeyless hot-swappable mechanical keyboard, brown tactile "
        "switches, PBT keycaps and per-key RGB. USB-C detachable.",
        "category": "hardware",
        "price": 129.99,
        "stock": 40,
        "rating": 4.9,
        "image_url": "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=640&q=80",
    },
    {
        "name": "Git Branch Sticker Pack",
        "description": "12 weatherproof vinyl laptop stickers: merge conflicts, "
        "rebases, 404s and other developer classics.",
        "category": "stickers",
        "price": 8.99,
        "stock": 500,
        "rating": 4.5,
        "image_url": "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=640&q=80",
    },
    {
        "name": "Terraform State Water Bottle",
        "description": "18oz double-wall insulated stainless bottle inscribed "
        "'It works on my plan.' Keeps cold drinks cold from commit to deploy.",
        "category": "drinkware",
        "price": 27.00,
        "stock": 160,
        "rating": 4.4,
        "image_url": "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=640&q=80",
    },
    {
        "name": "Prometheus Grafana Cap",
        "description": "Adjustable snapback with a gradient flame embroidered front. "
        "Scrape your metrics in style.",
        "category": "headwear",
        "price": 22.00,
        "stock": 95,
        "rating": 4.3,
        "image_url": "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=640&q=80",
    },
    {
        "name": "Serverless Canvas Tote",
        "description": "Sturdy cotton-canvas tote sized for a 15\" laptop, charger "
        "and conference swag. Load balancing not included.",
        "category": "accessories",
        "price": 19.99,
        "stock": 230,
        "rating": 4.2,
        "image_url": "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=640&q=80",
    },
]


def seed(reset=False):
    """Ensure the schema, then populate the catalog if (or when reset is) empty."""
    init_db()

    with get_db_session() as session:
        existing = session.query(Product).count()

        if reset and existing:
            deleted = session.query(Product).delete()
            logger.info("Reset requested: removed %s existing product(s).", deleted)
            existing = 0

        if existing and not reset:
            logger.info(
                "Products table already populated (%s rows); skipping seed.", existing
            )
            return 0

        for data in SEED_PRODUCTS:
            session.add(Product(**data))

        logger.info("Seeding %s developer-merch products.", len(SEED_PRODUCTS))
        return len(SEED_PRODUCTS)


if __name__ == "__main__":
    count = seed(reset="--reset" in sys.argv[1:])
    print(f"Seed complete: {count} product(s) inserted.")
