"""Manage invite links.  Run inside the container:

    docker compose exec app python -m app.invites create --label "ACME HR" --base-url https://tools.example.com
    docker compose exec app python -m app.invites list
    docker compose exec app python -m app.invites revoke <id>
"""
import argparse
import os
import sys

from .config import Settings
from .services.invites import InviteStore


def main(argv: list[str] | None = None, settings: Settings | None = None) -> int:
    settings = settings or Settings()
    p = argparse.ArgumentParser(prog="python -m app.invites", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create", help="create a new invite link")
    c.add_argument("--label", required=True, help="who it is for, e.g. 'ACME HR'")
    c.add_argument("--days", type=int, default=settings.invite_ttl_days, help=f"validity (default {settings.invite_ttl_days})")
    c.add_argument("--base-url", default=os.environ.get("CBT_PUBLIC_URL", "https://YOUR-DOMAIN"), help="public address of the site")
    sub.add_parser("list", help="show all invites and their usage")
    r = sub.add_parser("revoke", help="disable an invite immediately")
    r.add_argument("id")
    args = p.parse_args(argv)

    store = InviteStore(settings)
    if args.cmd == "create":
        if not 1 <= args.days <= 90:
            print("--days must be between 1 and 90", file=sys.stderr)
            return 2
        inv, token = store.create(args.label, args.days)
        print(f"\nInvite created for “{inv.label}”  (id {inv.id}, valid until {inv.expires_at})\n")
        print(f"  {args.base_url.rstrip('/')}/invite/{token}\n")
        print("This link is shown only once. Anyone who has it can use the app until it expires or you revoke it.")
        print(f"Guests get: {settings.invite_max_files_per_batch} files per batch, {settings.invite_max_file_mb} MB per file, "
              f"{settings.invite_images_per_day} images per day.")
        return 0
    if args.cmd == "list":
        rows = store.invites()
        if not rows:
            print("No invites yet.")
        now = store.now()
        for i in rows:
            print(f"{i.id}  {i.status(now):8}  {i.label:24.24}  expires {i.expires_at[:10]}  "
                  f"today {store.images_today(i.id)}/{settings.invite_images_per_day}  total {store.total_images(i.id)}  "
                  f"last used {store.last_used(i.id) or '-'}")
        return 0
    hit = store.revoke(args.id)
    print(f"Revoked {hit.id} (“{hit.label}”)." if hit else "No active invite with that id.")
    return 0 if hit else 1


if __name__ == "__main__":
    raise SystemExit(main())
