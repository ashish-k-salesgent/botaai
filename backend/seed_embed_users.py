"""Seed user1–user5 as support agents on SG-routes tenant."""
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import select

load_dotenv(Path(__file__).parent / ".env")

from auth import hash_password
from database import SessionLocal, Tenant, User, init_db
from models import _gen_id, _utc_now_iso

CLIENT_ID = "botaai_892ae1e0-579"
PASSWORD = "Admin@123"

USERS = [
    ("user1@sg-routes.com", "User One", "support"),
    ("user2@sg-routes.com", "User Two", "support"),
    ("user3@sg-routes.com", "User Three", "developer"),
    ("user4@sg-routes.com", "User Four", "qa"),
    ("user5@sg-routes.com", "User Five", "viewer"),
]


async def main():
    await init_db()
    async with SessionLocal() as session:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.client_id == CLIENT_ID))
        ).scalar_one_or_none()
        if not tenant:
            print(f"Tenant not found for client_id={CLIENT_ID}")
            return
        for email, name, role in USERS:
            existing = (
                await session.execute(select(User).where(User.email == email))
            ).scalar_one_or_none()
            if existing:
                print(f"skip {email} (exists)")
                continue
            session.add(
                User(
                    id=_gen_id(),
                    email=email,
                    name=name,
                    password_hash=hash_password(PASSWORD),
                    role=role,
                    tenant_id=tenant.id,
                    active=True,
                    created_at=_utc_now_iso(),
                )
            )
            print(f"created {email} ({role})")
        await session.commit()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
