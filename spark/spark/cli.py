"""Administrative CLI utility for SparkDhi role management and audit logging.

Usage:
    python -m spark.cli grant-founder <email> [--by <admin>] [--reason <reason>]
    python -m spark.cli revoke-founder <email> [--by <admin>] [--reason <reason>]
    python -m spark.cli list-audit-log [--email <email>]
"""
import argparse
import sys
from datetime import datetime, timezone
from sqlmodel import select

from .models import User, RoleAuditLog, get_session, init_db


def grant_founder(email: str, granted_by: str = "cli_admin", reason: str = "Administrative grant via CLI") -> dict:
    """Safely grant the 'founder' role to an existing user account and record an audit log."""
    clean_email = email.strip().lower()
    with get_session() as session:
        user = session.exec(select(User).where(User.email == clean_email)).first()
        if not user:
            print(f"[ERROR] User with email '{clean_email}' not found.")
            return {"ok": False, "error": "user_not_found"}

        prev_role = getattr(user, "role", "user") or "user"
        if prev_role == "founder":
            print(f"[INFO] User '{clean_email}' already holds the 'founder' role.")
            return {"ok": True, "user_id": user.id, "role": "founder", "already_founder": True}

        user.role = "founder"
        session.add(user)

        # Record audit trail
        audit_entry = RoleAuditLog(
            user_id=user.id,
            granted_by=granted_by,
            role_granted="founder",
            previous_role=prev_role,
            reason=reason or "Administrative CLI role grant",
            created_at=datetime.now(timezone.utc),
        )
        session.add(audit_entry)
        session.commit()
        session.refresh(user)

        print(f"[SUCCESS] User '{clean_email}' (ID: {user.id}) upgraded from '{prev_role}' to 'founder'. Audit record created.")
        return {
            "ok": True,
            "user_id": user.id,
            "email": user.email,
            "previous_role": prev_role,
            "role": user.role,
            "audit_id": audit_entry.id,
        }


def revoke_founder(email: str, revoked_by: str = "cli_admin", reason: str = "Administrative revoke via CLI") -> dict:
    """Revoke founder privileges from a user account and record an audit log."""
    clean_email = email.strip().lower()
    with get_session() as session:
        user = session.exec(select(User).where(User.email == clean_email)).first()
        if not user:
            print(f"[ERROR] User with email '{clean_email}' not found.")
            return {"ok": False, "error": "user_not_found"}

        prev_role = getattr(user, "role", "user") or "user"
        user.role = "user"
        session.add(user)

        # Record audit trail
        audit_entry = RoleAuditLog(
            user_id=user.id,
            granted_by=revoked_by,
            role_granted="user",
            previous_role=prev_role,
            reason=reason or "Administrative CLI role revocation",
            created_at=datetime.now(timezone.utc),
        )
        session.add(audit_entry)
        session.commit()
        session.refresh(user)

        print(f"[SUCCESS] User '{clean_email}' (ID: {user.id}) role reset to 'user'. Audit record created.")
        return {
            "ok": True,
            "user_id": user.id,
            "email": user.email,
            "previous_role": prev_role,
            "role": user.role,
            "audit_id": audit_entry.id,
        }


def list_audit_log(email: str = None) -> list:
    """List role audit log entries, optionally filtered by user email."""
    with get_session() as session:
        if email:
            clean_email = email.strip().lower()
            user = session.exec(select(User).where(User.email == clean_email)).first()
            if not user:
                print(f"[WARN] User with email '{clean_email}' not found.")
                return []
            records = session.exec(
                select(RoleAuditLog).where(RoleAuditLog.user_id == user.id).order_by(RoleAuditLog.created_at.desc())
            ).all()
        else:
            records = session.exec(
                select(RoleAuditLog).order_by(RoleAuditLog.created_at.desc())
            ).all()

        print(f"=== Role Audit Log ({len(records)} entries) ===")
        results = []
        for r in records:
            item = {
                "id": r.id,
                "user_id": r.user_id,
                "role_granted": r.role_granted,
                "previous_role": r.previous_role,
                "granted_by": r.granted_by,
                "reason": r.reason,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            results.append(item)
            print(f"[{item['created_at']}] User {r.user_id} -> '{r.role_granted}' (was '{r.previous_role}') by {r.granted_by}. Reason: {r.reason}")
        return results


def main():
    parser = argparse.ArgumentParser(description="SparkDhi Administrative CLI")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # grant-founder
    grant_p = subparsers.add_parser("grant-founder", help="Grant founder role to user")
    grant_p.add_argument("email", help="User email address")
    grant_p.add_argument("--by", default="cli_admin", help="Admin username/identifier")
    grant_p.add_argument("--reason", default="Administrative CLI grant", help="Audit rationale")

    # revoke-founder
    revoke_p = subparsers.add_parser("revoke-founder", help="Revoke founder role from user")
    revoke_p.add_argument("email", help="User email address")
    revoke_p.add_argument("--by", default="cli_admin", help="Admin username/identifier")
    revoke_p.add_argument("--reason", default="Administrative CLI revocation", help="Audit rationale")

    # list-audit-log
    log_p = subparsers.add_parser("list-audit-log", help="Display role audit log")
    log_p.add_argument("--email", default=None, help="Filter by user email")

    args = parser.parse_args()

    # Ensure DB is initialized
    init_db()

    if args.command == "grant-founder":
        res = grant_founder(args.email, granted_by=args.by, reason=args.reason)
        sys.exit(0 if res.get("ok") else 1)
    elif args.command == "revoke-founder":
        res = revoke_founder(args.email, revoked_by=args.by, reason=args.reason)
        sys.exit(0 if res.get("ok") else 1)
    elif args.command == "list-audit-log":
        list_audit_log(args.email)
        sys.exit(0)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
