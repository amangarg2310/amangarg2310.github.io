#!/usr/bin/env python3
"""CLI: Generate a playbook for a specific domain."""

import argparse
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import PROJECT_ROOT
from synthesis.conflict_detector import detect_conflicts
from synthesis.playbook_builder import build_playbook

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Generate a playbook for a domain")
    parser.add_argument("domain", help="Domain key (e.g., product_marketing, growth)")
    parser.add_argument("--output", "-o", help="Output file path (default: playbooks_output/<domain>.json)")
    parser.add_argument("--detect-conflicts", action="store_true", help="Also run conflict detection")
    args = parser.parse_args()

    logger.info(f"Generating playbook for domain: {args.domain}")

    playbook = build_playbook(args.domain)

    if args.detect_conflicts:
        logger.info("Running conflict detection...")
        conflicts = detect_conflicts(args.domain)
        playbook["conflicts"] = conflicts

    # Save output
    output_dir = PROJECT_ROOT / "playbooks_output"
    output_dir.mkdir(exist_ok=True)
    output_path = Path(args.output) if args.output else output_dir / f"{args.domain}.json"

    with open(output_path, "w") as f:
        json.dump(playbook, f, indent=2)

    logger.info(f"Playbook saved to {output_path}")
    logger.info(f"  Sections: {len(playbook.get('sections', []))}")
    logger.info(f"  Conflicts: {len(playbook.get('conflicts', []))}")
    logger.info(f"  Sources: {playbook.get('total_sources', 0)}")
    logger.info(f"  Experts: {playbook.get('total_experts', 0)}")


if __name__ == "__main__":
    main()
