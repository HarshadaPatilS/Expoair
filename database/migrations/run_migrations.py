import os
import sys

# Add backend directory to sys.path so we can import connection and schema
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "backend")))

from database.connection import engine, Base
import database.schema # Import schemas to register them on Base.metadata

def init_db():
    print("Initializing database...")
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized successfully!")

if __name__ == "__main__":
    init_db()
