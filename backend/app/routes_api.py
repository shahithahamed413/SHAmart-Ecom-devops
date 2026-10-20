"""
app/routes_api.py
=================

Storefront REST endpoints for the Vanilla-JS / Vite frontend:

* GET  /api/v1/products            list catalog (optional ``?category=`` / ``?q=``)
* GET  /api/v1/products/<id>       single product (404 when missing)
* POST /api/v1/orders              create an order + atomically decrement stock

All persistence flows through the ``database`` package's session factory, and
every write runs inside one transaction that rolls back cleanly on failure.
"""

import logging

from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select

from database import Order, Product, get_db_session

logger = logging.getLogger("shamart.api")

api_bp = Blueprint("api", __name__, url_prefix="/api/v1")


class OrderValidationError(Exception):
    """Business-rule violation that maps to a 4xx response."""

    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _parse_positive_int(value, field):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise OrderValidationError(f"'{field}' must be an integer", 400)
    if parsed <= 0:
        raise OrderValidationError(f"'{field}' must be greater than zero", 400)
    return parsed


# --------------------------------------------------------------------------- #
# Products
# --------------------------------------------------------------------------- #
@api_bp.route("/products", methods=["GET"])
def list_products():
    """Return the catalog, optionally filtered by ``?category=`` or ``?q=``."""
    with get_db_session() as session:
        stmt = select(Product)

        category = request.args.get("category")
        if category and category.lower() != "all":
            stmt = stmt.where(Product.category == category)

        search = request.args.get("q")
        if search:
            like = f"%{search}%"
            stmt = stmt.where(
                or_(Product.name.ilike(like), Product.description.ilike(like))
            )

        stmt = stmt.order_by(Product.id)
        products = session.execute(stmt).scalars().all()
        return jsonify([product.to_dict() for product in products]), 200


@api_bp.route("/products/<int:product_id>", methods=["GET"])
def get_product(product_id):
    """Return a single product or 404 when it does not exist."""
    with get_db_session() as session:
        product = session.get(Product, product_id)
        if product is None:
            return (
                jsonify({"error": "Product not found", "product_id": product_id}),
                404,
            )
        return jsonify(product.to_dict()), 200


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #
@api_bp.route("/orders", methods=["POST"])
def create_order():
    """Validate input, verify/decrement stock and persist an order atomically."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be valid JSON"}), 400

    required = [
        "customer_name",
        "customer_email",
        "shipping_address",
        "total_amount",
        "items",
    ]
    missing = [field for field in required if payload.get(field) in (None, "", [])]
    if missing:
        return jsonify({"error": "Missing required fields", "missing": missing}), 400

    try:
        total_amount = float(payload["total_amount"])
    except (TypeError, ValueError):
        return jsonify({"error": "'total_amount' must be a number"}), 400
    if total_amount < 0:
        return jsonify({"error": "'total_amount' must not be negative"}), 400

    customer_email = str(payload["customer_email"]).strip()
    if "@" not in customer_email:
        return jsonify({"error": "'customer_email' is not a valid email address"}), 400

    items = payload["items"]
    if not isinstance(items, list) or not items:
        return jsonify({"error": "'items' must be a non-empty list"}), 400

    # Normalise + validate line items before touching the database.
    normalised_items = []
    for index, item in enumerate(items):
        if not isinstance(item, dict) or "product_id" not in item or "quantity" not in item:
            return (
                jsonify(
                    {"error": f"items[{index}] must contain 'product_id' and 'quantity'"}
                ),
                400,
            )
        try:
            product_id = _parse_positive_int(
                item["product_id"], f"items[{index}].product_id"
            )
            quantity = _parse_positive_int(
                item["quantity"], f"items[{index}].quantity"
            )
        except OrderValidationError as exc:
            return jsonify({"error": exc.message}), exc.status_code
        normalised_items.append((product_id, quantity))

    try:
        with get_db_session() as session:
            order = Order(
                customer_name=str(payload["customer_name"]).strip(),
                customer_email=customer_email,
                shipping_address=str(payload["shipping_address"]).strip(),
                total_amount=total_amount,
                status="CONFIRMED",
            )
            session.add(order)

            # Lock affected product rows for the transaction so concurrent
            # orders cannot oversell the same inventory.
            for product_id, quantity in normalised_items:
                product = session.execute(
                    select(Product).where(Product.id == product_id).with_for_update()
                ).scalar_one_or_none()

                if product is None:
                    raise OrderValidationError(f"Product {product_id} not found", 404)
                if product.stock < quantity:
                    raise OrderValidationError(
                        f"Insufficient stock for '{product.name}' "
                        f"(requested {quantity}, available {product.stock})",
                        409,
                    )
                product.stock -= quantity

            session.flush()  # assigns order.id within the transaction
            order_id = order.id

        logger.info(
            "Order %s confirmed for %s (%s line items).",
            order_id,
            customer_email,
            len(normalised_items),
        )
        return jsonify({"order_id": order_id, "status": "CONFIRMED"}), 201

    except OrderValidationError as exc:
        return jsonify({"error": exc.message, "order_id": None}), exc.status_code
    except Exception as exc:  # noqa: BLE001 - never leak a 500 without rollback
        logger.exception("Order transaction failed and was rolled back.")
        return jsonify({"error": "Failed to create order", "detail": str(exc)}), 500
