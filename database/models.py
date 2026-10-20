"""
database/models.py
==================

Declarative SQLAlchemy 2.x models for the ShaMart domain (``Product`` and
``Order``). Models inherit from the ``Base`` defined in ``database.connection``
so that the whole schema is owned by the ``database/`` package.
"""

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func

from .connection import Base


class Product(Base):
    """A purchasable item in the ShaMart storefront catalog."""

    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=False, index=True)
    price = Column(Float, nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    rating = Column(Float, default=4.5)
    image_url = Column(String(500), nullable=True)

    def to_dict(self):
        """Serialize to a JSON-safe dict.

        ``image`` and ``currency`` are convenience aliases consumed by the
        plain-JavaScript storefront; ``image_url`` remains the canonical field.
        """
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "price": self.price,
            "stock": self.stock,
            "rating": self.rating,
            "image_url": self.image_url,
            "image": self.image_url,
            "currency": "USD",
        }

    def __repr__(self):
        return f"<Product id={self.id} name={self.name!r} stock={self.stock}>"


class Order(Base):
    """A customer order header.

    Line items are validated against, and reconciled with, product stock at
    creation time; the persisted row captures the order's financial + status
    metadata.
    """

    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_name = Column(String(120), nullable=False)
    customer_email = Column(String(120), nullable=False)
    shipping_address = Column(String(300), nullable=False)
    total_amount = Column(Float, nullable=False)
    status = Column(String(50), default="CONFIRMED")
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "customer_name": self.customer_name,
            "customer_email": self.customer_email,
            "shipping_address": self.shipping_address,
            "total_amount": self.total_amount,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Order id={self.id} customer={self.customer_name!r} status={self.status}>"
